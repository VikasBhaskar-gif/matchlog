import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { env } from "../lib/env.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function ensureDatabaseSeeded() {
  const sslOption =
    env.NODE_ENV === "production" || env.DATABASE_URL.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : false;

  const sql = postgres(env.DATABASE_URL, { max: 1, ssl: sslOption });
  const db = drizzle(sql);

  try {
    // 1. Run migrations first so all tables & enums exist
    const migrationCandidates = [
      path.resolve(__dirname, "migrations"),
      path.resolve(__dirname, "../src/db/migrations"),
      path.resolve(__dirname, "../../src/db/migrations"),
      path.resolve(process.cwd(), "src/db/migrations"),
      path.resolve(process.cwd(), "backend/src/db/migrations"),
      path.resolve(process.cwd(), "dist/db/migrations"),
      path.resolve(process.cwd(), "backend/dist/db/migrations"),
    ];
    const migrationsFolder = migrationCandidates.find((p) => fs.existsSync(p));
    try {
      if (migrationsFolder) {
        console.log(`[DB] Running migrations from ${migrationsFolder}...`);
        await migrate(db, { migrationsFolder });
        console.log("[DB] Migrations finished successfully.");
      } else {
        console.warn("[DB] Migrations folder not found in candidates:", migrationCandidates);
      }
    } catch (migErr) {
      console.warn("[DB] Migrations notice (tables may already exist):", migErr);
    }

    // Ensure display_name column exists if dump references it
    try {
      await sql.unsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text;`);
    } catch {}

    // 2. Check if VikasBhaskar and teams already exist
    const vikasExists = await sql`SELECT id FROM users WHERE username = 'VikasBhaskar'`;
    const teamsExist = await sql`SELECT count(*) FROM teams`;
    const teamCount = parseInt(teamsExist[0]?.count ?? "0", 10);
    const vikasHash = "$argon2id$v=19$m=65536,t=3,p=4$NGhsYhkTDkrau9PG7tjWYg$oSv7AF9Cu0aDA1wFHTH0diYI5mdXJLtmgo28gFmAf60";

    if (vikasExists.length > 0 && teamCount > 0) {
      console.log("[DB] Database already contains VikasBhaskar and teams. Ensuring password is up to date.");
      await sql`UPDATE users SET password_hash = ${vikasHash} WHERE username = 'VikasBhaskar'`;
      try {
        const purged = await sql`DELETE FROM match_events WHERE external_id LIKE 'gen:goal:%'`;
        if (purged.count > 0) {
          console.log(`[DB] Purged ${purged.count} legacy gen:goal pseudo-events from database.`);
        }
      } catch (cleanErr) {
        console.warn("[DB] Could not purge legacy gen:goal events:", cleanErr);
      }
      return { ok: true, skipped: true, reason: "VikasBhaskar and teams already exist; password updated to amaterasu17" };
    }

    // 3. Database is missing VikasBhaskar or core teams, import data_dump.sql
    console.log("[DB] Importing initial data dump...");
    const dumpCandidates = [
      path.resolve(__dirname, "data_dump.sql"),
      path.resolve(__dirname, "db/data_dump.sql"),
      path.resolve(__dirname, "../db/data_dump.sql"),
      path.resolve(__dirname, "../src/db/data_dump.sql"),
      path.resolve(__dirname, "../../src/db/data_dump.sql"),
      path.resolve(process.cwd(), "src/db/data_dump.sql"),
      path.resolve(process.cwd(), "backend/src/db/data_dump.sql"),
      path.resolve(process.cwd(), "dist/db/data_dump.sql"),
      path.resolve(process.cwd(), "backend/dist/db/data_dump.sql"),
    ];
    const dumpPath = dumpCandidates.find((p) => fs.existsSync(p));
    if (!dumpPath) {
      const msg = `data_dump.sql not found in candidate paths: ${JSON.stringify(dumpCandidates)}`;
      console.warn("[DB]", msg);
      return { ok: false, reason: msg };
    }

    console.log("[DB] Reading data dump from:", dumpPath);
    const rawSql = fs.readFileSync(dumpPath, "utf-8");

    // Filter out comment lines so the first statement of every table isn't dropped!
    const cleanSql = rawSql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    const rawStatements = cleanSql
      .split(/;\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("INSERT INTO public."))
      .map((s) => (s.endsWith(";") ? s.slice(0, -1) : s) + " ON CONFLICT DO NOTHING;");

    const TABLE_INSERT_ORDER = [
      "public.competitions",
      "public.seasons",
      "public.competition_seasons",
      "public.teams",
      "public.users",
      "public.followed_competitions",
      "public.players",
      "public.followed_players",
      "public.followed_teams",
      "public.matches",
      "public.match_events",
      "public.match_players",
      "public.watched_matches",
      "public.player_of_match_votes",
      "public.match_reviews",
      "public.friend_activities",
      "public.sessions",
      "public.sync_logs",
    ];

    const stmtsByTable = new Map<string, string[]>();
    for (const table of TABLE_INSERT_ORDER) {
      stmtsByTable.set(table, []);
    }

    for (const stmt of rawStatements) {
      const m = stmt.match(/^INSERT INTO (public\.\w+)/);
      if (m && stmtsByTable.has(m[1])) {
        stmtsByTable.get(m[1])!.push(stmt);
      }
    }

    const batchSize = 100;
    let totalImported = 0;
    for (const table of TABLE_INSERT_ORDER) {
      const stmts = stmtsByTable.get(table) || [];
      if (stmts.length === 0) continue;
      console.log(`[DB] Seeding ${table} (${stmts.length} rows)...`);
      for (let i = 0; i < stmts.length; i += batchSize) {
        const batch = stmts.slice(i, i + batchSize).join("\n");
        await sql.unsafe(batch);
      }
      totalImported += stmts.length;
    }

    console.log(`[DB] Successfully imported ${totalImported} statements across all tables!`);

    await sql`UPDATE users SET password_hash = ${vikasHash} WHERE username = 'VikasBhaskar'`;
    console.log("[DB] Ensured VikasBhaskar password is set to amaterasu17.");

    return { ok: true, importedStatements: totalImported, dumpPath };
  } catch (err) {
    console.error("[DB] Migration / seeding error:", err);
    throw err;
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].includes("restore-dump")) {
  await ensureDatabaseSeeded();
}

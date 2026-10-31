import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { env } from "../lib/env.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { getDbSsl } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const dbLogs: string[] = [];
export function logDb(msg: string) {
  console.log(msg);
  dbLogs.push(`[${new Date().toISOString()}] ${msg}`);
  if (dbLogs.length > 100) dbLogs.shift();
}

export async function ensureDatabaseSeeded() {
  const sslOption = getDbSsl(env.DATABASE_URL);
  logDb(`[DB] Seeding started. Host: ${new URL(env.DATABASE_URL).hostname}, ssl: ${JSON.stringify(sslOption)}`);

  const sql = postgres(env.DATABASE_URL, { max: 5, ssl: sslOption, connect_timeout: 10 });
  const db = drizzle(sql);

  try {
    // 1. Run migrations to create/update all tables, enums, and indexes
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
    if (migrationsFolder) {
      logDb(`[DB] Running migrations from: ${migrationsFolder}`);
      await migrate(db, { migrationsFolder });
      logDb("[DB] Migrations finished successfully.");
    } else {
      logDb(`[DB] WARNING: Migrations folder not found in: ${JSON.stringify(migrationCandidates)}`);
    }

    // Ensure display_name column exists if dump references it
    try {
      await sql.unsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text;`);
    } catch {}

    // 2. Check if VikasBhaskar, teams, and matches already exist
    let vikasExists: any[] = [];
    let teamCount = 0;
    let matchCount = 0;
    try {
      vikasExists = await sql`SELECT id FROM users WHERE username = 'VikasBhaskar'`;
      const teamsExist = await sql`SELECT count(*) FROM teams`;
      teamCount = parseInt(teamsExist[0]?.count ?? "0", 10);
      const matchesExist = await sql`SELECT count(*) FROM matches`;
      matchCount = parseInt(matchesExist[0]?.count ?? "0", 10);
      logDb(`[DB] Counts: vikas=${vikasExists.length}, teams=${teamCount}, matches=${matchCount}`);
    } catch (checkErr: any) {
      logDb(`[DB] Tables check notice: ${checkErr?.message}`);
    }

    const vikasHash = "$argon2id$v=19$m=65536,t=3,p=4$NGhsYhkTDkrau9PG7tjWYg$oSv7AF9Cu0aDA1wFHTH0diYI5mdXJLtmgo28gFmAf60";

    if (vikasExists.length > 0 && teamCount > 50 && matchCount > 500) {
      logDb("[DB] Database already contains VikasBhaskar, teams, and matches. Ensuring password is up to date.");
      await sql`UPDATE users SET password_hash = ${vikasHash} WHERE username = 'VikasBhaskar'`;
      try {
        const purged = await sql`DELETE FROM match_events WHERE external_id LIKE 'gen:goal:%'`;
        if (purged.count > 0) {
          logDb(`[DB] Purged ${purged.count} legacy gen:goal pseudo-events from database.`);
        }
      } catch (cleanErr: any) {
        logDb(`[DB] Could not purge legacy gen:goal events: ${cleanErr?.message}`);
      }
      return { ok: true, skipped: true, reason: "Database already populated" };
    }

    // 3. Database is missing VikasBhaskar, core teams, or matches, import data_dump.sql
    logDb("[DB] Importing initial data dump...");
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
      logDb(`[DB] ${msg}`);
      return { ok: false, reason: msg };
    }

    logDb(`[DB] Reading data dump from: ${dumpPath}`);
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
      "public.matches",
      "public.users",
      "public.followed_competitions",
      "public.followed_teams",
      "public.players",
      "public.followed_players",
      "public.friend_requests",
      "public.friendships",
      "public.predictions",
      "public.predicted_goalscorers",
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
      logDb(`[DB] Seeding ${table} (${stmts.length} rows)...`);
      try {
        for (let i = 0; i < stmts.length; i += batchSize) {
          const batch = stmts.slice(i, i + batchSize).join("\n");
          await sql.unsafe(batch);
        }
        totalImported += stmts.length;
      } catch (tableErr: any) {
        logDb(`[DB] Error seeding ${table}: ${tableErr?.message}`);
      }
    }

    logDb(`[DB] Successfully imported ${totalImported} statements across all tables!`);

    await sql`UPDATE users SET password_hash = ${vikasHash} WHERE username = 'VikasBhaskar'`;
    console.log("[DB] Ensured VikasBhaskar password is set to amaterasu17.");

    // Ensure default friends and bilateral friendships exist
    try {
      const chelsea = await sql`SELECT id FROM teams WHERE name ILIKE '%chelsea%' LIMIT 1`;
      const chelseaId = chelsea[0]?.id;
      const vikas = await sql`SELECT id FROM users WHERE username = 'VikasBhaskar' LIMIT 1`;
      if (vikas.length > 0) {
        const vikasId = vikas[0].id;
        const defaultFriends = [
          { username: "AdrianMourinhoe", supportedTeamId: chelseaId },
          { username: "Tejas", supportedTeamId: null },
          { username: "ToastedOrange", supportedTeamId: null },
          { username: "charith", supportedTeamId: null },
          { username: "ved", supportedTeamId: null },
        ];
        for (const f of defaultFriends) {
          const existing = await sql`SELECT id FROM users WHERE username = ${f.username}`;
          let friendId = existing[0]?.id;
          if (!friendId) {
            const ins = await sql`
              INSERT INTO users (id, username, password_hash, supported_team_id, onboarding_completed, created_at, updated_at)
              VALUES (gen_random_uuid(), ${f.username}, ${vikasHash}, ${f.supportedTeamId ?? null}, true, NOW(), NOW())
              RETURNING id
            `;
            friendId = ins[0]?.id;
          }
          if (friendId) {
            const [uA, uB] = [vikasId, friendId].sort();
            await sql`
              INSERT INTO friendships (id, user_a_id, user_b_id, created_at)
              VALUES (gen_random_uuid(), ${uA}, ${uB}, NOW())
              ON CONFLICT DO NOTHING
            `;
          }
        }
      }
    } catch (fErr) {
      console.warn("[DB] Non-fatal error configuring default friends:", fErr);
    }

    return { ok: true, importedStatements: totalImported, dumpPath };
  } catch (err: any) {
    logDb(`[DB] FATAL ERROR in ensureDatabaseSeeded: ${err?.message} (${err?.code})`);
    console.error("[DB] Migration / seeding error:", err);
    throw err;
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].includes("restore-dump")) {
  await ensureDatabaseSeeded();
}

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
  const sql = postgres(env.DATABASE_URL, { max: 1 });
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
    if (migrationsFolder) {
      console.log(`[DB] Running migrations from ${migrationsFolder}...`);
      await migrate(db, { migrationsFolder });
      console.log("[DB] Migrations finished successfully.");
    } else {
      console.warn("[DB] Migrations folder not found in candidates:", migrationCandidates);
    }

    // 2. Check if users table already has data
    const userCount = await sql`SELECT count(*) FROM users`;
    if (parseInt(userCount[0].count, 10) > 0) {
      console.log("[DB] Database already contains users. Skipping data import.");
      return;
    }

    // 3. Database is empty, import data_dump.sql
    console.log("[DB] Database is empty. Importing initial data...");
    const dumpCandidates = [
      path.resolve(__dirname, "data_dump.sql"),
      path.resolve(__dirname, "../src/db/data_dump.sql"),
      path.resolve(__dirname, "../../src/db/data_dump.sql"),
      path.resolve(process.cwd(), "src/db/data_dump.sql"),
      path.resolve(process.cwd(), "backend/src/db/data_dump.sql"),
      path.resolve(process.cwd(), "dist/db/data_dump.sql"),
      path.resolve(process.cwd(), "backend/dist/db/data_dump.sql"),
    ];
    const dumpPath = dumpCandidates.find((p) => fs.existsSync(p));
    if (!dumpPath) {
      console.warn("[DB] data_dump.sql not found in candidate paths:", dumpCandidates);
      return;
    }

    console.log("[DB] Reading data dump from:", dumpPath);
    const rawSql = fs.readFileSync(dumpPath, "utf-8");

    // Clean SQL: filter out psql slash commands (\restrict, \unrestrict) and duplicate drizzle migration records
    const cleanLines = rawSql
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("\\")) return false;
        if (trimmed.startsWith("INSERT INTO drizzle.__drizzle_migrations")) return false;
        return true;
      });

    const cleanedSql = cleanLines.join("\n");

    console.log("[DB] Executing data dump inserts...");
    await sql.begin(async (tx) => {
      await tx.unsafe("SET session_replication_role = 'replica';");
      await tx.unsafe(cleanedSql);
      await tx.unsafe("SET session_replication_role = 'origin';");
    });

    console.log("[DB] Data dump successfully imported!");
  } catch (err) {
    console.error("[DB] Migration / seeding error:", err);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].includes("restore-dump")) {
  await ensureDatabaseSeeded();
}

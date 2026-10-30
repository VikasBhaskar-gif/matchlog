import postgres from "postgres";
import { env } from "../lib/env.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function ensureDatabaseSeeded() {
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  try {
    // Check if users table exists and has records
    const tables = await sql`
      SELECT tablename FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' AND tablename = 'users';
    `;
    
    let hasUsers = false;
    if (tables.length > 0) {
      const userCount = await sql`SELECT count(*) FROM users`;
      if (parseInt(userCount[0].count, 10) > 0) {
        hasUsers = true;
      }
    }

    if (hasUsers) {
      console.log("[DB] Database already initialized and contains users. Skipping dump import.");
      await sql.end();
      return;
    }

    console.log("[DB] Database is empty. Importing dump.sql...");
    const dumpCandidates = [
      path.resolve(__dirname, "dump.sql"),
      path.resolve(__dirname, "../src/db/dump.sql"),
      path.resolve(__dirname, "../../src/db/dump.sql"),
      path.resolve(process.cwd(), "src/db/dump.sql"),
      path.resolve(process.cwd(), "backend/src/db/dump.sql"),
    ];
    const dumpPath = dumpCandidates.find((p) => fs.existsSync(p));
    if (!dumpPath) {
      console.warn("[DB] dump.sql not found in candidate paths:", dumpCandidates);
      await sql.end();
      return;
    }
    console.log("[DB] Found dump.sql at:", dumpPath);

    console.log("[DB] Reading dump.sql...");
    const dumpContent = fs.readFileSync(dumpPath, "utf-8");
    
    // Execute dump
    await sql.unsafe(dumpContent);
    console.log("[DB] dump.sql successfully imported into database!");
  } catch (err) {
    console.error("[DB] Error in ensureDatabaseSeeded:", err);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].includes("restore-dump")) {
  await ensureDatabaseSeeded();
}

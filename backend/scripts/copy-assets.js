import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");

const distDb = path.join(backendRoot, "dist/db");
fs.mkdirSync(distDb, { recursive: true });

const migrationsSrc = path.join(backendRoot, "src/db/migrations");
const migrationsDest = path.join(distDb, "migrations");
if (fs.existsSync(migrationsSrc)) {
  fs.cpSync(migrationsSrc, migrationsDest, { recursive: true });
  console.log("[Build] Copied migrations to", migrationsDest);
}

const dataDumpSrc = path.join(backendRoot, "src/db/data_dump.sql");
const dataDumpDest = path.join(distDb, "data_dump.sql");
if (fs.existsSync(dataDumpSrc)) {
  fs.copyFileSync(dataDumpSrc, dataDumpDest);
  console.log("[Build] Copied data_dump.sql to", dataDumpDest);
}

console.log("[Build] Backend asset preparation complete.");

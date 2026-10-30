import { buildApp } from "./app.js";
import { env } from "./lib/env.js";
import { startRealtimeStatusWorker } from "./football/realtime-worker.js";
import { ensureDatabaseSeeded } from "./db/restore-dump.js";

// Ensure database is populated with teams, matches, and VikasBhaskar user
await ensureDatabaseSeeded();

const app = await buildApp();

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`Matchlog API listening on port ${env.PORT}`);
    startRealtimeStatusWorker();
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

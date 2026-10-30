import { buildApp } from "./app.js";
import { env } from "./lib/env.js";
import { startRealtimeStatusWorker } from "./football/realtime-worker.js";
import { ensureDatabaseSeeded } from "./db/restore-dump.js";

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Matchlog API listening on port ${env.PORT}`);

  // Seed database in background so port binds immediately and passes healthcheck
  ensureDatabaseSeeded()
    .then((res) => {
      app.log.info({ res }, "[DB] Database seeding completed successfully");
    })
    .catch((err) => {
      app.log.error(err, "[DB] Database seeding encountered an error");
    });

  startRealtimeStatusWorker();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

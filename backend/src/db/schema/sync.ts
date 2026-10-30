import { pgTable, uuid, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";

export const syncStatusEnum = pgEnum("sync_status", ["SUCCESS", "FAILURE", "PARTIAL"]);

export const syncLogs = pgTable("sync_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobName: text("job_name").notNull(), // e.g. "sync:fixtures", "sync:season"
  status: syncStatusEnum("status").notNull(),
  itemsProcessed: integer("items_processed").notNull().default(0),
  message: text("message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
});

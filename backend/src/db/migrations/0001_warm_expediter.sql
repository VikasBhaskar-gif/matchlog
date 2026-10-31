DO $$ BEGIN
 CREATE TYPE "public"."sync_status" AS ENUM('SUCCESS', 'FAILURE', 'PARTIAL');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"status" "sync_status" NOT NULL,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"message" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL
);

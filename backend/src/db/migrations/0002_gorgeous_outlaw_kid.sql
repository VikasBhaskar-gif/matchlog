DO $$ BEGIN
 CREATE TYPE "public"."match_source" AS ENUM('OPENFOOTBALL', 'API_FOOTBALL', 'DEMO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "source" "match_source" DEFAULT 'OPENFOOTBALL' NOT NULL;
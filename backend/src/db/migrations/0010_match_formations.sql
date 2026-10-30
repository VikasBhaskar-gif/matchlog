ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "home_formation" text;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "away_formation" text;

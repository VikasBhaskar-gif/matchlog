ALTER TYPE "public"."match_source" ADD VALUE IF NOT EXISTS 'FOOTBALL_DATA_ORG' BEFORE 'API_FOOTBALL';--> statement-breakpoint
ALTER TYPE "public"."match_status" ADD VALUE IF NOT EXISTS 'PAUSED' BEFORE 'FINISHED';--> statement-breakpoint
ALTER TYPE "public"."match_status" ADD VALUE IF NOT EXISTS 'SUSPENDED';--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "source" "match_source" DEFAULT 'OPENFOOTBALL' NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "is_supported" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "home_score_half_time" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "away_score_half_time" integer;
ALTER TYPE "public"."match_source" ADD VALUE 'FOOTBALL_DATA_ORG' BEFORE 'API_FOOTBALL';--> statement-breakpoint
ALTER TYPE "public"."match_status" ADD VALUE 'PAUSED' BEFORE 'FINISHED';--> statement-breakpoint
ALTER TYPE "public"."match_status" ADD VALUE 'SUSPENDED';--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "source" "match_source" DEFAULT 'OPENFOOTBALL' NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "is_supported" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_score_half_time" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_score_half_time" integer;
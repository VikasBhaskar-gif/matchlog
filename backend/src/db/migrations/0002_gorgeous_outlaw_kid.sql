CREATE TYPE "public"."match_source" AS ENUM('OPENFOOTBALL', 'API_FOOTBALL', 'DEMO');--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "source" "match_source" DEFAULT 'OPENFOOTBALL' NOT NULL;
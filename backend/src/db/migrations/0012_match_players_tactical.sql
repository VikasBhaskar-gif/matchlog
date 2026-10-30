ALTER TABLE "match_players" ADD COLUMN IF NOT EXISTS "sub_in_minute" integer;
--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN IF NOT EXISTS "tactical_position" text;
--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN IF NOT EXISTS "formation_place" integer;

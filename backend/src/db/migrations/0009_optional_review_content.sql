-- Make content nullable in match_reviews (allow rating-only reviews)
ALTER TABLE "match_reviews" ALTER COLUMN "content" DROP NOT NULL;
--> statement-breakpoint
-- Ensure the content length check still applies when content is not null
-- (The existing check constraint `review_content_length` already handles this: char_length(content) <= 500)
-- Add a check to ensure at least one of content, match_quality_rating, or referee_rating is provided
-- This is enforced at the application layer (Zod), not the DB, to keep the constraint simple.

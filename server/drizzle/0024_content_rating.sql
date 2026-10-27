ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "content_rating" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "warnings" text DEFAULT '' NOT NULL;

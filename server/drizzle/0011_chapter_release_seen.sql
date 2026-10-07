ALTER TABLE "chapters" ADD COLUMN IF NOT EXISTS "released_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifications_seen_at" timestamp;
--> statement-breakpoint
-- chapters already live get the moment they became visible (a schedule if there was one, else when they were written)
UPDATE "chapters" SET "released_at" = COALESCE("publish_at", "created_at") WHERE "published" AND "released_at" IS NULL;

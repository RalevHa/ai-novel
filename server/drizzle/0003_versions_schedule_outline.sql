CREATE TABLE IF NOT EXISTS "chapter_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"chapter_id" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN IF NOT EXISTS "publish_at" timestamp;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "outline" text DEFAULT '' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "chapter_versions" ADD CONSTRAINT "chapter_versions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chapter_versions_chapter_id_idx" ON "chapter_versions" USING btree ("chapter_id","id");

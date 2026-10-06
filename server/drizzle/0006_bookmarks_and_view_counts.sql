CREATE TABLE IF NOT EXISTS "bookmarks" (
	"user_id" integer NOT NULL,
	"story_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_user_id_story_id_pk" PRIMARY KEY("user_id","story_id")
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN IF NOT EXISTS "views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN IF NOT EXISTS "finishes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
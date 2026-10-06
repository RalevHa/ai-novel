CREATE TABLE IF NOT EXISTS "reading_progress" (
	"user_id" integer NOT NULL,
	"story_id" integer NOT NULL,
	"no" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_user_id_story_id_pk" PRIMARY KEY("user_id","story_id")
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN IF NOT EXISTS "tokens" integer;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN IF NOT EXISTS "cost" double precision;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

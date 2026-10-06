CREATE TABLE IF NOT EXISTS "chapter_reads" (
	"user_id" integer NOT NULL,
	"story_id" integer NOT NULL,
	"no" integer NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_reads_user_id_story_id_no_pk" PRIMARY KEY("user_id","story_id","no")
);
--> statement-breakpoint
ALTER TABLE "reading_progress" ADD COLUMN IF NOT EXISTS "pos" double precision;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "chapter_reads" ADD CONSTRAINT "chapter_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "chapter_reads" ADD CONSTRAINT "chapter_reads_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
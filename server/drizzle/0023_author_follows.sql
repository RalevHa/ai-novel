CREATE TABLE IF NOT EXISTS "author_follows" (
	"user_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "author_follows_user_id_author_id_pk" PRIMARY KEY("user_id","author_id")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "author_follows" ADD CONSTRAINT "author_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "author_follows" ADD CONSTRAINT "author_follows_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

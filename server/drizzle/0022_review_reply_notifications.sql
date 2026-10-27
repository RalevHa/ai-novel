ALTER TABLE "notifications" ALTER COLUMN "comment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "review_reply_id" integer;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "notifications" ADD CONSTRAINT "notifications_review_reply_id_review_replies_id_fk" FOREIGN KEY ("review_reply_id") REFERENCES "public"."review_replies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_review_reply_key" UNIQUE("user_id","review_reply_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; -- a unique constraint raises duplicate_table (its index already exists)
END $$;

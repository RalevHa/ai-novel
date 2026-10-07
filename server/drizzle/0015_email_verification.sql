-- Accounts that exist when this column is first added count as verified (nobody is locked out);
-- the backfill sits inside the IF so a replay of this file never verifies a new, unconfirmed sign-up.
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified_at') THEN
		ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp;
		UPDATE "users" SET "email_verified_at" = now();
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"purpose" text NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_codes_user_purpose_key" UNIQUE("user_id","purpose")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

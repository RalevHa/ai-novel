CREATE TABLE IF NOT EXISTS "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_ai_keys" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"last4" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_ai_keys" ADD CONSTRAINT "user_ai_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_source_created_idx" ON "ai_usage" USING btree ("source","created_at");
--> statement-breakpoint
-- spend that was recorded on chapters before this table existed counts toward the site's monthly cap (it was all paid with the site's key); runs once
INSERT INTO "ai_usage" ("user_id", "source", "kind", "tokens", "cost", "created_at")
SELECT st."author_id", 'site', 'earlier', coalesce(c."tokens", 0), c."cost", c."created_at"
FROM "chapters" c JOIN "stories" st ON st."id" = c."story_id"
WHERE c."cost" IS NOT NULL AND c."cost" > 0 AND NOT EXISTS (SELECT 1 FROM "ai_usage" WHERE "kind" = 'earlier');

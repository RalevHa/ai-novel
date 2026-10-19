CREATE TABLE "chapter_likes" (
	"chapter_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_likes_chapter_id_user_id_pk" PRIMARY KEY("chapter_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "chapter_likes" ADD CONSTRAINT "chapter_likes_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_likes" ADD CONSTRAINT "chapter_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
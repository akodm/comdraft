CREATE TABLE "comdraft"."post" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text NOT NULL,
	"content" jsonb NOT NULL,
	"visibility" text NOT NULL,
	"locale" text NOT NULL,
	"published_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_draft_id_unique" UNIQUE("draft_id"),
	CONSTRAINT "post_visibility_check" CHECK ("comdraft"."post"."visibility" in ('public', 'unlisted')),
	CONSTRAINT "post_locale_check" CHECK ("comdraft"."post"."locale" in ('ko', 'en'))
);
--> statement-breakpoint
ALTER TABLE "comdraft"."post" ADD CONSTRAINT "post_draft_id_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "comdraft"."draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."post" ADD CONSTRAINT "post_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "comdraft"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_public_published_idx" ON "comdraft"."post" USING btree ("published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "comdraft"."post"."visibility" = 'public';--> statement-breakpoint
ALTER TABLE "comdraft"."draft" DROP COLUMN "visibility";
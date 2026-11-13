ALTER TABLE "comdraft"."user" ADD COLUMN "github_login" text;--> statement-breakpoint
ALTER TABLE "comdraft"."draft" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."post" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "post_tags_idx" ON "comdraft"."post" USING gin ("tags");
CREATE TABLE "comdraft"."draft" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comdraft"."draft_prompt" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"prompt" text NOT NULL,
	"tone" text NOT NULL,
	"post_type" text NOT NULL,
	"length" text NOT NULL,
	"required_blocks" text[] DEFAULT '{}' NOT NULL,
	"commit_shas" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comdraft"."draft" ADD CONSTRAINT "draft_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "comdraft"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."draft" ADD CONSTRAINT "draft_user_repository_fk" FOREIGN KEY ("user_id","repository_id") REFERENCES "comdraft"."user_repository"("user_id","repository_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD CONSTRAINT "draft_prompt_draft_id_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "comdraft"."draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_user_repository_updated_idx" ON "comdraft"."draft" USING btree ("user_id","repository_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "draft_prompt_draft_created_idx" ON "comdraft"."draft_prompt" USING btree ("draft_id","created_at" DESC NULLS LAST);
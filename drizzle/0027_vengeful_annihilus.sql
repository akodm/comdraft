CREATE TABLE "comdraft"."repository_auto_draft" (
	"user_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT 'plain' NOT NULL,
	"post_type" text DEFAULT 'experience' NOT NULL,
	"length" text DEFAULT 'short' NOT NULL,
	"required_blocks" text[] DEFAULT '{"h2","list","code"}' NOT NULL,
	"model" text DEFAULT 'haiku' NOT NULL,
	"boundary_sha" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_auto_draft_user_id_repository_id_pk" PRIMARY KEY("user_id","repository_id")
);
--> statement-breakpoint
CREATE TABLE "comdraft"."repository_excluded_commit" (
	"user_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"sha" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_excluded_commit_user_id_repository_id_sha_pk" PRIMARY KEY("user_id","repository_id","sha"),
	CONSTRAINT "repository_excluded_commit_reason_check" CHECK ("comdraft"."repository_excluded_commit"."reason" in ('user', 'force_push'))
);
--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "repository_id" text;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "source" text DEFAULT 'studio' NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "trigger_sha" text;--> statement-breakpoint
ALTER TABLE "comdraft"."repository_auto_draft" ADD CONSTRAINT "repository_auto_draft_user_repository_fk" FOREIGN KEY ("user_id","repository_id") REFERENCES "comdraft"."user_repository"("user_id","repository_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."repository_excluded_commit" ADD CONSTRAINT "repository_excluded_commit_user_repository_fk" FOREIGN KEY ("user_id","repository_id") REFERENCES "comdraft"."user_repository"("user_id","repository_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_prompt_user_trigger_unique" ON "comdraft"."draft_prompt" USING btree ("user_id","trigger_sha") WHERE "comdraft"."draft_prompt"."trigger_sha" is not null;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD CONSTRAINT "draft_prompt_source_check" CHECK ("comdraft"."draft_prompt"."source" in ('studio', 'commit_trigger'));--> statement-breakpoint
update comdraft.draft_prompt dp set repository_id = d.repository_id from comdraft.draft d where dp.draft_id = d.id and dp.repository_id is null;

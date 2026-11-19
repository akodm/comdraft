CREATE TABLE "comdraft"."admin_account" (
	"id" text PRIMARY KEY NOT NULL,
	"login_id" text NOT NULL,
	"temp_password_hash" text,
	"password_hash" text,
	"role" text DEFAULT 'guest' NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp (3) with time zone,
	"password_changed_at" timestamp (3) with time zone,
	"last_login_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_account_login_id_unique" UNIQUE("login_id"),
	CONSTRAINT "admin_account_role_check" CHECK ("comdraft"."admin_account"."role" in ('guest', 'viewer', 'editor', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "comdraft"."admin_action_log" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comdraft"."admin_session" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "comdraft"."ai_prompt" (
	"locale" text NOT NULL,
	"key" text NOT NULL,
	"content" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompt_locale_key_pk" PRIMARY KEY("locale","key")
);
--> statement-breakpoint
CREATE TABLE "comdraft"."ai_prompt_default" (
	"locale" text NOT NULL,
	"key" text NOT NULL,
	"content" text NOT NULL,
	"required_markers" text[] DEFAULT '{}' NOT NULL,
	"version" text NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompt_default_locale_key_pk" PRIMARY KEY("locale","key")
);
--> statement-breakpoint
CREATE TABLE "comdraft"."ai_prompt_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"key" text NOT NULL,
	"content" text,
	"admin_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comdraft"."service_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comdraft"."user" ADD COLUMN "banned_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "comdraft"."user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "comdraft"."user" ADD COLUMN "quota_reset_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "deleted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "comdraft"."admin_action_log" ADD CONSTRAINT "admin_action_log_admin_id_admin_account_id_fk" FOREIGN KEY ("admin_id") REFERENCES "comdraft"."admin_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."admin_session" ADD CONSTRAINT "admin_session_admin_id_admin_account_id_fk" FOREIGN KEY ("admin_id") REFERENCES "comdraft"."admin_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."ai_prompt" ADD CONSTRAINT "ai_prompt_updated_by_admin_account_id_fk" FOREIGN KEY ("updated_by") REFERENCES "comdraft"."admin_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."ai_prompt_revision" ADD CONSTRAINT "ai_prompt_revision_admin_id_admin_account_id_fk" FOREIGN KEY ("admin_id") REFERENCES "comdraft"."admin_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."service_setting" ADD CONSTRAINT "service_setting_updated_by_admin_account_id_fk" FOREIGN KEY ("updated_by") REFERENCES "comdraft"."admin_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_action_log_created_at_idx" ON "comdraft"."admin_action_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_action_log_target_idx" ON "comdraft"."admin_action_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "ai_prompt_revision_key_idx" ON "comdraft"."ai_prompt_revision" USING btree ("locale","key","created_at");
CREATE TABLE "comdraft"."github_commit" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"sha" text NOT NULL,
	"message" text NOT NULL,
	"author_name" text,
	"author_email" text,
	"author_login" text,
	"author_avatar_url" text,
	"authored_at" timestamp with time zone,
	"committed_at" timestamp with time zone NOT NULL,
	"html_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_commit_repository_id_sha_unique" UNIQUE("repository_id","sha")
);
--> statement-breakpoint
CREATE TABLE "comdraft"."github_installation" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"account_avatar_url" text,
	"repository_selection" text NOT NULL,
	"suspended_at" timestamp with time zone,
	"installed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_installation_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "comdraft"."github_repository" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" text NOT NULL,
	"github_repo_id" bigint NOT NULL,
	"owner_login" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"description" text,
	"is_private" boolean NOT NULL,
	"default_branch" text NOT NULL,
	"html_url" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_repository_github_repo_id_unique" UNIQUE("github_repo_id")
);
--> statement-breakpoint
CREATE TABLE "comdraft"."user_repository" (
	"user_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_repository_user_id_repository_id_pk" PRIMARY KEY("user_id","repository_id")
);
--> statement-breakpoint
ALTER TABLE "comdraft"."github_commit" ADD CONSTRAINT "github_commit_repository_id_github_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "comdraft"."github_repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."github_installation" ADD CONSTRAINT "github_installation_installed_by_user_id_user_id_fk" FOREIGN KEY ("installed_by_user_id") REFERENCES "comdraft"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."github_repository" ADD CONSTRAINT "github_repository_installation_id_github_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "comdraft"."github_installation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."user_repository" ADD CONSTRAINT "user_repository_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "comdraft"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."user_repository" ADD CONSTRAINT "user_repository_repository_id_github_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "comdraft"."github_repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_commit_repository_id_committed_at_idx" ON "comdraft"."github_commit" USING btree ("repository_id","committed_at");--> statement-breakpoint
CREATE INDEX "github_repository_installation_id_idx" ON "comdraft"."github_repository" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "user_repository_repository_id_idx" ON "comdraft"."user_repository" USING btree ("repository_id");
DROP TABLE "comdraft"."github_commit" CASCADE;--> statement-breakpoint
ALTER TABLE "comdraft"."github_repository" DROP COLUMN "last_synced_at";--> statement-breakpoint
ALTER TABLE "comdraft"."github_repository" DROP COLUMN "last_sync_error";
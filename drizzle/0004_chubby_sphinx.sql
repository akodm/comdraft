ALTER TABLE "comdraft"."github_commit" DROP CONSTRAINT "github_commit_repository_id_sha_unique";--> statement-breakpoint
DROP INDEX "comdraft"."github_commit_repository_id_committed_at_idx";--> statement-breakpoint
-- 기존 행은 저장소의 기본 브랜치로 채운 뒤 NOT NULL 지정 (이전까지 기본 브랜치만 동기화했음)
ALTER TABLE "comdraft"."github_commit" ADD COLUMN "branch" text;--> statement-breakpoint
UPDATE "comdraft"."github_commit" AS c SET "branch" = r."default_branch" FROM "comdraft"."github_repository" AS r WHERE c."repository_id" = r."id";--> statement-breakpoint
ALTER TABLE "comdraft"."github_commit" ALTER COLUMN "branch" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."user_repository" ADD COLUMN "branch" text;--> statement-breakpoint
UPDATE "comdraft"."user_repository" AS u SET "branch" = r."default_branch" FROM "comdraft"."github_repository" AS r WHERE u."repository_id" = r."id";--> statement-breakpoint
ALTER TABLE "comdraft"."user_repository" ALTER COLUMN "branch" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "github_commit_repository_id_branch_committed_at_idx" ON "comdraft"."github_commit" USING btree ("repository_id","branch","committed_at");--> statement-breakpoint
ALTER TABLE "comdraft"."github_commit" ADD CONSTRAINT "github_commit_repository_id_branch_sha_unique" UNIQUE("repository_id","branch","sha");

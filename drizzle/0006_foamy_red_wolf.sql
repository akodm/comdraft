ALTER TABLE "comdraft"."github_repository" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "comdraft"."user_repository" ADD COLUMN "updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- 기존 등록 저장소는 등록 시각을 변경 시각으로 사용 (모두 마이그레이션 시각이 되지 않도록)
UPDATE "comdraft"."user_repository" SET "updated_at" = "created_at";--> statement-breakpoint
CREATE INDEX "user_repository_user_updated_idx" ON "comdraft"."user_repository" USING btree ("user_id","updated_at" DESC NULLS LAST,"repository_id" DESC NULLS LAST);
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "applied_at" timestamp (3) with time zone;--> statement-breakpoint
-- 이미 완료된 요청(AI 연동 전 임시 초안)은 반영할 결과가 없으므로 반영 완료로 채움 (편집 잠금 방지)
UPDATE "comdraft"."draft_prompt" SET "applied_at" = coalesce("finished_at", "created_at") WHERE "status" = 'completed';

-- 작업(draft_prompt)에 요청한 사용자를 기록하고, 초안을 삭제해도 작업 행(사용량, 요청 기록)은 남김
-- 운영에는 이 마이그레이션을 새 코드 배포 전에 적용하므로, 그 사이 이전 코드가 user_id 없이 넣을 수 있어 user_id 는 아직 nullable
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "user_id" text;--> statement-breakpoint
-- 기존 작업은 초안의 사용자로 채움
UPDATE "comdraft"."draft_prompt" p SET "user_id" = d."user_id" FROM "comdraft"."draft" d WHERE d."id" = p."draft_id";--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD CONSTRAINT "draft_prompt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "comdraft"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_prompt_user_created_idx" ON "comdraft"."draft_prompt" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ALTER COLUMN "draft_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" DROP CONSTRAINT "draft_prompt_draft_id_draft_id_fk";--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD CONSTRAINT "draft_prompt_draft_id_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "comdraft"."draft"("id") ON DELETE set null ON UPDATE no action;

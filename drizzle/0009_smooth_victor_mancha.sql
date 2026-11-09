ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "status" text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "step" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "channel" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "result" text;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "started_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "finished_at" timestamp (3) with time zone;--> statement-breakpoint
-- 기존 요청은 AI 연동 전 임시 초안으로 이미 끝난 요청이므로 완료로 채움 (진행 중 작업 유일 인덱스보다 먼저)
UPDATE "comdraft"."draft_prompt" SET "status" = 'completed', "step" = 3, "finished_at" = "created_at";--> statement-breakpoint
CREATE UNIQUE INDEX "draft_prompt_draft_active_unique" ON "comdraft"."draft_prompt" USING btree ("draft_id") WHERE "comdraft"."draft_prompt"."status" in ('queued', 'running');--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD CONSTRAINT "draft_prompt_channel_unique" UNIQUE("channel");--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD CONSTRAINT "draft_prompt_status_check" CHECK ("comdraft"."draft_prompt"."status" in ('queued', 'running', 'completed', 'failed'));--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD CONSTRAINT "draft_prompt_step_check" CHECK ("comdraft"."draft_prompt"."step" between 0 and 3);
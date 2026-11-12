ALTER TABLE "comdraft"."draft_prompt" DROP CONSTRAINT "draft_prompt_status_check";--> statement-breakpoint
DROP INDEX "comdraft"."draft_prompt_draft_active_unique";--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "clarification" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_prompt_draft_active_unique" ON "comdraft"."draft_prompt" USING btree ("draft_id") WHERE "comdraft"."draft_prompt"."status" in ('queued', 'running', 'awaiting_input');--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD CONSTRAINT "draft_prompt_status_check" CHECK ("comdraft"."draft_prompt"."status" in ('queued', 'running', 'awaiting_input', 'completed', 'failed'));
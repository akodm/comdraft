ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "kind" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "blank_id" text;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "blank_question" text;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "blank_answer" text;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "blank_context" text;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "analysis" jsonb;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD CONSTRAINT "draft_prompt_kind_check" CHECK ("comdraft"."draft_prompt"."kind" in ('draft', 'fill'));
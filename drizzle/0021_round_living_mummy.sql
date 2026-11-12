ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "model" text DEFAULT 'haiku' NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "estimated_cost" bigint;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "used_cost" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."quota_plan" ADD COLUMN "weekly_cost_limit" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD CONSTRAINT "draft_prompt_model_check" CHECK ("comdraft"."draft_prompt"."model" in ('haiku', 'sonnet', 'opus'));--> statement-breakpoint
update "comdraft"."draft_prompt" set "used_cost" = ceil("used_tokens" * 0.26), "estimated_cost" = case when "estimated_tokens" is null then null else ceil("estimated_tokens" * 0.26) end;--> statement-breakpoint
update "comdraft"."quota_plan" set "weekly_cost_limit" = case "role" when 'basic' then 300000 when 'pro' then 6000000 when 'max' then 18000000 else 300000 end;--> statement-breakpoint
ALTER TABLE "comdraft"."quota_plan" ADD CONSTRAINT "quota_plan_cost_limit_check" CHECK ("comdraft"."quota_plan"."weekly_cost_limit" > 0);

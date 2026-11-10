CREATE TABLE "comdraft"."quota_plan" (
	"role" text PRIMARY KEY NOT NULL,
	"weekly_token_limit" integer NOT NULL,
	"overrun_ratio" numeric(4, 2) NOT NULL,
	"reset_timezone" text NOT NULL,
	"reset_weekday" smallint NOT NULL,
	"reset_hour" smallint NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quota_plan_limit_check" CHECK ("comdraft"."quota_plan"."weekly_token_limit" > 0),
	CONSTRAINT "quota_plan_ratio_check" CHECK ("comdraft"."quota_plan"."overrun_ratio" >= 1),
	CONSTRAINT "quota_plan_weekday_check" CHECK ("comdraft"."quota_plan"."reset_weekday" between 0 and 6),
	CONSTRAINT "quota_plan_hour_check" CHECK ("comdraft"."quota_plan"."reset_hour" between 0 and 23)
);
--> statement-breakpoint
INSERT INTO "comdraft"."quota_plan" ("role","weekly_token_limit","overrun_ratio","reset_timezone","reset_weekday","reset_hour") VALUES
  ('basic', 100000, 1.30, 'Asia/Seoul', 0, 0),
  ('pro', 500000, 1.30, 'Asia/Seoul', 0, 0),
  ('max', 2000000, 1.30, 'Asia/Seoul', 0, 0);--> statement-breakpoint
ALTER TABLE "comdraft"."user" ADD COLUMN "role" text DEFAULT 'basic' NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "estimated_tokens" integer;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "used_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ADD COLUMN "reference_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."user" ADD CONSTRAINT "user_role_quota_plan_fk" FOREIGN KEY ("role") REFERENCES "comdraft"."quota_plan"("role") ON DELETE restrict ON UPDATE cascade;
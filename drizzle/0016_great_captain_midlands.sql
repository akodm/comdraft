-- 0015 이후 이전 코드가 user_id 없이 넣은 작업이 있으면 초안의 사용자로 채운 뒤 NOT NULL
UPDATE "comdraft"."draft_prompt" p SET "user_id" = d."user_id" FROM "comdraft"."draft" d WHERE d."id" = p."draft_id" AND p."user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "comdraft"."draft_prompt" ALTER COLUMN "user_id" SET NOT NULL;

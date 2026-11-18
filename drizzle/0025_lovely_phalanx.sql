ALTER TABLE "comdraft"."post" ADD COLUMN "banned_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "comdraft"."post" ADD COLUMN "ban_reason" text;
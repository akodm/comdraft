CREATE TABLE "comdraft"."user_withdrawal" (
	"id" text PRIMARY KEY NOT NULL,
	"withdrawn_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_withdrawal_withdrawn_at_idx" ON "comdraft"."user_withdrawal" USING btree ("withdrawn_at");
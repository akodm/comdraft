CREATE TABLE "comdraft"."draft_reference_link" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_reference_link_draft_url_unique" UNIQUE("draft_id","url")
);
--> statement-breakpoint
ALTER TABLE "comdraft"."draft_reference_link" ADD CONSTRAINT "draft_reference_link_draft_id_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "comdraft"."draft"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "comdraft"."image" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"draft_id" text,
	"path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_path_unique" UNIQUE("path")
);
--> statement-breakpoint
ALTER TABLE "comdraft"."image" ADD CONSTRAINT "image_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "comdraft"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comdraft"."image" ADD CONSTRAINT "image_draft_id_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "comdraft"."draft"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "image_draft_idx" ON "comdraft"."image" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "image_user_created_idx" ON "comdraft"."image" USING btree ("user_id","created_at");
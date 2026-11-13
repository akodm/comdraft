CREATE TABLE "comdraft"."post_view" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"viewer_key" text NOT NULL,
	"viewed_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comdraft"."post_view" ADD CONSTRAINT "post_view_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "comdraft"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_view_post_viewer_idx" ON "comdraft"."post_view" USING btree ("post_id","viewer_key","viewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "post_view_post_viewed_idx" ON "comdraft"."post_view" USING btree ("post_id","viewed_at");
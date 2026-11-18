CREATE TABLE "menu_photo_asset" (
	"id" uuid PRIMARY KEY NOT NULL,
	"input_hash" text NOT NULL,
	"content_hash" text NOT NULL,
	"bytes" integer NOT NULL,
	"mode" text NOT NULL,
	"target" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"touched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_photo_valid" CHECK ("menu_photo_asset"."mode" IN ('local','s3') AND "menu_photo_asset"."state" IN ('pending','ready','deleting','deleted') AND "menu_photo_asset"."bytes" BETWEEN 1 AND 500000 AND "menu_photo_asset"."input_hash" ~ '^[a-f0-9]{64}$' AND "menu_photo_asset"."content_hash" ~ '^[a-f0-9]{64}$' AND "menu_photo_asset"."target" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE INDEX "menu_photo_cleanup_idx" ON "menu_photo_asset" USING btree ("state","touched_at");
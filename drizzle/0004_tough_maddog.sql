ALTER TABLE "menu_item" ADD COLUMN "category" text DEFAULT 'uncategorized' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "image_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_category" CHECK ("menu_item"."category" IN ('uncategorized','drink','food'));--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_image_length" CHECK (length("menu_item"."image_url") <= 2000);
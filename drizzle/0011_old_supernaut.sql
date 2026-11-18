CREATE TABLE "sheets_daily_day" (
	"date" text PRIMARY KEY NOT NULL,
	"sale_count" integer NOT NULL,
	"catalog" jsonb NOT NULL,
	"catalog_hash" text NOT NULL,
	"status_row" integer NOT NULL,
	"dirty" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone,
	"catalog_historical" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sheets_daily_day_status_row_unique" UNIQUE("status_row"),
	CONSTRAINT "daily_day_valid" CHECK ("sheets_daily_day"."date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "sheets_daily_day"."sale_count">=0 AND "sheets_daily_day"."status_row">=6)
);
--> statement-breakpoint
CREATE TABLE "sheets_daily_row" (
	"key" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"row_number" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sheets_daily_row_row_number_unique" UNIQUE("row_number"),
	CONSTRAINT "daily_row_valid" CHECK ("sheets_daily_row"."key" ~ '^[a-f0-9]{64}$' AND "sheets_daily_row"."row_number" BETWEEN 6 AND 100005)
);
--> statement-breakpoint
CREATE TABLE "sheets_daily_target" (
	"id" text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	"spreadsheet_id" text NOT NULL,
	"mode" text NOT NULL,
	"sheet_id" integer,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_target_valid" CHECK ("sheets_daily_target"."id"='primary' AND "sheets_daily_target"."mode"='test' AND "sheets_daily_target"."attempts">=0)
);
--> statement-breakpoint
ALTER TABLE "sheets_daily_row" ADD CONSTRAINT "sheets_daily_row_date_sheets_daily_day_date_fk" FOREIGN KEY ("date") REFERENCES "public"."sheets_daily_day"("date") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_row_day_idx" ON "sheets_daily_row" USING btree ("date");
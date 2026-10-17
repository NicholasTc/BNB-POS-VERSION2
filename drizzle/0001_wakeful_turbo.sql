CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"clock_in" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_out" timestamp with time zone,
	CONSTRAINT "valid_shift" CHECK ("attendance"."clock_out" IS NULL OR "attendance"."clock_out" >= "attendance"."clock_in")
);
--> statement-breakpoint
CREATE TABLE "device" (
	"id" text PRIMARY KEY DEFAULT 'shared' NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"cashier_id" uuid,
	"touched_at" timestamp with time zone,
	"generation" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "device_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "one_device" CHECK ("device"."id" = 'shared')
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"pin_hash" text NOT NULL,
	"pin_lookup" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_pin_lookup_unique" UNIQUE("pin_lookup"),
	CONSTRAINT "employee_name_length" CHECK (length("employee"."name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_cashier_id_employee_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_shift" ON "attendance" USING btree ("employee_id") WHERE "attendance"."clock_out" IS NULL;--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendance" USING btree ("clock_in");
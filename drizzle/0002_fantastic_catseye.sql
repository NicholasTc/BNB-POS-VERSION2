CREATE TYPE "public"."payment_method" AS ENUM('cash', 'qris');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('pending', 'paid', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "menu_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_name_length" CHECK (length("menu_item"."name") BETWEEN 1 AND 80),
	CONSTRAINT "menu_price_range" CHECK ("menu_item"."price" BETWEEN 1 AND 100000000)
);
--> statement-breakpoint
CREATE TABLE "sale" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"device_id" text NOT NULL,
	"cashier_id" uuid NOT NULL,
	"cashier_name" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" "sale_status" DEFAULT 'pending' NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"total" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attested_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "sale_reference_unique" UNIQUE("reference"),
	CONSTRAINT "sale_total_range" CHECK ("sale"."total" BETWEEN 1 AND 1000000000),
	CONSTRAINT "sale_status_timestamps" CHECK (("sale"."status" IN ('pending','cancelled') AND "sale"."attested_at" IS NULL AND "sale"."completed_at" IS NULL) OR ("sale"."status"='paid' AND "sale"."attested_at" IS NOT NULL AND "sale"."completed_at" IS NULL) OR ("sale"."status"='completed' AND "sale"."attested_at" IS NOT NULL AND "sale"."completed_at" IS NOT NULL AND "sale"."completed_at" >= "sale"."attested_at"))
);
--> statement-breakpoint
CREATE TABLE "sale_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"subtotal" integer NOT NULL,
	CONSTRAINT "one_product_per_sale" UNIQUE("sale_id","menu_item_id"),
	CONSTRAINT "sale_line_quantity" CHECK ("sale_line"."quantity" BETWEEN 1 AND 99),
	CONSTRAINT "sale_line_price" CHECK ("sale_line"."unit_price" BETWEEN 1 AND 100000000),
	CONSTRAINT "sale_line_subtotal" CHECK ("sale_line"."subtotal"::bigint = "sale_line"."unit_price"::bigint * "sale_line"."quantity" AND "sale_line"."subtotal" BETWEEN 1 AND 1000000000)
);
--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_cashier_id_employee_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_sale_per_device" ON "sale" USING btree ("device_id") WHERE "sale"."status" IN ('pending','paid');--> statement-breakpoint
CREATE INDEX "sale_completed_idx" ON "sale" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "sale_cashier_idx" ON "sale" USING btree ("cashier_id");
--> statement-breakpoint
CREATE FUNCTION protect_sale() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Sales cannot be deleted'; END IF;
  IF OLD.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Terminal sale is immutable'; END IF;
  IF (to_jsonb(NEW) - 'status' - 'attested_at' - 'completed_at') IS DISTINCT FROM
     (to_jsonb(OLD) - 'status' - 'attested_at' - 'completed_at') THEN RAISE EXCEPTION 'Sale snapshot is immutable'; END IF;
  IF NOT ((OLD.status='pending' AND NEW.status IN ('paid','cancelled')) OR (OLD.status='paid' AND NEW.status='completed')) THEN RAISE EXCEPTION 'Invalid sale transition'; END IF;
  IF OLD.attested_at IS NOT NULL AND NEW.attested_at IS DISTINCT FROM OLD.attested_at THEN RAISE EXCEPTION 'Attestation is immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER protect_sale BEFORE UPDATE OR DELETE ON sale FOR EACH ROW EXECUTE FUNCTION protect_sale();
--> statement-breakpoint
CREATE FUNCTION protect_sale_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Sale lines are immutable'; END IF;
  PERFORM id FROM sale WHERE id=NEW.sale_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale lines require a pending sale'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER protect_sale_line BEFORE INSERT OR UPDATE OR DELETE ON sale_line FOR EACH ROW EXECUTE FUNCTION protect_sale_line();
--> statement-breakpoint
CREATE FUNCTION check_sale_totals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; expected bigint; actual bigint; n bigint;
BEGIN
  IF TG_TABLE_NAME='sale' THEN target:=NEW.id; ELSE target:=NEW.sale_id; END IF;
  SELECT total INTO expected FROM sale WHERE id=target;
  SELECT COALESCE(sum(subtotal),0), count(*) INTO actual,n FROM sale_line WHERE sale_id=target;
  IF actual<>expected OR n<1 OR n>50 THEN RAISE EXCEPTION 'Sale total does not match immutable lines'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sale_totals AFTER INSERT OR UPDATE ON sale DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_sale_totals();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sale_line_totals AFTER INSERT ON sale_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_sale_totals();

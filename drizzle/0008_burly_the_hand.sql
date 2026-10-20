CREATE TABLE "promotion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rules" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_revision" CHECK ("promotion"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "sale_discount" (
	"sale_id" uuid PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale_discount" ADD CONSTRAINT "sale_discount_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION protect_sale_discount() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Discount snapshots are immutable'; END IF;
  -- Only the transaction that creates a quote may attach a discount. Even an
  -- unpaid quote cannot be repriced by inserting a snapshot later.
  PERFORM id FROM sale WHERE id=NEW.sale_id AND status='pending'
    AND xmin=(pg_current_xact_id()::text)::xid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Discount requires a new quote'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER protect_sale_discount BEFORE INSERT OR UPDATE OR DELETE ON sale_discount FOR EACH ROW EXECUTE FUNCTION protect_sale_discount();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION check_sale_totals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; expected bigint; actual bigint; n bigint; snap jsonb; reduction bigint; allocated bigint;
BEGIN
  IF TG_TABLE_NAME='sale' THEN target:=NEW.id; ELSE target:=NEW.sale_id; END IF;
  SELECT total INTO expected FROM sale WHERE id=target;
  SELECT COALESCE(sum(subtotal),0),count(*) INTO actual,n FROM sale_line WHERE sale_id=target;
  SELECT snapshot INTO snap FROM sale_discount WHERE sale_id=target;
  reduction:=0;
  IF snap IS NOT NULL THEN
    IF jsonb_typeof(snap->'grossTotal') IS DISTINCT FROM 'number'
      OR jsonb_typeof(snap->'discount') IS DISTINCT FROM 'number'
      OR jsonb_typeof(snap->'allocations') IS DISTINCT FROM 'array'
      OR jsonb_typeof(snap->'applied') IS DISTINCT FROM 'array'
      OR (snap->>'grossTotal')::numeric<>actual
      OR (snap->>'discount')::numeric<>trunc((snap->>'discount')::numeric)
      OR jsonb_array_length(snap->'applied') NOT BETWEEN 1 AND 20
      OR jsonb_array_length(snap->'allocations')<>n
      THEN RAISE EXCEPTION 'Invalid discount snapshot'; END IF;
    reduction:=(snap->>'discount')::bigint;
    IF reduction<0 OR reduction>=actual THEN RAISE EXCEPTION 'Invalid discount amount'; END IF;
    SELECT sum((a->>'discount')::bigint) INTO allocated FROM jsonb_array_elements(snap->'allocations') a;
    IF allocated IS DISTINCT FROM reduction OR
       (SELECT count(DISTINCT a->>'id') FROM jsonb_array_elements(snap->'allocations') a)<>n OR
       EXISTS (SELECT 1 FROM jsonb_array_elements(snap->'allocations') a
         LEFT JOIN sale_line l ON l.sale_id=target AND l.menu_item_id=(a->>'id')::uuid
         WHERE l.id IS NULL OR jsonb_typeof(a->'discount') IS DISTINCT FROM 'number'
           OR (a->>'discount')::numeric<>trunc((a->>'discount')::numeric)
           OR (a->>'discount')::bigint<0 OR (a->>'discount')::bigint>l.subtotal)
       THEN RAISE EXCEPTION 'Invalid discount allocation'; END IF;
    SELECT sum((p->>'discount')::bigint) INTO allocated FROM jsonb_array_elements(snap->'applied') p;
    IF allocated IS DISTINCT FROM reduction OR
       EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'applied') p WHERE
          jsonb_typeof(p->'discount') IS DISTINCT FROM 'number' OR
          (p->>'discount')::numeric<>trunc((p->>'discount')::numeric) OR
          (p->>'discount')::bigint<0 OR (p->>'percent')::int NOT BETWEEN 1 AND 99)
       THEN RAISE EXCEPTION 'Invalid promo breakdown'; END IF;
  END IF;
  IF actual-reduction<>expected OR n<1 OR n>50 THEN RAISE EXCEPTION 'Sale total does not match immutable lines and discounts'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sale_discount_totals AFTER INSERT ON sale_discount DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_sale_totals();

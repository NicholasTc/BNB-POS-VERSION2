CREATE TABLE "stock_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"low_threshold" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "stock_item_valid" CHECK (length(btrim("stock_item"."name")) BETWEEN 1 AND 80 AND "stock_item"."unit" IN ('pcs','pack') AND "stock_item"."low_threshold" BETWEEN 0 AND 1000000000 AND "stock_item"."revision">0 AND "stock_item"."balance" BETWEEN -9000000000000 AND 9000000000000)
);
--> statement-breakpoint
CREATE TABLE "stock_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"kind" text NOT NULL,
	"delta" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"reason" text NOT NULL,
	"actor" text NOT NULL,
	"sale_id" uuid,
	"sale_reference" text,
	"operation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_sale_once" UNIQUE("sale_id","stock_item_id"),
	CONSTRAINT "stock_operation_once" UNIQUE("operation_id"),
	CONSTRAINT "stock_movement_valid" CHECK ("stock_movement"."kind" IN ('opening','restock','adjust','sale') AND "stock_movement"."delta" BETWEEN -9000000000000 AND 9000000000000 AND "stock_movement"."balance_after" BETWEEN -9000000000000 AND 9000000000000 AND length("stock_movement"."reason")<=200 AND (("stock_movement"."kind"='sale' AND "stock_movement"."sale_id" IS NOT NULL AND "stock_movement"."operation_id" IS NULL AND "stock_movement"."delta"<0 AND "stock_movement"."sale_reference" IS NOT NULL) OR ("stock_movement"."kind"<>'sale' AND "stock_movement"."sale_id" IS NULL AND "stock_movement"."operation_id" IS NOT NULL AND "stock_movement"."sale_reference" IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "stock_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_recipe" (
	"menu_item_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	CONSTRAINT "stock_recipe_revision" CHECK ("stock_recipe"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "stock_recipe_line" (
	"menu_item_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "stock_recipe_line_menu_item_id_stock_item_id_pk" PRIMARY KEY("menu_item_id","stock_item_id"),
	CONSTRAINT "stock_recipe_quantity" CHECK ("stock_recipe_line"."quantity" BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
CREATE TABLE "stock_usage" (
	"sale_line_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"per_unit" integer NOT NULL,
	"quantity" integer NOT NULL,
	"recipe_revision" integer NOT NULL,
	CONSTRAINT "stock_usage_sale_line_id_stock_item_id_pk" PRIMARY KEY("sale_line_id","stock_item_id"),
	CONSTRAINT "stock_usage_valid" CHECK ("stock_usage"."per_unit" BETWEEN 1 AND 1000000 AND "stock_usage"."quantity" BETWEEN 1 AND 99000000 AND "stock_usage"."recipe_revision">0)
);
--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_stock_item_id_stock_item_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_operation_id_stock_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."stock_operation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_recipe" ADD CONSTRAINT "stock_recipe_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_recipe_line" ADD CONSTRAINT "stock_recipe_line_menu_item_id_stock_recipe_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."stock_recipe"("menu_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_recipe_line" ADD CONSTRAINT "stock_recipe_line_stock_item_id_stock_item_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_usage" ADD CONSTRAINT "stock_usage_sale_line_id_sale_line_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_usage" ADD CONSTRAINT "stock_usage_stock_item_id_stock_item_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_item_name_unique" ON "stock_item" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "stock_history_idx" ON "stock_movement" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "stock_item_history_idx" ON "stock_movement" USING btree ("stock_item_id","created_at","id");--> statement-breakpoint
CREATE FUNCTION protect_stock_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Stock items cannot be deleted'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.balance<>0 OR NEW.revision<>1 THEN RAISE EXCEPTION 'Stock starts through its opening movement'; END IF;
  ELSE
    IF NEW.id<>OLD.id OR NEW.unit<>OLD.unit OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Invalid stock revision or unit'; END IF;
    IF NEW.balance<>OLD.balance AND pg_trigger_depth()<=1 THEN RAISE EXCEPTION 'Stock changes require a movement'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER protect_stock_item BEFORE INSERT OR UPDATE OR DELETE ON stock_item FOR EACH ROW EXECUTE FUNCTION protect_stock_item();
--> statement-breakpoint
CREATE FUNCTION immutable_stock_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Stock operations are immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_stock_operation BEFORE UPDATE OR DELETE ON stock_operation FOR EACH ROW EXECUTE FUNCTION immutable_stock_operation();
--> statement-breakpoint
CREATE FUNCTION protect_stock_usage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Stock usage snapshots are immutable'; END IF;
  PERFORM pg_advisory_xact_lock(891107);
  PERFORM l.id FROM sale_line l JOIN sale s ON s.id=l.sale_id
    JOIN stock_recipe r ON r.menu_item_id=l.menu_item_id
    JOIN stock_recipe_line c ON c.menu_item_id=r.menu_item_id AND c.stock_item_id=NEW.stock_item_id
    JOIN stock_item i ON i.id=c.stock_item_id
    WHERE l.id=NEW.sale_line_id AND s.status='pending' AND s.xmin=(pg_current_xact_id()::text)::xid
      AND c.quantity=NEW.per_unit AND NEW.quantity=c.quantity*l.quantity
      AND r.revision=NEW.recipe_revision AND i.name=NEW.name AND i.unit=NEW.unit;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usage requires a new quote and matching recipe'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER protect_stock_usage BEFORE INSERT OR UPDATE OR DELETE ON stock_usage FOR EACH ROW EXECUTE FUNCTION protect_stock_usage();
--> statement-breakpoint
CREATE FUNCTION capture_stock_usage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(891107);
  INSERT INTO stock_usage (sale_line_id,stock_item_id,name,unit,per_unit,quantity,recipe_revision)
    SELECT NEW.id,i.id,i.name,i.unit,c.quantity,c.quantity*NEW.quantity,r.revision
    FROM stock_recipe_line c JOIN stock_recipe r ON r.menu_item_id=c.menu_item_id
    JOIN stock_item i ON i.id=c.stock_item_id WHERE c.menu_item_id=NEW.menu_item_id ORDER BY i.id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER sale_line_stock_usage AFTER INSERT ON sale_line FOR EACH ROW EXECUTE FUNCTION capture_stock_usage();
--> statement-breakpoint
CREATE FUNCTION guard_stock_recipe() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(891107);
  IF TG_TABLE_NAME='stock_recipe' THEN
    IF TG_OP='INSERT' AND NEW.revision<>1 THEN RAISE EXCEPTION 'Invalid recipe revision'; END IF;
    IF TG_OP='UPDATE' AND (NEW.menu_item_id<>OLD.menu_item_id OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Invalid recipe revision'; END IF;
  ELSIF TG_OP<>'DELETE' THEN
    IF TG_OP='INSERT' AND (SELECT count(*) FROM stock_recipe_line WHERE menu_item_id=NEW.menu_item_id)>=20 THEN RAISE EXCEPTION 'Recipe exceeds 20 items'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
--> statement-breakpoint
CREATE TRIGGER guard_stock_recipe BEFORE INSERT OR UPDATE OR DELETE ON stock_recipe FOR EACH ROW EXECUTE FUNCTION guard_stock_recipe();
--> statement-breakpoint
CREATE TRIGGER guard_stock_recipe_line BEFORE INSERT OR UPDATE OR DELETE ON stock_recipe_line FOR EACH ROW EXECUTE FUNCTION guard_stock_recipe();
--> statement-breakpoint
CREATE FUNCTION apply_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item stock_item%ROWTYPE; parent sale%ROWTYPE; receipt jsonb; required bigint;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Stock history is immutable'; END IF;
  PERFORM pg_advisory_xact_lock(891107);
  SELECT * INTO item FROM stock_item WHERE id=NEW.stock_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock item missing'; END IF;
  IF NEW.kind='sale' THEN
    SELECT * INTO parent FROM sale WHERE id=NEW.sale_id AND status='completed' AND xmin=(pg_current_xact_id()::text)::xid;
    SELECT sum(u.quantity)::bigint INTO required FROM stock_usage u JOIN sale_line l ON l.id=u.sale_line_id WHERE l.sale_id=NEW.sale_id AND u.stock_item_id=NEW.stock_item_id;
    IF parent.id IS NULL OR required IS NULL OR NEW.delta<>-required THEN RAISE EXCEPTION 'Sale usage does not match its snapshot'; END IF;
    NEW.actor:=parent.cashier_name; NEW.sale_reference:=parent.reference;
  ELSE
    SELECT result INTO receipt FROM stock_operation WHERE id=NEW.operation_id;
    IF receipt IS NULL OR receipt->>'stockItemId' IS DISTINCT FROM NEW.stock_item_id::text OR
      (NEW.kind='opening' AND (receipt->>'action'<>'create' OR NEW.delta<0)) OR
      (NEW.kind='restock' AND (receipt->>'action'<>'restock' OR NEW.delta<=0)) OR
      (NEW.kind='adjust' AND receipt->>'action'<>'adjust') THEN RAISE EXCEPTION 'Invalid stock operation'; END IF;
    NEW.name:=item.name; NEW.unit:=item.unit; NEW.actor:='owner';
  END IF;
  -- Record application time after serialization, rather than transaction start
  -- time: a request can wait behind another sale/restock for the module lock.
  NEW.created_at:=clock_timestamp();
  NEW.balance_after:=item.balance+NEW.delta;
  UPDATE stock_item SET balance=NEW.balance_after,revision=revision+1 WHERE id=item.id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER apply_stock_movement BEFORE INSERT OR UPDATE OR DELETE ON stock_movement FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();
--> statement-breakpoint
CREATE FUNCTION consume_sale_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='completed' AND OLD.status<>'completed' THEN
    PERFORM pg_advisory_xact_lock(891107);
    INSERT INTO stock_movement (stock_item_id,name,unit,kind,delta,balance_after,reason,actor,sale_id,sale_reference)
      SELECT u.stock_item_id,min(u.name),min(u.unit),'sale',-sum(u.quantity),0,'',NEW.cashier_name,NEW.id,NEW.reference
      FROM stock_usage u JOIN sale_line l ON l.id=u.sale_line_id WHERE l.sale_id=NEW.id
      GROUP BY u.stock_item_id ORDER BY u.stock_item_id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER sale_stock_consumption AFTER UPDATE OF status ON sale FOR EACH ROW EXECUTE FUNCTION consume_sale_stock();

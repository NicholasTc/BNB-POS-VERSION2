CREATE TABLE "order_ticket" (
	"sale_id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"finished_by" uuid,
	"finished_by_name" text,
	"finished_session_id" uuid,
	CONSTRAINT "valid_order_finish" CHECK (("order_ticket"."finished_at" IS NULL AND "order_ticket"."finished_by" IS NULL AND "order_ticket"."finished_by_name" IS NULL AND "order_ticket"."finished_session_id" IS NULL) OR ("order_ticket"."finished_at" IS NOT NULL AND "order_ticket"."finished_at">="order_ticket"."received_at" AND "order_ticket"."finished_by" IS NOT NULL AND "order_ticket"."finished_by_name" IS NOT NULL AND "order_ticket"."finished_session_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "work_session_shift" (
	"attendance_id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"employee_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opening_attendance_id" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "work_session_opening_attendance_id_unique" UNIQUE("opening_attendance_id"),
	CONSTRAINT "valid_work_session" CHECK ("work_session"."closed_at" IS NULL OR "work_session"."closed_at">="work_session"."opened_at")
);
--> statement-breakpoint
ALTER TABLE "order_ticket" ADD CONSTRAINT "order_ticket_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_ticket" ADD CONSTRAINT "order_ticket_session_id_work_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."work_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_ticket" ADD CONSTRAINT "order_ticket_finished_by_employee_id_fk" FOREIGN KEY ("finished_by") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_ticket" ADD CONSTRAINT "order_ticket_finished_session_id_work_session_id_fk" FOREIGN KEY ("finished_session_id") REFERENCES "public"."work_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_shift" ADD CONSTRAINT "work_session_shift_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session_shift" ADD CONSTRAINT "work_session_shift_session_id_work_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."work_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session" ADD CONSTRAINT "work_session_opening_attendance_id_attendance_id_fk" FOREIGN KEY ("opening_attendance_id") REFERENCES "public"."attendance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_session_idx" ON "order_ticket" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "order_pending_idx" ON "order_ticket" USING btree ("received_at","sale_id") WHERE "order_ticket"."finished_at" IS NULL;--> statement-breakpoint
CREATE INDEX "order_finished_idx" ON "order_ticket" USING btree ("finished_session_id","finished_at","sale_id") WHERE "order_ticket"."finished_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "session_shift_session_idx" ON "work_session_shift" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_work_session" ON "work_session" USING btree ((true)) WHERE "work_session"."closed_at" IS NULL;--> statement-breakpoint
-- Attendance-driven work sessions. Device actions already serialize attendance;
-- this module lock also serializes trigger capture without touching sale state.
CREATE FUNCTION capture_work_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_session uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(891105);
  IF TG_OP='INSERT' AND NEW.clock_out IS NULL THEN
    SELECT id INTO current_session FROM work_session WHERE closed_at IS NULL;
    IF current_session IS NULL THEN
      INSERT INTO work_session (opening_attendance_id,opened_at)
      VALUES (NEW.id,NEW.clock_in) RETURNING id INTO current_session;
    END IF;
    INSERT INTO work_session_shift (attendance_id,session_id,employee_name)
    SELECT NEW.id,current_session,name FROM employee WHERE id=NEW.employee_id;
  ELSIF TG_OP='UPDATE' AND OLD.clock_out IS NULL AND NEW.clock_out IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM attendance WHERE clock_out IS NULL) THEN
      UPDATE work_session SET closed_at=GREATEST(NEW.clock_out,opened_at)
      WHERE closed_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attendance_work_session AFTER INSERT OR UPDATE OF clock_out ON attendance
FOR EACH ROW EXECUTE FUNCTION capture_work_session();
--> statement-breakpoint
CREATE FUNCTION capture_preparation_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_session uuid;
BEGIN
  IF NEW.status='completed' AND OLD.status<>'completed' THEN
    PERFORM pg_advisory_xact_lock(891105);
    SELECT w.id INTO current_session FROM work_session w
    JOIN work_session_shift m ON m.session_id=w.id
    JOIN attendance a ON a.id=m.attendance_id
    WHERE w.closed_at IS NULL AND a.clock_out IS NULL
      AND a.employee_id=NEW.cashier_id;
    -- Direct historical imports without an active shift are not kitchen orders.
    -- All authorized application completions have a verified active cashier.
    IF current_session IS NOT NULL THEN
      INSERT INTO order_ticket (sale_id,session_id,received_at)
      VALUES (NEW.id,current_session,NEW.completed_at)
      ON CONFLICT (sale_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER sale_preparation_order AFTER UPDATE OF status ON sale
FOR EACH ROW EXECUTE FUNCTION capture_preparation_order();
--> statement-breakpoint
-- Adopt active shifts only. Do not invent preparation state for old sales.
INSERT INTO work_session (opening_attendance_id,opened_at)
SELECT id,clock_in FROM attendance WHERE clock_out IS NULL ORDER BY clock_in,id LIMIT 1;
--> statement-breakpoint
INSERT INTO work_session_shift (attendance_id,session_id,employee_name)
SELECT a.id,w.id,e.name FROM attendance a
JOIN employee e ON e.id=a.employee_id CROSS JOIN work_session w
WHERE a.clock_out IS NULL AND w.closed_at IS NULL;

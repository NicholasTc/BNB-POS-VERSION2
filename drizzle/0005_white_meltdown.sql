CREATE TABLE "sheets_sync_job" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sheets_sync_job_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"sale_id" uuid,
	"attendance_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"synced_revision" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sheets_source" UNIQUE("kind","source_id"),
	CONSTRAINT "sheets_job_source" CHECK (("sheets_sync_job"."kind"='sale' AND "sheets_sync_job"."source_id"="sheets_sync_job"."sale_id" AND "sheets_sync_job"."sale_id" IS NOT NULL AND "sheets_sync_job"."attendance_id" IS NULL) OR ("sheets_sync_job"."kind"='attendance' AND "sheets_sync_job"."source_id"="sheets_sync_job"."attendance_id" AND "sheets_sync_job"."attendance_id" IS NOT NULL AND "sheets_sync_job"."sale_id" IS NULL)),
	CONSTRAINT "sheets_job_versions" CHECK ("sheets_sync_job"."revision">0 AND "sheets_sync_job"."synced_revision">=0 AND "sheets_sync_job"."synced_revision"<="sheets_sync_job"."revision" AND "sheets_sync_job"."attempts">=0)
);
--> statement-breakpoint
CREATE TABLE "sheets_sync_row" (
	"tab" text NOT NULL,
	"source_id" uuid NOT NULL,
	"job_id" bigint NOT NULL,
	"row_number" integer NOT NULL,
	CONSTRAINT "sheets_sync_row_tab_source_id_pk" PRIMARY KEY("tab","source_id"),
	CONSTRAINT "sheets_row_position" UNIQUE("tab","row_number"),
	CONSTRAINT "sheets_row_valid" CHECK ("sheets_sync_row"."row_number">=2 AND "sheets_sync_row"."tab" IN ('Sales','Sale items','Attendance'))
);
--> statement-breakpoint
CREATE TABLE "sheets_sync_target" (
	"id" text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	"spreadsheet_id" text NOT NULL,
	"mode" text NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sheets_target_valid" CHECK ("sheets_sync_target"."id"='primary' AND "sheets_sync_target"."mode" IN ('test','live'))
);
--> statement-breakpoint
ALTER TABLE "sheets_sync_job" ADD CONSTRAINT "sheets_sync_job_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheets_sync_job" ADD CONSTRAINT "sheets_sync_job_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheets_sync_row" ADD CONSTRAINT "sheets_sync_row_job_id_sheets_sync_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."sheets_sync_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sheets_due" ON "sheets_sync_job" USING btree ("next_attempt_at") WHERE "sheets_sync_job"."synced_revision"<"sheets_sync_job"."revision";--> statement-breakpoint
-- Transactional outbox: no Google/network work occurs in the POS transaction.
CREATE FUNCTION lisi_queue_sheet_sale() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO sheets_sync_job (kind,source_id,sale_id) VALUES ('sale',NEW.id,NEW.id)
      ON CONFLICT (kind,source_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lisi_sheet_sale AFTER INSERT OR UPDATE OF status ON sale
  FOR EACH ROW EXECUTE FUNCTION lisi_queue_sheet_sale();
--> statement-breakpoint
CREATE FUNCTION lisi_queue_sheet_attendance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.clock_out IS DISTINCT FROM NEW.clock_out THEN
    INSERT INTO sheets_sync_job (kind,source_id,attendance_id) VALUES ('attendance',NEW.id,NEW.id)
      ON CONFLICT (kind,source_id) DO UPDATE SET revision=sheets_sync_job.revision+1,
      updated_at=now(),next_attempt_at=now(),attempts=0,last_error=NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lisi_sheet_attendance AFTER INSERT OR UPDATE OF clock_out ON attendance
  FOR EACH ROW EXECUTE FUNCTION lisi_queue_sheet_attendance();
--> statement-breakpoint
CREATE FUNCTION lisi_queue_sheet_employee_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sheets_sync_job (kind,source_id,attendance_id)
    SELECT 'attendance',id,id FROM attendance WHERE employee_id=NEW.id
    ON CONFLICT (kind,source_id) DO UPDATE SET revision=sheets_sync_job.revision+1,
    updated_at=now(),next_attempt_at=now(),attempts=0,last_error=NULL;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lisi_sheet_employee_name AFTER UPDATE OF name ON employee
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION lisi_queue_sheet_employee_name();
--> statement-breakpoint
INSERT INTO sheets_sync_job (kind,source_id,sale_id)
  SELECT 'sale',id,id FROM sale WHERE status='completed' ON CONFLICT (kind,source_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO sheets_sync_job (kind,source_id,attendance_id)
  SELECT 'attendance',id,id FROM attendance ON CONFLICT (kind,source_id) DO NOTHING;

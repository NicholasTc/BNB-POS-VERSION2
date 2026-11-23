CREATE TABLE "diagnostic_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issue_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"frames" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "diagnostic_event_frames" CHECK (jsonb_typeof("diagnostic_event"."frames")='array' AND jsonb_array_length("diagnostic_event"."frames")<=5 AND octet_length("diagnostic_event"."frames"::text)<=1500)
);
--> statement-breakpoint
CREATE TABLE "diagnostic_issue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"severity" text NOT NULL,
	"path" text NOT NULL,
	"method" text NOT NULL,
	"release" text NOT NULL,
	"http_status" integer,
	"error_kind" text NOT NULL,
	"technical_code" text,
	"state" text DEFAULT 'open' NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"occurrences" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "diagnostic_issue_fingerprint_unique" UNIQUE("fingerprint"),
	CONSTRAINT "diagnostic_issue_valid" CHECK ("diagnostic_issue"."fingerprint" ~ '^[a-f0-9]{64}$' AND "diagnostic_issue"."kind" IN ('request_failed','database_connection','server_render','browser_crash','browser_request','cashier_load','sheets_sync','daily_report') AND "diagnostic_issue"."source" IN ('server','browser','worker') AND "diagnostic_issue"."severity" IN ('error','warning') AND "diagnostic_issue"."state" IN ('open','resolved') AND "diagnostic_issue"."occurrences" BETWEEN 0 AND 1000000000 AND "diagnostic_issue"."revision" BETWEEN 0 AND 1000000000 AND length("diagnostic_issue"."path")<=100 AND length("diagnostic_issue"."method")<=10 AND length("diagnostic_issue"."release")<=40 AND length("diagnostic_issue"."error_kind")<=32 AND ("diagnostic_issue"."technical_code" IS NULL OR length("diagnostic_issue"."technical_code")<=40) AND ("diagnostic_issue"."http_status" IS NULL OR "diagnostic_issue"."http_status" BETWEEN 400 AND 599))
);
--> statement-breakpoint
ALTER TABLE "diagnostic_event" ADD CONSTRAINT "diagnostic_event_issue_id_diagnostic_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."diagnostic_issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diagnostic_event_issue_idx" ON "diagnostic_event" USING btree ("issue_id","at");--> statement-breakpoint
CREATE INDEX "diagnostic_event_retention_idx" ON "diagnostic_event" USING btree ("at","id");--> statement-breakpoint
CREATE INDEX "diagnostic_issue_feed_idx" ON "diagnostic_issue" USING btree ("state","last_seen_at","id");--> statement-breakpoint
CREATE INDEX "diagnostic_issue_source_idx" ON "diagnostic_issue" USING btree ("source","last_seen_at");
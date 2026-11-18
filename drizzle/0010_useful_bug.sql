CREATE TABLE "owner_alert_state" (
	"owner_id" text NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"disposition" text DEFAULT 'none' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_alert_state_owner_id_key_pk" PRIMARY KEY("owner_id","key"),
	CONSTRAINT "owner_alert_valid" CHECK ("owner_alert_state"."key" IN ('categories','stock-low','stock-negative','sheets','payment-pending','payment-paid') AND "owner_alert_state"."version">0 AND "owner_alert_state"."disposition" IN ('none','dismissed','snoozed','acknowledged') AND (("owner_alert_state"."disposition"='snoozed' AND "owner_alert_state"."snoozed_until" IS NOT NULL) OR ("owner_alert_state"."disposition"<>'snoozed' AND "owner_alert_state"."snoozed_until" IS NULL)))
);
--> statement-breakpoint
ALTER TABLE "owner_alert_state" ADD CONSTRAINT "owner_alert_state_owner_id_owner_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_stock_restock_idx" ON "stock_movement" USING btree ("stock_item_id","created_at","id") WHERE "stock_movement"."kind"<>'sale';
CREATE TABLE "owner_creation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_creation_owner_id_unique" UNIQUE("owner_id"),
	CONSTRAINT "owner_creation_hash" CHECK ("owner_creation"."request_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "owner_user" DROP CONSTRAINT "one_owner";--> statement-breakpoint
ALTER TABLE "owner_user" ADD COLUMN "role" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_creation" ADD CONSTRAINT "owner_creation_actor_id_owner_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."owner_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_creation" ADD CONSTRAINT "owner_creation_owner_id_owner_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_email_ci" ON "owner_user" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "owner_user" ADD CONSTRAINT "account_role" CHECK ("owner_user"."role" IN ('owner','admin') AND ("owner_user"."role"='admin')=("owner_user"."id"='admin'));
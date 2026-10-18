CREATE TABLE "owner_preferences" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"language" text DEFAULT 'id' NOT NULL,
	CONSTRAINT "owner_language" CHECK ("owner_preferences"."language" IN ('id','en'))
);
--> statement-breakpoint
ALTER TABLE "owner_preferences" ADD CONSTRAINT "owner_preferences_owner_id_owner_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner_user"("id") ON DELETE cascade ON UPDATE no action;
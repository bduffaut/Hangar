CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pairing_code_hash" text,
	"pairing_expires_at" timestamp with time zone,
	"credential_hash" text,
	"paired_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"info" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servers_pairingCodeHash_unique" UNIQUE("pairing_code_hash"),
	CONSTRAINT "servers_credentialHash_unique" UNIQUE("credential_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "local_access" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "servers_owner_id_index" ON "servers" USING btree ("owner_id");
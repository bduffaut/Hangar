CREATE TYPE "public"."address_status" AS ENUM('live', 'app_down', 'not_running', 'elsewhere', 'unreachable', 'no_tunnel');--> statement-breakpoint
CREATE TYPE "public"."link_kind" AS ENUM('invite', 'reset');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "access_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "link_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"label" text,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_links_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "address_checks" (
	"hostname" text PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "address_status" NOT NULL,
	"message" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"last_live_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_token" text;--> statement-breakpoint
-- Every account so far is the owner of this Hangar, so it keeps full control and its projects.
UPDATE "users" SET "role" = 'admin';--> statement-breakpoint
-- Only a development database can have projects without any account. The password hash is not a
-- valid hash, so nobody can sign in with this account.
INSERT INTO "users" ("username", "password_hash", "role")
SELECT 'dev-owner', '!', 'admin'
WHERE EXISTS (SELECT 1 FROM "projects") AND NOT EXISTS (SELECT 1 FROM "users");--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
UPDATE "projects" SET "owner_id" = (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1);--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address_checks" ADD CONSTRAINT "address_checks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_links_user_id_index" ON "access_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "address_checks_project_id_index" ON "address_checks" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_owner_id_index" ON "projects" USING btree ("owner_id");
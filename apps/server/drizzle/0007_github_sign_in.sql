ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_refresh_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_user_id" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_login" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_githubUserId_unique" UNIQUE("github_user_id");
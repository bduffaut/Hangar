CREATE TYPE "public"."deployment_status" AS ENUM('queued', 'building', 'deploying', 'ready', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."deployment_trigger" AS ENUM('push', 'poll', 'manual', 'rollback');--> statement-breakpoint
CREATE TYPE "public"."desired_state" AS ENUM('running', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."failure_code" AS ENUM('clone_failed', 'build_failed', 'build_timeout', 'image_missing', 'container_start_failed', 'health_check_failed', 'interrupted', 'superseded', 'cancelled_by_user', 'internal');--> statement-breakpoint
CREATE TYPE "public"."log_stream" AS ENUM('stdout', 'stderr', 'system');--> statement-breakpoint
CREATE TYPE "public"."trigger_mode" AS ENUM('poll', 'webhook', 'manual');--> statement-breakpoint
CREATE TABLE "deployment_logs" (
	"deployment_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"stream" "log_stream" NOT NULL,
	"line" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_logs_deployment_id_seq_pk" PRIMARY KEY("deployment_id","seq")
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"commit_sha" text NOT NULL,
	"commit_message" text,
	"commit_author" text,
	"branch" text NOT NULL,
	"status" "deployment_status" DEFAULT 'queued' NOT NULL,
	"failure_code" "failure_code",
	"failure_reason" text,
	"image_tag" text,
	"container_id" text,
	"port" integer,
	"trigger" "deployment_trigger" NOT NULL,
	"source_deployment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "deployments_projectId_number_unique" UNIQUE("project_id","number")
);
--> statement-breakpoint
CREATE TABLE "env_vars" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value_encrypted" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "env_vars_projectId_key_unique" UNIQUE("project_id","key")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"repo_url" text NOT NULL,
	"branch" text NOT NULL,
	"root_dir" text DEFAULT '' NOT NULL,
	"port" integer,
	"memory_limit_mb" integer DEFAULT 512 NOT NULL,
	"trigger_mode" "trigger_mode" DEFAULT 'poll' NOT NULL,
	"webhook_secret" text,
	"last_seen_sha" text,
	"current_deployment_id" uuid,
	"desired_state" "desired_state" DEFAULT 'running' NOT NULL,
	"next_deployment_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "deployment_logs" ADD CONSTRAINT "deployment_logs_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_source_deployment_id_deployments_id_fk" FOREIGN KEY ("source_deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_vars" ADD CONSTRAINT "env_vars_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_deployment_id_deployments_id_fk" FOREIGN KEY ("current_deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployments_active_idx" ON "deployments" USING btree ("status") WHERE "deployments"."status" in ('queued', 'building', 'deploying');--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");
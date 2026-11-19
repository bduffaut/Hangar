CREATE TYPE "public"."app_kind" AS ENUM('source', 'image');--> statement-breakpoint
CREATE TYPE "public"."deploy_strategy" AS ENUM('rolling', 'recreate');--> statement-breakpoint
ALTER TYPE "public"."failure_code" ADD VALUE 'pull_failed' BEFORE 'build_failed';--> statement-breakpoint
ALTER TYPE "public"."failure_code" ADD VALUE 'not_permitted' BEFORE 'build_failed';--> statement-breakpoint
CREATE TABLE "app_libraries" (
	"project_id" uuid NOT NULL,
	"library_id" uuid NOT NULL,
	"mount_path" text NOT NULL,
	"writable" boolean DEFAULT false NOT NULL,
	CONSTRAINT "app_libraries_project_id_mount_path_pk" PRIMARY KEY("project_id","mount_path")
);
--> statement-breakpoint
CREATE TABLE "app_volumes" (
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mount_path" text NOT NULL,
	CONSTRAINT "app_volumes_project_id_name_pk" PRIMARY KEY("project_id","name"),
	CONSTRAINT "app_volumes_projectId_mountPath_unique" UNIQUE("project_id","mount_path")
);
--> statement-breakpoint
CREATE TABLE "libraries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"writable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "libraries_name_unique" UNIQUE("name"),
	CONSTRAINT "libraries_path_unique" UNIQUE("path")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kind" "app_kind" DEFAULT 'source' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "catalog_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "strategy" "deploy_strategy" DEFAULT 'rolling' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "gpu" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_libraries" ADD CONSTRAINT "app_libraries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_libraries" ADD CONSTRAINT "app_libraries_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_volumes" ADD CONSTRAINT "app_volumes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
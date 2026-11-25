CREATE TABLE "app_devices" (
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"mount_path" text NOT NULL,
	CONSTRAINT "app_devices_project_id_mount_path_pk" PRIMARY KEY("project_id","mount_path")
);
--> statement-breakpoint
ALTER TABLE "app_devices" ADD CONSTRAINT "app_devices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
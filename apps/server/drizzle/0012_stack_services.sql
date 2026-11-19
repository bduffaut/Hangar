ALTER TABLE "app_volumes" DROP CONSTRAINT "app_volumes_projectId_mountPath_unique";--> statement-breakpoint
ALTER TABLE "app_volumes" ADD COLUMN "service" text;--> statement-breakpoint
ALTER TABLE "app_volumes" ADD CONSTRAINT "app_volumes_projectId_service_mountPath_unique" UNIQUE NULLS NOT DISTINCT("project_id","service","mount_path");
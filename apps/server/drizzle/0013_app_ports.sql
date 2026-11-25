CREATE TYPE "public"."port_protocol" AS ENUM('tcp', 'udp');--> statement-breakpoint
CREATE TABLE "app_ports" (
	"project_id" uuid NOT NULL,
	"port" integer NOT NULL,
	"protocol" "port_protocol" NOT NULL,
	"host_port" integer NOT NULL,
	CONSTRAINT "app_ports_project_id_port_protocol_pk" PRIMARY KEY("project_id","port","protocol"),
	CONSTRAINT "app_ports_hostPort_protocol_unique" UNIQUE("host_port","protocol")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "web" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app_ports" ADD CONSTRAINT "app_ports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
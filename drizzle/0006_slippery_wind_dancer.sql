CREATE TABLE "smtp_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"host" varchar(255) NOT NULL,
	"port" integer DEFAULT 587 NOT NULL,
	"secure" boolean DEFAULT false NOT NULL,
	"username" varchar(255),
	"encrypted_password" text,
	"iv" varchar(64),
	"auth_tag" varchar(64),
	"from_address" varchar(255) NOT NULL,
	"from_name" varchar(255) DEFAULT 'AnsibleGUI' NOT NULL,
	"recipients" text[] DEFAULT '{}' NOT NULL,
	"on_failure" boolean DEFAULT true NOT NULL,
	"on_success" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "smtp_settings_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "notification_settings" DROP CONSTRAINT "notification_settings_organization_id_unique";--> statement-breakpoint
ALTER TABLE "notification_settings" ALTER COLUMN "channel_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "webhook_tokens" ADD COLUMN "git_branch" varchar(255);--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "extra_vars" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "smtp_settings" ADD CONSTRAINT "smtp_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "execution_logs_execution_id_idx" ON "execution_logs" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "executions_organization_id_idx" ON "executions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "executions_status_idx" ON "executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inventories_organization_id_idx" ON "inventories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_groups_inventory_id_idx" ON "inventory_groups" USING btree ("inventory_id");--> statement-breakpoint
CREATE INDEX "inventory_hosts_group_id_idx" ON "inventory_hosts" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_settings_org_channel_idx" ON "notification_settings" USING btree ("organization_id","channel_type");--> statement-breakpoint
CREATE INDEX "playbook_versions_playbook_id_idx" ON "playbook_versions" USING btree ("playbook_id");--> statement-breakpoint
CREATE INDEX "playbooks_organization_id_idx" ON "playbooks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "schedules_organization_id_idx" ON "schedules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "servers_organization_id_idx" ON "servers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ssh_keys_organization_id_idx" ON "ssh_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workflow_executions_organization_id_idx" ON "workflow_executions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workflow_step_executions_workflow_execution_id_idx" ON "workflow_step_executions" USING btree ("workflow_execution_id");--> statement-breakpoint
CREATE INDEX "workflow_steps_workflow_id_idx" ON "workflow_steps" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflows_organization_id_idx" ON "workflows" USING btree ("organization_id");
ALTER TABLE "playbooks" ADD COLUMN "community_source_id" uuid;--> statement-breakpoint
ALTER TABLE "playbooks" ADD COLUMN "community_author_name" varchar(255);--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "ip_address" varchar(45);
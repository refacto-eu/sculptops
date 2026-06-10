ALTER TABLE "users" ADD COLUMN "github_id" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_username" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_avatar_url" varchar(500);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_profile_url" varchar(500);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "community_submit_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "community_connected_at" timestamp;--> statement-breakpoint
ALTER TABLE "playbooks" ADD COLUMN "community_source_name" varchar(255);
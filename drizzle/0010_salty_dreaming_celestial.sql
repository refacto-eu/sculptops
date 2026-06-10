ALTER TABLE "playbooks" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "github_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "github_username";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "github_avatar_url";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "github_profile_url";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "community_connected_at";
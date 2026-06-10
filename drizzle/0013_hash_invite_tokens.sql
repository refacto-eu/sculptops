CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
UPDATE "invite_tokens"
SET "token" = encode(digest("token", 'sha256'), 'hex')
WHERE "token" IS NOT NULL;--> statement-breakpoint

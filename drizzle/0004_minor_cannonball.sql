ALTER TABLE "api_keys" ADD COLUMN "previous_key_hash" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "previous_key_prefix" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "previous_key_expires_at" timestamp;
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb,
	"session_ids" jsonb DEFAULT '[]'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"retries" integer DEFAULT 3,
	"timeout_ms" integer DEFAULT 10000,
	"last_delivery_at" timestamp,
	"last_delivery_status" text,
	"delivery_count" integer DEFAULT 0,
	"failure_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

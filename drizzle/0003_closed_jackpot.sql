CREATE TABLE "conversation_states" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"jid" text NOT NULL,
	"agent_id" text,
	"context" jsonb DEFAULT '{}'::jsonb,
	"history" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

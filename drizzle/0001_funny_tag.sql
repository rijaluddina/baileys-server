CREATE TABLE "sent_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"to" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"status_updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

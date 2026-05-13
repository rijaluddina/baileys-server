/*
  Warnings:

  - You are about to drop the column `key` on the `auth_credentials` table. All the data in the column will be lost.
  - You are about to drop the column `value` on the `auth_credentials` table. All the data in the column will be lost.
  - You are about to drop the column `img_url` on the `contacts` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[session_id,type,key_id]` on the table `auth_credentials` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `data` to the `auth_credentials` table without a default value. This is not possible if the table is not empty.
  - Added the required column `key_id` to the `auth_credentials` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `auth_credentials` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "auth_credentials_session_id_key_key";

-- AlterTable
ALTER TABLE "auth_credentials" DROP COLUMN "key",
DROP COLUMN "value",
ADD COLUMN     "data" TEXT NOT NULL,
ADD COLUMN     "key_id" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "mute_end_time" BIGINT;

-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "img_url",
ADD COLUMN     "profile_picture_url" TEXT,
ADD COLUMN     "push_name" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "context_info" JSONB,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "group_jid" TEXT NOT NULL,
    "subject" TEXT,
    "group_description" TEXT,
    "owner_jid" TEXT,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "headers" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sequence_number" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "response" JSONB,
    "status_code" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_group_jid_key" ON "groups"("group_jid");

-- CreateIndex
CREATE INDEX "groups_session_id_idx" ON "groups"("session_id");

-- CreateIndex
CREATE INDEX "webhooks_session_id_idx" ON "webhooks"("session_id");

-- CreateIndex
CREATE INDEX "webhooks_active_idx" ON "webhooks"("active");

-- CreateIndex
CREATE INDEX "session_events_session_id_sequence_number_idx" ON "session_events"("session_id", "sequence_number");

-- CreateIndex
CREATE INDEX "session_events_session_id_event_type_idx" ON "session_events"("session_id", "event_type");

-- CreateIndex
CREATE INDEX "audit_logs_session_id_idx" ON "audit_logs"("session_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_credentials_session_id_type_key_id_key" ON "auth_credentials"("session_id", "type", "key_id");

-- CreateIndex
CREATE INDEX "messages_session_id_status_idx" ON "messages"("session_id", "status");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

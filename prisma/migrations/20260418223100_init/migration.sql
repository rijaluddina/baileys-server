-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'close',
    "webhook_url" TEXT,
    "user_jid" TEXT,
    "user_name" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_credentials" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "remote_jid" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "from_me" BOOLEAN NOT NULL DEFAULT false,
    "participant" TEXT,
    "push_name" TEXT,
    "message_type" TEXT,
    "content" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "name" TEXT,
    "notify" TEXT,
    "img_url" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chats" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "name" TEXT,
    "conversation_timestamp" BIGINT,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status_code" INTEGER,
    "response" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_credentials_session_id_idx" ON "auth_credentials"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_credentials_session_id_key_key" ON "auth_credentials"("session_id", "key");

-- CreateIndex
CREATE INDEX "messages_session_id_remote_jid_idx" ON "messages"("session_id", "remote_jid");

-- CreateIndex
CREATE INDEX "messages_session_id_timestamp_idx" ON "messages"("session_id", "timestamp");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_session_id_remote_jid_message_id_key" ON "messages"("session_id", "remote_jid", "message_id");

-- CreateIndex
CREATE INDEX "contacts_session_id_idx" ON "contacts"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_session_id_jid_key" ON "contacts"("session_id", "jid");

-- CreateIndex
CREATE INDEX "chats_session_id_idx" ON "chats"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "chats_session_id_jid_key" ON "chats"("session_id", "jid");

-- CreateIndex
CREATE INDEX "webhook_logs_session_id_idx" ON "webhook_logs"("session_id");

-- CreateIndex
CREATE INDEX "webhook_logs_created_at_idx" ON "webhook_logs"("created_at");

-- CreateIndex
CREATE INDEX "webhook_logs_success_idx" ON "webhook_logs"("success");

-- AddForeignKey
ALTER TABLE "auth_credentials" ADD CONSTRAINT "auth_credentials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

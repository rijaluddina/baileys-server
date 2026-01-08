import { pgTable, text, timestamp, jsonb, boolean, integer } from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
    id: text("id").primaryKey(),
    name: text("name"),
    status: text("status").notNull().default("disconnected"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const authStates = pgTable("auth_states", {
    sessionId: text("session_id")
        .primaryKey()
        .references(() => sessions.id, { onDelete: "cascade" }),
    creds: jsonb("creds"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export const authKeys = pgTable("auth_keys", {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
        .notNull()
        .references(() => sessions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    keyId: text("key_id").notNull(),
    keyData: jsonb("key_data").notNull(),
});

// API Keys for REST authentication
export const apiKeys = pgTable("api_keys", {
    id: text("id").primaryKey(), // UUID
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(), // SHA-256 hash of the key
    keyPrefix: text("key_prefix").notNull(), // First 8 chars for identification
    role: text("role").notNull().default("operator"), // viewer, operator, admin
    sessionIds: jsonb("session_ids").$type<string[]>().default([]), // Allowed sessions (empty = all)
    rateLimit: integer("rate_limit").default(100), // Requests per minute
    active: boolean("active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by"),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AuthState = typeof authStates.$inferSelect;
export type AuthKey = typeof authKeys.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;


import { eq, and } from "drizzle-orm";
import { db } from "@infrastructure/database";
import { apiKeys, type ApiKey, type NewApiKey } from "@infrastructure/database/schema";
import { logger } from "@infrastructure/logger";

export type Role = "viewer" | "operator" | "admin";

export interface ApiKeyInfo {
    id: string;
    name: string;
    role: Role;
    sessionIds: string[];
    rateLimit: number;
    active: boolean;
}

// Permission matrix
const PERMISSIONS: Record<Role, Record<string, boolean>> = {
    viewer: {
        "sessions:read": true,
        "messages:read": true,
        "contacts:read": true,
        "groups:read": true,
        "presence:read": true,
    },
    operator: {
        "sessions:read": true,
        "messages:read": true,
        "messages:write": true,
        "contacts:read": true,
        "contacts:write": true,
        "groups:read": true,
        "groups:write": true,
        "presence:read": true,
        "presence:write": true,
    },
    admin: {
        "sessions:read": true,
        "sessions:write": true,
        "sessions:delete": true,
        "messages:read": true,
        "messages:write": true,
        "messages:delete": true,
        "contacts:read": true,
        "contacts:write": true,
        "groups:read": true,
        "groups:write": true,
        "groups:delete": true,
        "presence:read": true,
        "presence:write": true,
        "admin:read": true,
        "admin:write": true,
    },
};

export class AuthService {
    private readonly log = logger.child({ component: "auth-service" });

    /**
     * Generate a new API key
     */
    async createApiKey(
        name: string,
        role: Role = "operator",
        options: {
            sessionIds?: string[];
            rateLimit?: number;
            expiresAt?: Date;
            createdBy?: string;
        } = {}
    ): Promise<{ key: string; info: ApiKeyInfo }> {
        const id = crypto.randomUUID();
        const rawKey = `wsk_${this.generateRandomString(32)}`;
        const keyHash = await this.hashKey(rawKey);
        const keyPrefix = rawKey.slice(0, 12);

        await db.insert(apiKeys).values({
            id,
            name,
            keyHash,
            keyPrefix,
            role,
            sessionIds: options.sessionIds ?? [],
            rateLimit: options.rateLimit ?? 100,
            expiresAt: options.expiresAt ?? null,
            createdBy: options.createdBy ?? null,
        });

        this.log.info({ id, name, role }, "API key created");

        return {
            key: rawKey, // Only returned once!
            info: {
                id,
                name,
                role,
                sessionIds: options.sessionIds ?? [],
                rateLimit: options.rateLimit ?? 100,
                active: true,
            },
        };
    }

    /**
     * Validate an API key and return its info
     */
    async validateKey(rawKey: string): Promise<ApiKeyInfo | null> {
        if (!rawKey.startsWith("wsk_")) {
            return null;
        }

        const keyHash = await this.hashKey(rawKey);
        const keyPrefix = rawKey.slice(0, 12);

        const [result] = await db
            .select()
            .from(apiKeys)
            .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.keyPrefix, keyPrefix)))
            .limit(1);

        if (!result) {
            return null;
        }

        // Check if active
        if (!result.active) {
            return null;
        }

        // Check expiry
        if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
            return null;
        }

        // Update last used
        await db
            .update(apiKeys)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiKeys.id, result.id));

        return {
            id: result.id,
            name: result.name,
            role: result.role as Role,
            sessionIds: (result.sessionIds as string[]) ?? [],
            rateLimit: result.rateLimit ?? 100,
            active: result.active,
        };
    }

    /**
     * Check if a role has a specific permission
     */
    hasPermission(role: Role, permission: string): boolean {
        return PERMISSIONS[role]?.[permission] ?? false;
    }

    /**
     * Check if API key can access a specific session
     */
    canAccessSession(keyInfo: ApiKeyInfo, sessionId: string): boolean {
        // Empty array means access to all sessions
        if (!keyInfo.sessionIds || keyInfo.sessionIds.length === 0) {
            return true;
        }
        return keyInfo.sessionIds.includes(sessionId);
    }

    /**
     * Revoke an API key
     */
    async revokeKey(keyId: string): Promise<void> {
        await db
            .update(apiKeys)
            .set({ active: false })
            .where(eq(apiKeys.id, keyId));

        this.log.info({ keyId }, "API key revoked");
    }

    /**
     * List all API keys (without hashes)
     */
    async listKeys(): Promise<ApiKeyInfo[]> {
        const results = await db.select().from(apiKeys);

        return results.map((r) => ({
            id: r.id,
            name: r.name,
            role: r.role as Role,
            sessionIds: (r.sessionIds as string[]) ?? [],
            rateLimit: r.rateLimit ?? 100,
            active: r.active,
        }));
    }

    private async hashKey(key: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(key);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    private generateRandomString(length: number): string {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        const randomValues = new Uint8Array(length);
        crypto.getRandomValues(randomValues);
        for (let i = 0; i < length; i++) {
            const index = randomValues[i]! % chars.length;
            result += chars[index];
        }
        return result;
    }
}

export const authService = new AuthService();

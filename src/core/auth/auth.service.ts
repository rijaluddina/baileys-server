import { eq, and, or } from "drizzle-orm";
import { db } from "@infrastructure/database";
import { apiKeys, users, organizations } from "@infrastructure/database/schema";
import { logger } from "@infrastructure/logger";
import { audit, AuditActions } from "@infrastructure/logger/audit-logger";
import { type Role } from "./permission.service";

export interface ApiKeyInfo {
    id: string;
    organizationId: string | null;
    userId: string | null;
    name: string;
    role: Role;
    sessionIds: string[];
    rateLimit: number;
    active: boolean;
}

export interface UserInfo {
    id: string;
    email: string;
    name: string;
    globalRole: string; // "owner" | "standard"
}

export class AuthService {
    private readonly log = logger.child({ component: "auth-service" });

    /**
     * Generate a new API key
     */
    async createApiKey(
        name: string,
        role: Role = "operator",
        options: {
            organizationId?: string | null;
            userId?: string | null;
            sessionIds?: string[];
            rateLimit?: number;
            expiresAt?: Date;
            createdBy?: string;
        } = {}
    ): Promise<{ key: string; info: ApiKeyInfo }> {
        // Validate existence to prevent Foreign Key Constraint errors
        if (options.organizationId) {
            const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, options.organizationId)).limit(1);
            if (!org) throw new Error("Organization not found");
        }
        if (options.userId) {
            const [usr] = await db.select({ id: users.id }).from(users).where(eq(users.id, options.userId)).limit(1);
            if (!usr) throw new Error("User not found");
        }

        const id = crypto.randomUUID();
        const rawKey = `wsk_${this.generateRandomString(32)}`;
        const keyHash = await this.hashKey(rawKey);
        const keyPrefix = rawKey.slice(0, 12);

        await db.insert(apiKeys).values({
            id,
            organizationId: options.organizationId ?? null,
            userId: options.userId ?? null,
            name,
            keyHash,
            keyPrefix,
            role,
            sessionIds: options.sessionIds ?? [],
            rateLimit: options.rateLimit ?? 100,
            expiresAt: options.expiresAt ?? null,
            createdBy: options.createdBy ?? null,
        });

        audit({
            action: AuditActions.API_KEY_CREATED,
            actor: options.createdBy ?? "system",
            resource: "api_key",
            resourceId: id,
            result: "success",
            details: { name, role, organizationId: options.organizationId },
        });

        this.log.info({ id, name, role, organizationId: options.organizationId }, "API key created");

        return {
            key: rawKey, // Only returned once!
            info: {
                id,
                organizationId: options.organizationId ?? null,
                userId: options.userId ?? null,
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
            .where(
                or(
                    and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.keyPrefix, keyPrefix)),
                    and(eq(apiKeys.previousKeyHash, keyHash), eq(apiKeys.previousKeyPrefix, keyPrefix))
                )
            )
            .limit(1);

        if (!result) {
            return null;
        }

        // Verify if matched previous key but it's expired
        if (result.previousKeyHash === keyHash && result.previousKeyPrefix === keyPrefix) {
            if (result.previousKeyExpiresAt && new Date(result.previousKeyExpiresAt) < new Date()) {
                return null;
            }
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
            organizationId: result.organizationId,
            userId: result.userId,
            name: result.name,
            role: result.role as Role,
            sessionIds: (result.sessionIds as string[]) ?? [],
            rateLimit: result.rateLimit ?? 100,
            active: result.active,
        };
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

        audit({
            action: AuditActions.API_KEY_REVOKED,
            actor: "system",
            resource: "api_key",
            resourceId: keyId,
            result: "success",
        });

        this.log.info({ keyId }, "API key revoked");
    }

    /**
     * List all API keys (without hashes)
     */
    async listKeys(organizationId?: string): Promise<ApiKeyInfo[]> {
        let query = db.select().from(apiKeys);
        if (organizationId) {
            query = query.where(eq(apiKeys.organizationId, organizationId)) as any;
        }
        
        const results = await query;

        return results.map((r) => ({
            id: r.id,
            organizationId: r.organizationId,
            userId: r.userId,
            name: r.name,
            role: r.role as Role,
            sessionIds: (r.sessionIds as string[]) ?? [],
            rateLimit: r.rateLimit ?? 100,
            active: r.active,
        }));
    }

    /**
     * Get API key by ID
     */
    async getKeyById(keyId: string): Promise<ApiKeyInfo | null> {
        const [result] = await db
            .select()
            .from(apiKeys)
            .where(eq(apiKeys.id, keyId))
            .limit(1);

        if (!result) return null;

        return {
            id: result.id,
            organizationId: result.organizationId,
            userId: result.userId,
            name: result.name,
            role: result.role as Role,
            sessionIds: (result.sessionIds as string[]) ?? [],
            rateLimit: result.rateLimit ?? 100,
            active: result.active,
        };
    }

    /**
     * Update API key properties
     */
    async updateKey(keyId: string, updates: Partial<Omit<ApiKeyInfo, "id">>): Promise<ApiKeyInfo | null> {
        const [result] = await db
            .update(apiKeys)
            .set(updates)
            .where(eq(apiKeys.id, keyId))
            .returning();

        if (!result) return null;

        audit({
            action: AuditActions.API_KEY_UPDATED,
            actor: "system",
            resource: "api_key",
            resourceId: keyId,
            result: "success",
            details: updates,
        });

        return {
            id: result.id,
            organizationId: result.organizationId,
            userId: result.userId,
            name: result.name,
            role: result.role as Role,
            sessionIds: (result.sessionIds as string[]) ?? [],
            rateLimit: result.rateLimit ?? 100,
            active: result.active,
        };
    }

    /**
     * Rotate an API key with an optional grace period
     */
    async rotateKey(
        keyId: string, 
        options: { immediate?: boolean; gracePeriodHours?: number } = {}
    ): Promise<{ key: string; info: ApiKeyInfo } | null> {
        const { immediate = false, gracePeriodHours = 24 } = options;
        
        const [currentKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1);
        if (!currentKey) return null;

        const rawKey = `wsk_${this.generateRandomString(32)}`;
        const keyHash = await this.hashKey(rawKey);
        const keyPrefix = rawKey.slice(0, 12);
        
        let updateData: any = {
            keyHash,
            keyPrefix,
        };

        if (immediate) {
            updateData.previousKeyHash = null;
            updateData.previousKeyPrefix = null;
            updateData.previousKeyExpiresAt = null;
        } else {
            updateData.previousKeyHash = currentKey.keyHash;
            updateData.previousKeyPrefix = currentKey.keyPrefix;
            updateData.previousKeyExpiresAt = new Date(Date.now() + gracePeriodHours * 60 * 60 * 1000);
        }

        const [result] = await db
            .update(apiKeys)
            .set(updateData)
            .where(eq(apiKeys.id, keyId))
            .returning();

        if (!result) return null;

        audit({
            action: AuditActions.API_KEY_CREATED,
            actor: "system",
            resource: "api_key",
            resourceId: keyId,
            result: "success",
            details: { rotated: true, immediate },
        });

        this.log.info({ keyId, immediate }, "API key rotated");

        return {
            key: rawKey,
            info: {
                id: result.id,
                organizationId: result.organizationId,
                userId: result.userId,
                name: result.name,
                role: result.role as Role,
                sessionIds: (result.sessionIds as string[]) ?? [],
                rateLimit: result.rateLimit ?? 100,
                active: result.active,
            }
        };
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

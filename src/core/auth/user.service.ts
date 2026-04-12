import { eq, and } from "drizzle-orm";
import { db } from "@infrastructure/database";
import { users, organizations, type User, type Organization } from "@infrastructure/database/schema";
import { logger } from "@infrastructure/logger";
import { type Role, type UserInfo } from "./auth.service";

export class UserService {
    private readonly log = logger.child({ component: "user-service" });

    /**
     * Create an organization
     */
    async createOrganization(name: string): Promise<Organization> {
        const id = crypto.randomUUID();
        const [result] = await db
            .insert(organizations)
            .values({ id, name })
            .returning();
            
        if (!result) {
            throw new Error("Failed to create organization");
        }

        this.log.info({ id, name }, "Organization created");
        return result;
    }

    /**
     * Get organization by ID
     */
    async getOrganization(id: string): Promise<Organization | null> {
        const [result] = await db
            .select()
            .from(organizations)
            .where(eq(organizations.id, id))
            .limit(1);
        return result || null;
    }

    /**
     * Create a new user
     */
    async createUser(
        organizationId: string,
        email: string,
        passwordPlain: string,
        name: string,
        role: Role = "viewer"
    ): Promise<UserInfo> {
        const id = crypto.randomUUID();
        const passwordHash = await Bun.password.hash(passwordPlain);

        const [result] = await db
            .insert(users)
            .values({
                id,
                organizationId,
                email,
                name,
                passwordHash,
                role,
            })
            .returning();

        if (!result) {
            throw new Error("Failed to create user");
        }

        this.log.info({ id, email, role, organizationId }, "User created");

        return {
            id: result.id,
            organizationId: result.organizationId,
            email: result.email,
            name: result.name,
            role: result.role as Role,
        };
    }

    /**
     * Authenticate and return user info
     */
    async verifyPassword(email: string, passwordPlain: string): Promise<UserInfo | null> {
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        if (!user) {
            return null;
        }

        const isMatch = await Bun.password.verify(passwordPlain, user.passwordHash);
        if (!isMatch) {
            return null;
        }

        return {
            id: user.id,
            organizationId: user.organizationId,
            email: user.email,
            name: user.name,
            role: user.role as Role,
        };
    }

    /**
     * Get user by ID
     */
    async getUserById(id: string): Promise<UserInfo | null> {
        const [result] = await db
            .select()
            .from(users)
            .where(eq(users.id, id))
            .limit(1);

        if (!result) return null;

        return {
            id: result.id,
            organizationId: result.organizationId,
            email: result.email,
            name: result.name,
            role: result.role as Role,
        };
    }

    /**
     * List all users in an organization
     */
    async listUsers(organizationId?: string): Promise<UserInfo[]> {
        let query = db.select().from(users);
        if (organizationId) {
            query = query.where(eq(users.organizationId, organizationId)) as any;
        }
        
        const results = await query;
        return results.map((r) => ({
            id: r.id,
            organizationId: r.organizationId,
            email: r.email,
            name: r.name,
            role: r.role as Role,
        }));
    }

    /**
     * Update user details
     */
    async updateUser(id: string, updates: { 
        name?: string; 
        role?: Role; 
        passwordPlain?: string 
    }): Promise<UserInfo | null> {
        const updateData: any = {};
        
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.role !== undefined) updateData.role = updates.role;
        if (updates.passwordPlain !== undefined) {
            updateData.passwordHash = await Bun.password.hash(updates.passwordPlain);
        }

        // If no updates
        if (Object.keys(updateData).length === 0) {
            return this.getUserById(id);
        }

        updateData.updatedAt = new Date();

        const [result] = await db
            .update(users)
            .set(updateData)
            .where(eq(users.id, id))
            .returning();

        if (!result) return null;

        return {
            id: result.id,
            organizationId: result.organizationId,
            email: result.email,
            name: result.name,
            role: result.role as Role,
        };
    }

    /**
     * Delete a user
     */
    async deleteUser(id: string): Promise<boolean> {
        const [result] = await db
            .delete(users)
            .where(eq(users.id, id))
            .returning({ id: users.id });
            
        if (result) {
            this.log.info({ id }, "User deleted");
            return true;
        }
        return false;
    }
}

export const userService = new UserService();

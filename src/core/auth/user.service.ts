import { eq, and, count } from "drizzle-orm";
import { db } from "@infrastructure/database";
import { users, organizations, organizationMembers, type User, type Organization, type OrganizationMember } from "@infrastructure/database/schema";
import { logger } from "@infrastructure/logger";
import { type Role, type UserInfo } from "./auth.service";

export class UserService {
    private readonly log = logger.child({ component: "user-service" });

    /**
     * Get total user count to determine if system is pristine
     */
    async getUserCount(): Promise<number> {
        const result = await db.select({ value: count() }).from(users);
        return result[0]?.value ?? 0;
    }

    /**
     * Create an organization
     */
    async createOrganization(name: string, ownerUserId?: string): Promise<Organization> {
        const id = crypto.randomUUID();
        const [result] = await db
            .insert(organizations)
            .values({ id, name })
            .returning();
            
        if (!result) {
            throw new Error("Failed to create organization");
        }

        if (ownerUserId) {
            await this.assignUserToOrganization(ownerUserId, result.id, "owner");
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
     * Assign user to organization with a role
     */
    async assignUserToOrganization(userId: string, organizationId: string, role: Role = "viewer"): Promise<OrganizationMember> {
        const id = crypto.randomUUID();
        const [result] = await db
            .insert(organizationMembers)
            .values({ id, userId, organizationId, role })
            .onConflictDoUpdate({
                target: [organizationMembers.organizationId, organizationMembers.userId],
                set: { role, updatedAt: new Date() }
            })
        if (!result) {
            throw new Error("Failed to assign user to organization");
        }
            
        return result;
    }
    
    /**
     * Get user's roles across all their organizations
     */
    async getUserOrganizationRoles(userId: string): Promise<Array<{ organizationId: string, role: Role }>> {
        const results = await db
            .select({ organizationId: organizationMembers.organizationId, role: organizationMembers.role })
            .from(organizationMembers)
            .where(eq(organizationMembers.userId, userId));
            
        return results.map(r => ({ organizationId: r.organizationId, role: r.role as Role }));
    }

    /**
     * Create a new user autonomously (No team bound)
     */
    async createUser(
        email: string,
        passwordPlain: string,
        name: string,
        globalRole: "owner" | "standard" = "standard"
    ): Promise<UserInfo> {
        const id = crypto.randomUUID();
        const passwordHash = await Bun.password.hash(passwordPlain);

        const [result] = await db
            .insert(users)
            .values({
                id,
                email,
                name,
                passwordHash,
                globalRole,
            })
            .returning();

        if (!result) {
            throw new Error("Failed to create user");
        }

        this.log.info({ id, email, globalRole }, "User created");

        return {
            id: result.id,
            email: result.email,
            name: result.name,
            globalRole: result.globalRole,
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
            email: user.email,
            name: user.name,
            globalRole: user.globalRole,
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
            email: result.email,
            name: result.name,
            globalRole: result.globalRole,
        };
    }

    /**
     * List all users, optionally filtered by an organization
     */
    async listUsers(organizationId?: string): Promise<UserInfo[]> {
        let query;

        if (organizationId) {
            // Join with organization_members to get users in team
            query = db.select({
                id: users.id,
                email: users.email,
                name: users.name,
                globalRole: users.globalRole
            })
            .from(users)
            .innerJoin(organizationMembers, eq(users.id, organizationMembers.userId))
            .where(eq(organizationMembers.organizationId, organizationId));
        } else {
            query = db.select({
                id: users.id,
                email: users.email,
                name: users.name,
                globalRole: users.globalRole
            }).from(users);
        }
        
        const results = await query;
        return results.map((r) => ({
            id: r.id,
            email: r.email,
            name: r.name,
            globalRole: r.globalRole,
        }));
    }

    /**
     * Update user details
     */
    async updateUser(id: string, updates: { 
        name?: string; 
        globalRole?: "owner" | "standard"; 
        passwordPlain?: string 
    }): Promise<UserInfo | null> {
        const updateData: any = {};
        
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.globalRole !== undefined) updateData.globalRole = updates.globalRole;
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
            email: result.email,
            name: result.name,
            globalRole: result.globalRole,
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

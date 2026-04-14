import type { WASocket, GroupMetadata, GroupParticipant } from "@whiskeysockets/baileys";
import { eventBus } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";
import { audit, AuditActions } from "@infrastructure/logger/audit-logger";
import { Errors } from "@infrastructure/errors";

// Rate limiting for group operations
const groupCreateRateLimiter = new Map<string, { count: number; resetAt: number }>();
const GROUP_CREATE_LIMIT = 5; // Max 5 groups per hour
const GROUP_CREATE_WINDOW = 60 * 60 * 1000; // 1 hour

// Batch operation limits
const MAX_PARTICIPANTS_PER_BATCH = 5;


export interface CreateGroupOptions {
    subject: string;
    participants: string[];
    profilePicture?: Buffer;
}

export interface GroupInfo {
    id: string;
    subject: string;
    subjectOwner?: string;
    subjectTime?: number;
    desc?: string;
    descOwner?: string;
    size?: number;
    creation?: number;
    owner?: string;
    participants: GroupParticipant[];
    announce?: boolean;
    restrict?: boolean;
}

export interface BatchOperationResult {
    success: string[];
    failed: Array<{ jid: string; error: string }>;
    totalBatches: number;
}

export class GroupService {
    private readonly log = logger.child({ component: "group-service" });

    constructor(
        private readonly getSocket: () => WASocket | null,
        private readonly sessionId: string
    ) { }

    /**
     * Ensure socket is connected, throw AppError if not
     */
    private requireSocket(): WASocket {
        const socket = this.getSocket();
        if (!socket) {
            throw Errors.notConnected(this.sessionId);
        }
        return socket;
    }

    /**
     * Check rate limit for group creation
     */
    private checkCreateRateLimit(): void {
        const now = Date.now();
        let entry = groupCreateRateLimiter.get(this.sessionId);

        if (!entry || entry.resetAt < now) {
            entry = { count: 0, resetAt: now + GROUP_CREATE_WINDOW };
            groupCreateRateLimiter.set(this.sessionId, entry);
        }

        entry.count++;

        if (entry.count > GROUP_CREATE_LIMIT) {
            throw Errors.rateLimitExceeded();
        }
    }

    /**
     * Create a new group (rate-limited)
     */
    async create(options: CreateGroupOptions): Promise<GroupMetadata> {
        const socket = this.requireSocket();
        this.checkCreateRateLimit();

        const group = await socket.groupCreate(options.subject, options.participants);

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: group.id,
            metadata: group,
            action: "create",
        });

        audit({
            action: AuditActions.GROUP_CREATED,
            actor: this.sessionId,
            resource: "group",
            resourceId: group.id,
            result: "success",
            details: { subject: options.subject, participantCount: options.participants.length },
        });

        this.log.info({ groupId: group.id, subject: options.subject }, "Group created");
        return group;
    }

    /**
     * Get group metadata
     */
    async getMetadata(groupJid: string): Promise<GroupMetadata> {
        const socket = this.requireSocket();
        return socket.groupMetadata(groupJid);
    }

    /**
     * Update group subject (name)
     */
    async updateSubject(groupJid: string, subject: string): Promise<void> {
        const socket = this.requireSocket();

        await socket.groupUpdateSubject(groupJid, subject);

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "update",
        });

        audit({
            action: AuditActions.GROUP_SUBJECT_UPDATED,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupJid,
            result: "success",
            details: { subject },
        });

        this.log.info({ groupJid, subject }, "Group subject updated");
    }

    /**
     * Update group description
     */
    async updateDescription(groupJid: string, description: string): Promise<void> {
        const socket = this.requireSocket();

        await socket.groupUpdateDescription(groupJid, description);

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "update",
        });

        audit({
            action: AuditActions.GROUP_DESCRIPTION_UPDATED,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupJid,
            result: "success",
        });

        this.log.info({ groupJid }, "Group description updated");
    }

    /**
     * Add participants to group
     */
    async addParticipants(groupJid: string, participants: string[]): Promise<void> {
        const socket = this.requireSocket();

        await socket.groupParticipantsUpdate(groupJid, participants, "add");

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "participant_add",
            participants,
        });

        audit({
            action: AuditActions.GROUP_PARTICIPANT_ADDED,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupJid,
            result: "success",
            details: { participants, count: participants.length },
        });

        this.log.info({ groupJid, count: participants.length }, "Participants added");
    }

    /**
     * Remove participants from group
     */
    async removeParticipants(groupJid: string, participants: string[]): Promise<void> {
        const socket = this.requireSocket();

        await socket.groupParticipantsUpdate(groupJid, participants, "remove");

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "participant_remove",
            participants,
        });

        audit({
            action: AuditActions.GROUP_PARTICIPANT_REMOVED,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupJid,
            result: "success",
            details: { participants, count: participants.length },
        });

        this.log.info({ groupJid, count: participants.length }, "Participants removed");
    }

    /**
     * Promote participants to admin
     */
    async promoteToAdmin(groupJid: string, participants: string[]): Promise<void> {
        const socket = this.requireSocket();

        await socket.groupParticipantsUpdate(groupJid, participants, "promote");

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "promote",
            participants,
        });

        audit({
            action: AuditActions.GROUP_PARTICIPANT_PROMOTED,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupJid,
            result: "success",
            details: { participants, count: participants.length },
        });

        this.log.info({ groupJid, count: participants.length }, "Participants promoted to admin");
    }

    /**
     * Demote admins to regular participant
     */
    async demoteFromAdmin(groupJid: string, participants: string[]): Promise<void> {
        const socket = this.requireSocket();

        await socket.groupParticipantsUpdate(groupJid, participants, "demote");

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "demote",
            participants,
        });

        audit({
            action: AuditActions.GROUP_PARTICIPANT_DEMOTED,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupJid,
            result: "success",
            details: { participants, count: participants.length },
        });

        this.log.info({ groupJid, count: participants.length }, "Admins demoted");
    }

    /**
     * Leave a group
     */
    async leave(groupJid: string): Promise<void> {
        const socket = this.requireSocket();

        await socket.groupLeave(groupJid);

        audit({
            action: AuditActions.GROUP_LEFT,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupJid,
            result: "success",
        });

        this.log.info({ groupJid }, "Left group");
    }

    /**
     * Get group invite code
     */
    async getInviteCode(groupJid: string): Promise<string | undefined> {
        const socket = this.requireSocket();
        return socket.groupInviteCode(groupJid);
    }

    /**
     * Revoke group invite code
     */
    async revokeInviteCode(groupJid: string): Promise<string | undefined> {
        const socket = this.requireSocket();

        const newCode = await socket.groupRevokeInvite(groupJid);

        audit({
            action: AuditActions.GROUP_INVITE_REVOKED,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupJid,
            result: "success",
        });

        return newCode;
    }

    /**
     * Join group via invite code
     */
    async join(inviteCode: string): Promise<string | undefined> {
        const socket = this.requireSocket();

        const groupId = await socket.groupAcceptInvite(inviteCode);

        audit({
            action: AuditActions.GROUP_JOINED,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupId,
            result: "success",
        });

        this.log.info({ groupId }, "Joined group via invite");
        return groupId;
    }

    /**
     * Update group settings
     */
    async updateSetting(
        groupJid: string,
        setting: "announcement" | "not_announcement" | "locked" | "unlocked"
    ): Promise<void> {
        const socket = this.requireSocket();

        await socket.groupSettingUpdate(groupJid, setting);

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "update",
        });

        audit({
            action: AuditActions.GROUP_SETTING_UPDATED,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupJid,
            result: "success",
            details: { setting },
        });

        this.log.info({ groupJid, setting }, "Group setting updated");
    }

    // ─── Batch Operations ────────────────────────────────────────────

    /**
     * Add participants in batches to avoid WhatsApp rate limits.
     * Splits large lists into chunks of MAX_PARTICIPANTS_PER_BATCH,
     * processes each sequentially with a delay between batches.
     */
    async batchAddParticipants(
        groupJid: string,
        participants: string[],
        options: { delayMs?: number } = {}
    ): Promise<BatchOperationResult> {
        const socket = this.requireSocket();
        const { delayMs = 2000 } = options;

        const batches = this.chunk(participants, MAX_PARTICIPANTS_PER_BATCH);
        const result: BatchOperationResult = { success: [], failed: [], totalBatches: batches.length };

        this.log.info(
            { groupJid, totalParticipants: participants.length, batches: batches.length },
            "Starting batch add"
        );

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i]!;
            try {
                await socket.groupParticipantsUpdate(groupJid, batch, "add");
                result.success.push(...batch);

                this.log.debug(
                    { groupJid, batch: i + 1, count: batch.length },
                    "Batch add succeeded"
                );
            } catch (error: any) {
                for (const jid of batch) {
                    result.failed.push({ jid, error: error.message ?? "Unknown error" });
                }

                this.log.warn(
                    { groupJid, batch: i + 1, error: error.message },
                    "Batch add failed"
                );
            }

            // Delay between batches (skip after last)
            if (i < batches.length - 1) {
                await this.delay(delayMs);
            }
        }

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "participant_add",
            participants: result.success,
        });

        audit({
            action: AuditActions.GROUP_BATCH_ADD,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupJid,
            result: result.failed.length === 0 ? "success" : "failure",
            details: {
                total: participants.length,
                succeeded: result.success.length,
                failed: result.failed.length,
                batches: batches.length,
            },
        });

        this.log.info(
            { groupJid, succeeded: result.success.length, failed: result.failed.length },
            "Batch add completed"
        );

        return result;
    }

    /**
     * Remove participants in batches to avoid WhatsApp rate limits.
     */
    async batchRemoveParticipants(
        groupJid: string,
        participants: string[],
        options: { delayMs?: number } = {}
    ): Promise<BatchOperationResult> {
        const socket = this.requireSocket();
        const { delayMs = 2000 } = options;

        const batches = this.chunk(participants, MAX_PARTICIPANTS_PER_BATCH);
        const result: BatchOperationResult = { success: [], failed: [], totalBatches: batches.length };

        this.log.info(
            { groupJid, totalParticipants: participants.length, batches: batches.length },
            "Starting batch remove"
        );

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i]!;
            try {
                await socket.groupParticipantsUpdate(groupJid, batch, "remove");
                result.success.push(...batch);

                this.log.debug(
                    { groupJid, batch: i + 1, count: batch.length },
                    "Batch remove succeeded"
                );
            } catch (error: any) {
                for (const jid of batch) {
                    result.failed.push({ jid, error: error.message ?? "Unknown error" });
                }

                this.log.warn(
                    { groupJid, batch: i + 1, error: error.message },
                    "Batch remove failed"
                );
            }

            if (i < batches.length - 1) {
                await this.delay(delayMs);
            }
        }

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "participant_remove",
            participants: result.success,
        });

        audit({
            action: AuditActions.GROUP_BATCH_REMOVE,
            actor: this.sessionId,
            resource: "group",
            resourceId: groupJid,
            result: result.failed.length === 0 ? "success" : "failure",
            details: {
                total: participants.length,
                succeeded: result.success.length,
                failed: result.failed.length,
                batches: batches.length,
            },
        });

        this.log.info(
            { groupJid, succeeded: result.success.length, failed: result.failed.length },
            "Batch remove completed"
        );

        return result;
    }

    // ─── Private Helpers ─────────────────────────────────────────────

    /**
     * Split array into chunks of given size
     */
    private chunk<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Delay helper
     */
    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

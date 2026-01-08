import type { WASocket, GroupMetadata, GroupParticipant } from "@whiskeysockets/baileys";
import { eventBus } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";

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

export class GroupService {
    private readonly log = logger.child({ component: "group-service" });

    constructor(
        private readonly getSocket: () => WASocket | null,
        private readonly sessionId: string
    ) { }

    /**
     * Create a new group
     */
    async create(options: CreateGroupOptions): Promise<GroupMetadata> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        const group = await socket.groupCreate(options.subject, options.participants);

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: group.id,
            metadata: group,
            action: "create",
        });

        this.log.info({ groupId: group.id, subject: options.subject }, "Group created");
        return group;
    }

    /**
     * Get group metadata
     */
    async getMetadata(groupJid: string): Promise<GroupMetadata> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        const metadata = await socket.groupMetadata(groupJid);
        return metadata;
    }

    /**
     * Update group subject (name)
     */
    async updateSubject(groupJid: string, subject: string): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.groupUpdateSubject(groupJid, subject);

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "update",
        });

        this.log.info({ groupJid, subject }, "Group subject updated");
    }

    /**
     * Update group description
     */
    async updateDescription(groupJid: string, description: string): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.groupUpdateDescription(groupJid, description);

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "update",
        });

        this.log.info({ groupJid }, "Group description updated");
    }

    /**
     * Add participants to group
     */
    async addParticipants(groupJid: string, participants: string[]): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.groupParticipantsUpdate(groupJid, participants, "add");

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "participant_add",
            participants,
        });

        this.log.info({ groupJid, count: participants.length }, "Participants added");
    }

    /**
     * Remove participants from group
     */
    async removeParticipants(groupJid: string, participants: string[]): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.groupParticipantsUpdate(groupJid, participants, "remove");

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "participant_remove",
            participants,
        });

        this.log.info({ groupJid, count: participants.length }, "Participants removed");
    }

    /**
     * Promote participants to admin
     */
    async promoteToAdmin(groupJid: string, participants: string[]): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.groupParticipantsUpdate(groupJid, participants, "promote");

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "promote",
            participants,
        });

        this.log.info({ groupJid, count: participants.length }, "Participants promoted to admin");
    }

    /**
     * Demote admins to regular participant
     */
    async demoteFromAdmin(groupJid: string, participants: string[]): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.groupParticipantsUpdate(groupJid, participants, "demote");

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "demote",
            participants,
        });

        this.log.info({ groupJid, count: participants.length }, "Admins demoted");
    }

    /**
     * Leave a group
     */
    async leave(groupJid: string): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.groupLeave(groupJid);
        this.log.info({ groupJid }, "Left group");
    }

    /**
     * Get group invite code
     */
    async getInviteCode(groupJid: string): Promise<string | undefined> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        const code = await socket.groupInviteCode(groupJid);
        return code;
    }

    /**
     * Revoke group invite code
     */
    async revokeInviteCode(groupJid: string): Promise<string | undefined> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        const newCode = await socket.groupRevokeInvite(groupJid);
        return newCode;
    }

    /**
     * Join group via invite code
     */
    async join(inviteCode: string): Promise<string | undefined> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        const groupId = await socket.groupAcceptInvite(inviteCode);
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
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.groupSettingUpdate(groupJid, setting);

        eventBus.emit("group.updated", {
            sessionId: this.sessionId,
            groupId: groupJid,
            action: "update",
        });

        this.log.info({ groupJid, setting }, "Group setting updated");
    }
}

import type { WASocket, Contact } from "@whiskeysockets/baileys";
import { eventBus } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";

export interface ContactProfile {
    jid: string;
    name?: string;
    notify?: string;
    verifiedName?: string;
    imgUrl?: string;
    status?: string;
}

export class ContactService {
    private readonly log = logger.child({ component: "contact-service" });

    constructor(
        private readonly getSocket: () => WASocket | null,
        private readonly sessionId: string
    ) { }

    /**
     * Get all contacts
     */
    async getContacts(): Promise<Contact[]> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        // Baileys stores contacts in memory after connection
        const store = (socket as any).store;
        if (store?.contacts) {
            return Object.values(store.contacts);
        }

        return [];
    }

    /**
     * Get contact profile by JID
     */
    async getProfile(jid: string): Promise<ContactProfile> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        const [statusResult, profilePic] = await Promise.allSettled([
            socket.fetchStatus(jid),
            socket.profilePictureUrl(jid, "image"),
        ]);

        let statusText: string | undefined;
        if (statusResult.status === "fulfilled" && statusResult.value) {
            const statusValue = statusResult.value as any;
            statusText = Array.isArray(statusValue) ? statusValue[0]?.status : statusValue.status;
        }

        return {
            jid,
            status: statusText,
            imgUrl: profilePic.status === "fulfilled" ? profilePic.value : undefined,
        };
    }

    /**
     * Check if a number is on WhatsApp
     */
    async isOnWhatsApp(phoneNumber: string): Promise<{ exists: boolean; jid?: string }> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        const results = await socket.onWhatsApp(phoneNumber);
        const result = results?.[0];

        if (result) {
            return { exists: Boolean(result.exists), jid: result.jid };
        }

        return { exists: false };
    }

    /**
     * Block a contact
     */
    async block(jid: string): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.updateBlockStatus(jid, "block");
        this.log.info({ jid }, "Contact blocked");
    }

    /**
     * Unblock a contact
     */
    async unblock(jid: string): Promise<void> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        await socket.updateBlockStatus(jid, "unblock");
        this.log.info({ jid }, "Contact unblocked");
    }

    /**
     * Get business profile (for business accounts)
     */
    async getBusinessProfile(jid: string): Promise<any> {
        const socket = this.getSocket();
        if (!socket) {
            throw new Error("Socket not connected");
        }

        try {
            const profile = await socket.getBusinessProfile(jid);
            return profile;
        } catch {
            return null;
        }
    }
}

import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    type WASocket,
    type ConnectionState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { usePostgresAuthState } from "@core/auth/postgres-auth-state";
import { MessagingService } from "@core/messaging";
import { ContactService } from "@core/contact";
import { GroupService } from "@core/group";
import { PresenceService } from "@core/presence";
import { eventBus } from "@infrastructure/events";
import { logger } from "@infrastructure/logger";
import type { Logger } from "pino";

export interface BaileysServiceOptions {
    sessionId: string;
    printQRInTerminal?: boolean;
}

export class BaileysService {
    private socket: WASocket | null = null;
    private readonly sessionId: string;
    private readonly log: Logger;
    private saveCreds: (() => Promise<void>) | null = null;
    private isConnecting = false;

    // Services
    private _messagingService: MessagingService | null = null;
    private _contactService: ContactService | null = null;
    private _groupService: GroupService | null = null;
    private _presenceService: PresenceService | null = null;

    constructor(options: BaileysServiceOptions) {
        this.sessionId = options.sessionId;
        this.log = logger.child({ sessionId: options.sessionId, component: "baileys" });
    }

    async connect(): Promise<void> {
        if (this.isConnecting) {
            this.log.warn("Connection already in progress");
            return;
        }

        this.isConnecting = true;
        this.log.info("Starting WhatsApp connection");

        try {
            const { state, saveCreds } = await usePostgresAuthState(this.sessionId);
            this.saveCreds = saveCreds;

            const { version } = await fetchLatestBaileysVersion();
            this.log.info({ version }, "Using Baileys version");

            this.socket = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, this.log),
                },
                logger: this.log,
                printQRInTerminal: true,
                generateHighQualityLinkPreview: true,
            });

            // Initialize all services
            const getSocket = () => this.socket;
            this._messagingService = new MessagingService(getSocket, this.sessionId);
            this._contactService = new ContactService(getSocket, this.sessionId);
            this._groupService = new GroupService(getSocket, this.sessionId);
            this._presenceService = new PresenceService(getSocket, this.sessionId);

            this.registerEventHandlers();
        } catch (error) {
            this.isConnecting = false;
            this.log.error({ error }, "Failed to initialize connection");
            throw error;
        }
    }

    private registerEventHandlers(): void {
        if (!this.socket) return;

        this.socket.ev.on("creds.update", async () => {
            if (this.saveCreds) {
                await this.saveCreds();
            }
        });

        this.socket.ev.on("connection.update", (update) => {
            this.handleConnectionUpdate(update);
        });

        // Handle incoming messages
        this.socket.ev.on("messages.upsert", ({ messages, type }) => {
            for (const message of messages) {
                if (type === "notify") {
                    const msgType = MessagingService.getMessageType(message);

                    eventBus.emit("message.received", {
                        sessionId: this.sessionId,
                        message,
                        type: msgType,
                    });

                    this.log.info(
                        {
                            from: message.key.remoteJid,
                            type: msgType,
                            messageId: message.key.id
                        },
                        "Message received"
                    );
                }
            }
        });

        // Handle message status updates (receipts)
        this.socket.ev.on("message-receipt.update", (updates) => {
            for (const update of updates) {
                const status = this.mapReceiptToStatus(update.receipt.receiptTimestamp);

                eventBus.emit("message.status", {
                    sessionId: this.sessionId,
                    messageId: update.key.id || "",
                    status,
                    participant: update.receipt.userJid,
                    timestamp: Number(update.receipt.receiptTimestamp) * 1000,
                });
            }
        });

        // Handle contact updates
        this.socket.ev.on("contacts.update", (contacts) => {
            eventBus.emit("contact.updated", {
                sessionId: this.sessionId,
                contacts,
            });
            this.log.debug({ count: contacts.length }, "Contacts updated");
        });

        // Handle group updates
        this.socket.ev.on("groups.update", (updates) => {
            for (const update of updates) {
                eventBus.emit("group.updated", {
                    sessionId: this.sessionId,
                    groupId: update.id!,
                    action: "update",
                });
            }
            this.log.debug({ count: updates.length }, "Groups updated");
        });

        // Handle group participant updates
        this.socket.ev.on("group-participants.update", ({ id, participants, action }) => {
            const actionMap: Record<string, "participant_add" | "participant_remove" | "promote" | "demote"> = {
                add: "participant_add",
                remove: "participant_remove",
                promote: "promote",
                demote: "demote",
            };

            eventBus.emit("group.updated", {
                sessionId: this.sessionId,
                groupId: id,
                action: actionMap[action] || "update",
                participants,
            });

            this.log.debug({ groupId: id, action, count: participants.length }, "Group participants updated");
        });

        // Handle presence updates
        this.socket.ev.on("presence.update", ({ id, presences }) => {
            for (const [jid, presence] of Object.entries(presences)) {
                eventBus.emit("presence.updated", {
                    sessionId: this.sessionId,
                    jid,
                    presence: presence.lastKnownPresence as any,
                    lastSeen: presence.lastSeen,
                });
            }
        });
    }

    private mapReceiptToStatus(timestamp: number | Long | null | undefined): "sent" | "delivered" | "read" | "played" {
        return "delivered";
    }

    private handleConnectionUpdate(update: Partial<ConnectionState>): void {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            eventBus.emit("qr.update", { sessionId: this.sessionId, qr });
        }

        eventBus.emit("connection.update", {
            sessionId: this.sessionId,
            state: update,
        });

        if (connection === "close") {
            const boom = lastDisconnect?.error as Boom | undefined;
            const statusCode = boom?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            this.log.warn(
                { statusCode, shouldReconnect, reason: boom?.message },
                "Connection closed"
            );

            eventBus.emit("connection.close", {
                sessionId: this.sessionId,
                reason: boom?.message,
            });

            this.isConnecting = false;

            if (shouldReconnect) {
                this.log.info("Attempting reconnection...");
                setTimeout(() => this.connect(), 3000);
            }
        } else if (connection === "open") {
            this.log.info("Connection opened successfully");
            this.isConnecting = false;
            eventBus.emit("connection.open", { sessionId: this.sessionId });
        }
    }

    async disconnect(): Promise<void> {
        if (this.socket) {
            this.log.info("Disconnecting...");
            await this.socket.logout();
            this.socket = null;
            this._messagingService = null;
            this._contactService = null;
            this._groupService = null;
            this._presenceService = null;
        }
    }

    getSocket(): WASocket | null {
        return this.socket;
    }

    isConnected(): boolean {
        return this.socket?.user !== undefined;
    }

    getSessionId(): string {
        return this.sessionId;
    }

    // Service getters
    get messaging(): MessagingService {
        if (!this._messagingService) {
            throw new Error("Messaging service not initialized. Call connect() first.");
        }
        return this._messagingService;
    }

    get contacts(): ContactService {
        if (!this._contactService) {
            throw new Error("Contact service not initialized. Call connect() first.");
        }
        return this._contactService;
    }

    get groups(): GroupService {
        if (!this._groupService) {
            throw new Error("Group service not initialized. Call connect() first.");
        }
        return this._groupService;
    }

    get presence(): PresenceService {
        if (!this._presenceService) {
            throw new Error("Presence service not initialized. Call connect() first.");
        }
        return this._presenceService;
    }
}

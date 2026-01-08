import type {
    AuthenticationCreds,
    AuthenticationState,
    SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { proto } from "@whiskeysockets/baileys";
import { initAuthCreds } from "@whiskeysockets/baileys";
import { db } from "@infrastructure/database";
import { authStates, authKeys } from "@infrastructure/database/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@infrastructure/logger";

const KEY_MAP: Record<keyof SignalDataTypeMap, string> = {
    "pre-key": "pre-key",
    session: "session",
    "sender-key": "sender-key",
    "app-state-sync-key": "app-state-sync-key",
    "app-state-sync-version": "app-state-sync-version",
    "sender-key-memory": "sender-key-memory",
};

export async function usePostgresAuthState(
    sessionId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
    const log = logger.child({ sessionId, component: "auth-state" });

    // Load or initialize credentials
    let creds: AuthenticationCreds;
    const existingState = await db.query.authStates.findFirst({
        where: eq(authStates.sessionId, sessionId),
    });

    if (existingState?.creds) {
        creds = existingState.creds as AuthenticationCreds;
        log.info("Loaded existing credentials");
    } else {
        creds = initAuthCreds();
        log.info("Initialized new credentials");
    }

    const saveCreds = async () => {
        await db
            .insert(authStates)
            .values({
                sessionId,
                creds: creds as unknown as Record<string, unknown>,
                syncedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: authStates.sessionId,
                set: {
                    creds: creds as unknown as Record<string, unknown>,
                    syncedAt: new Date(),
                },
            });
        log.debug("Saved credentials");
    };

    const state: AuthenticationState = {
        creds,
        keys: {
            get: async <T extends keyof SignalDataTypeMap>(
                type: T,
                ids: string[]
            ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
                const result: { [id: string]: SignalDataTypeMap[T] } = {};

                for (const id of ids) {
                    const key = await db.query.authKeys.findFirst({
                        where: and(
                            eq(authKeys.sessionId, sessionId),
                            eq(authKeys.type, KEY_MAP[type]),
                            eq(authKeys.keyId, id)
                        ),
                    });

                    if (key?.keyData) {
                        let value = key.keyData;

                        // Handle BufferJSON deserialization
                        if (type === "app-state-sync-key" && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
                        }

                        result[id] = value as SignalDataTypeMap[T];
                    }
                }

                return result;
            },

            set: async (data: Record<string, Record<string, unknown>>) => {
                for (const [type, entries] of Object.entries(data)) {
                    for (const [id, value] of Object.entries(entries || {})) {
                        const keyId = `${sessionId}:${type}:${id}`;

                        if (value) {
                            await db
                                .insert(authKeys)
                                .values({
                                    id: keyId,
                                    sessionId,
                                    type: type,
                                    keyId: id,
                                    keyData: value as Record<string, unknown>,
                                })
                                .onConflictDoUpdate({
                                    target: authKeys.id,
                                    set: { keyData: value as Record<string, unknown> },
                                });
                        } else {
                            await db.delete(authKeys).where(eq(authKeys.id, keyId));
                        }
                    }
                }
            },
        },
    };

    return { state, saveCreds };
}

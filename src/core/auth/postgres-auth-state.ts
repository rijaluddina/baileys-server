import type {
    AuthenticationCreds,
    AuthenticationState,
    SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { proto, initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
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

/**
 * Serialize data for storage (convert Buffers to base64)
 */
function serialize(data: unknown): unknown {
    return JSON.parse(JSON.stringify(data, BufferJSON.replacer));
}

/**
 * Deserialize data from storage (convert base64 back to Buffers)
 */
function deserialize<T>(data: unknown): T {
    return JSON.parse(JSON.stringify(data), BufferJSON.reviver) as T;
}

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
        // Deserialize to restore Buffers
        creds = deserialize<AuthenticationCreds>(existingState.creds);
        log.info("Loaded existing credentials");
    } else {
        creds = initAuthCreds();
        log.info("Initialized new credentials");
    }

    const saveCreds = async () => {
        // Serialize to convert Buffers to base64
        const serializedCreds = serialize(creds);

        await db
            .insert(authStates)
            .values({
                sessionId,
                creds: serializedCreds as Record<string, unknown>,
                syncedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: authStates.sessionId,
                set: {
                    creds: serializedCreds as Record<string, unknown>,
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
                        // Deserialize to restore Buffers
                        const deserialized = deserialize<SignalDataTypeMap[T]>(key.keyData);

                        // Handle AppStateSyncKeyData specially
                        if (type === "app-state-sync-key" && deserialized) {
                            result[id] = proto.Message.AppStateSyncKeyData.fromObject(
                                deserialized as object
                            ) as unknown as SignalDataTypeMap[T];
                        } else {
                            result[id] = deserialized;
                        }
                    }
                }

                return result;
            },

            set: async (data: Record<string, Record<string, unknown>>) => {
                for (const [type, entries] of Object.entries(data)) {
                    for (const [id, value] of Object.entries(entries || {})) {
                        const keyId = `${sessionId}:${type}:${id}`;

                        if (value) {
                            // Serialize to convert Buffers to base64
                            const serializedValue = serialize(value);

                            await db
                                .insert(authKeys)
                                .values({
                                    id: keyId,
                                    sessionId,
                                    type: type,
                                    keyId: id,
                                    keyData: serializedValue as Record<string, unknown>,
                                })
                                .onConflictDoUpdate({
                                    target: authKeys.id,
                                    set: { keyData: serializedValue as Record<string, unknown> },
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


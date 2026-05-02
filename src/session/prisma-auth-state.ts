import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataSet,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { proto } from '@whiskeysockets/baileys';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import type { PrismaService } from '../prisma/prisma.service.js';

function buildKey(type: string, id: string): string {
  return `${type}-${id}`;
}

/**
 * Custom Prisma-backed auth state for Baileys.
 * Replaces `useMultiFileAuthState` with PostgreSQL storage via Prisma.
 */
export async function usePrismaAuthState(
  sessionId: string,
  prisma: PrismaService,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  // Load or initialize credentials
  const credsRow = await prisma.authCredential.findUnique({
    where: { sessionId_key: { sessionId, key: 'creds' } },
  });

  let creds: AuthenticationCreds;
  if (credsRow) {
    creds = JSON.parse(credsRow.value, BufferJSON.reviver);
  } else {
    creds = initAuthCreds();
  }

  const saveCreds = async () => {
    const value = JSON.stringify(creds, BufferJSON.replacer);
    await prisma.authCredential.upsert({
      where: { sessionId_key: { sessionId, key: 'creds' } },
      create: { sessionId, key: 'creds', value },
      update: { value },
    });
  };

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[],
      ): Promise<Record<string, SignalDataTypeMap[T]>> => {
        const result: Record<string, SignalDataTypeMap[T]> = {};

        if (ids.length === 0) return result;

        const keys = ids.map((id) => buildKey(type, id));
        const rows = await prisma.authCredential.findMany({
          where: {
            sessionId,
            key: { in: keys },
          },
        });

        for (const row of rows) {
          // Extract the id part from the key
          const prefix = `${type}-`;
          const id = row.key.slice(prefix.length);

          let parsed = JSON.parse(row.value, BufferJSON.reviver);

          if (type === 'app-state-sync-key') {
            parsed = proto.Message.AppStateSyncKeyData.fromObject(parsed);
          }

          result[id] = parsed;
        }

        return result;
      },

      set: async (data: SignalDataSet): Promise<void> => {
        const operations: unknown[] = [];

        for (const _type in data) {
          const type = _type as keyof SignalDataTypeMap;
          const entries = data[type];
          if (!entries) continue;

          for (const id in entries) {
            const value = entries[id];
            const key = buildKey(type, id);

            if (value) {
              const serialized = JSON.stringify(value, BufferJSON.replacer);
              operations.push(
                prisma.authCredential.upsert({
                  where: { sessionId_key: { sessionId, key } },
                  create: { sessionId, key, value: serialized },
                  update: { value: serialized },
                }),
              );
            } else {
              // Delete the key
              operations.push(
                prisma.authCredential.deleteMany({
                  where: { sessionId, key },
                }),
              );
            }
          }
        }

        if (operations.length > 0) {
          await prisma.$transaction(operations as any);
        }
      },
    },
  };

  return { state, saveCreds };
}

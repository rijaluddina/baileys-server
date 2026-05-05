import type { Logger } from '@nestjs/common';
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataSet,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { proto } from '@whiskeysockets/baileys';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { Cache } from 'cache-manager';

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
  cache: Cache,
  logger?: Logger,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const credsCacheKey = `auth:${sessionId}:creds`;

  // Load or initialize credentials
  let creds: AuthenticationCreds | null = null;

  try {
    const cached = await cache.get<string>(credsCacheKey);
    if (cached) {
      creds = JSON.parse(cached, BufferJSON.reviver) as AuthenticationCreds;
    }
  } catch (err) {
    logger?.error(`Cache read error (creds): ${err}`);
  }

  if (!creds) {
    const credsRow = await prisma.authCredential.findUnique({
      where: { sessionId_key: { sessionId, key: 'creds' } },
    });

    if (credsRow) {
      creds = JSON.parse(
        credsRow.value,
        BufferJSON.reviver,
      ) as AuthenticationCreds;

      // Update cache
      void cache
        .set(credsCacheKey, credsRow.value)
        .catch((e) => logger?.error(`Cache write error (creds): ${e}`));
    } else {
      creds = initAuthCreds();
    }
  }

  const saveCreds = async () => {
    try {
      const value = JSON.stringify(creds, BufferJSON.replacer);
      await prisma.authCredential.upsert({
        where: { sessionId_key: { sessionId, key: 'creds' } },
        create: { sessionId, key: 'creds', value },
        update: { value },
      });

      // Update cache
      await cache.set(credsCacheKey, value);
    } catch (err) {
      logger?.error(
        `Failed to save credentials for session "${sessionId}": ${err}`,
      );
      throw err;
    }
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

        const missingIds: string[] = [];

        // Try Cache first
        for (const id of ids) {
          const cacheKey = `auth:${sessionId}:key:${type}:${id}`;
          try {
            const cached = await cache.get<string>(cacheKey);
            if (cached) {
              let parsed = JSON.parse(cached, BufferJSON.reviver) as unknown;
              if (type === 'app-state-sync-key') {
                parsed = proto.Message.AppStateSyncKeyData.fromObject(
                  parsed as Record<string, any>,
                );
              }
              result[id] = parsed as SignalDataTypeMap[typeof type];
              continue;
            }
          } catch (err) {
            logger?.error(`Cache read error (key ${type}:${id}): ${err}`);
          }
          missingIds.push(id);
        }

        if (missingIds.length === 0) return result;

        // Fallback to DB
        const keys = missingIds.map((id) => buildKey(type, id));
        const rows = await prisma.authCredential.findMany({
          where: {
            sessionId,
            key: { in: keys },
          },
        });

        for (const row of rows) {
          const prefix = `${type}-`;
          const id = row.key.slice(prefix.length);

          let parsed = JSON.parse(row.value, BufferJSON.reviver) as unknown;
          if (type === 'app-state-sync-key') {
            parsed = proto.Message.AppStateSyncKeyData.fromObject(
              parsed as Record<string, any>,
            );
          }
          result[id] = parsed as SignalDataTypeMap[typeof type];

          // Backfill cache
          const cacheKey = `auth:${sessionId}:key:${type}:${id}`;
          void cache
            .set(cacheKey, row.value)
            .catch((e) => logger?.error(`Cache backfill error: ${e}`));
        }

        return result;
      },

      set: async (data: SignalDataSet): Promise<void> => {
        const operations: any[] = [];

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
          try {
            await prisma.$transaction(operations);

            // Update/Delete Cache
            for (const _type in data) {
              const type = _type as keyof SignalDataTypeMap;
              const entries = data[type];
              if (!entries) continue;

              for (const id in entries) {
                const value = entries[id];
                const cacheKey = `auth:${sessionId}:key:${type}:${id}`;
                if (value) {
                  const serialized = JSON.stringify(value, BufferJSON.replacer);
                  await cache.set(cacheKey, serialized);
                } else {
                  await cache.del(cacheKey);
                }
              }
            }
          } catch (err) {
            logger?.error(
              `Failed to save keys for session "${sessionId}": ${err}`,
            );
          }
        }
      },
    },
  };

  return { state, saveCreds };
}

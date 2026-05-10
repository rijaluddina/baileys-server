import type { Logger } from '@nestjs/common';
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataSet,
  SignalDataTypeMap,
} from 'baileys';
import { proto } from 'baileys';
import { initAuthCreds, BufferJSON } from 'baileys';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { Cache } from 'cache-manager';
import type { Prisma } from '../generated/prisma/client/client.js';

function buildKeys(type: string, id: string): { type: string; keyId: string } {
  return { type, keyId: id };
}

export async function usePrismaAuthState(
  sessionId: string,
  prisma: PrismaService,
  cache: Cache,
  logger?: Logger,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const credsCacheKey = `auth:${sessionId}:creds`;

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
      where: { sessionId_type_keyId: { sessionId, type: 'creds', keyId: '' } },
    });

    if (credsRow) {
      creds = JSON.parse(
        credsRow.data,
        BufferJSON.reviver,
      ) as AuthenticationCreds;
      void cache
        .set(credsCacheKey, credsRow.data)
        .catch((e) => logger?.error(`Cache write error (creds): ${e}`));
    } else {
      creds = initAuthCreds();
    }
  }

  const saveCreds = async () => {
    try {
      const data = JSON.stringify(creds, BufferJSON.replacer);
      await prisma.authCredential.upsert({
        where: {
          sessionId_type_keyId: { sessionId, type: 'creds', keyId: '' },
        },
        create: { sessionId, type: 'creds', keyId: '', data },
        update: { data },
      });
      await cache.set(credsCacheKey, data);
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

        const rows = await prisma.authCredential.findMany({
          where: { sessionId, type, keyId: { in: missingIds } },
        });

        for (const row of rows) {
          let parsed = JSON.parse(row.data, BufferJSON.reviver) as unknown;
          if (type === 'app-state-sync-key') {
            parsed = proto.Message.AppStateSyncKeyData.fromObject(
              parsed as Record<string, any>,
            );
          }
          result[row.keyId] = parsed as SignalDataTypeMap[typeof type];

          const cacheKey = `auth:${sessionId}:key:${type}:${row.keyId}`;
          void cache
            .set(cacheKey, row.data)
            .catch((e) => logger?.error(`Cache backfill error: ${e}`));
        }

        return result;
      },

      set: async (data: SignalDataSet): Promise<void> => {
        const operations: Prisma.PrismaPromise<unknown>[] = [];

        for (const _type in data) {
          const typ = _type as keyof SignalDataTypeMap;
          const entries = data[typ];
          if (!entries) continue;

          for (const id in entries) {
            const value = entries[id];
            const { type: t, keyId } = buildKeys(typ, id);

            if (value) {
              const serialized = JSON.stringify(value, BufferJSON.replacer);
              operations.push(
                prisma.authCredential.upsert({
                  where: {
                    sessionId_type_keyId: { sessionId, type: t, keyId },
                  },
                  create: { sessionId, type: t, keyId, data: serialized },
                  update: { data: serialized },
                }),
              );
            } else {
              operations.push(
                prisma.authCredential.deleteMany({
                  where: { sessionId, type: t, keyId },
                }),
              );
            }
          }
        }

        if (operations.length > 0) {
          try {
            await prisma.$transaction(operations);

            for (const _type in data) {
              const typ = _type as keyof SignalDataTypeMap;
              const entries = data[typ];
              if (!entries) continue;

              for (const id in entries) {
                const value = entries[id];
                const cacheKey = `auth:${sessionId}:key:${typ}:${id}`;
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

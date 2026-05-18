import { usePrismaAuthState } from './prisma-auth-state.js';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service.js';

jest.mock('baileys', () => ({
  initAuthCreds: jest.fn(() => ({})),
  BufferJSON: {
    replacer: (_key: string, value: unknown) => value,
    reviver: (_key: string, value: unknown) => value,
  },
  proto: {
    Message: {
      AppStateSyncKeyData: {
        fromObject: jest.fn((value: unknown) => value),
      },
    },
  },
}));

type MockPrisma = Pick<PrismaService, 'authCredential' | '$transaction'>;
type MockCache = Pick<Cache, 'get' | 'set' | 'del'>;

describe('usePrismaAuthState', () => {
  it('persists signal key mutations in a single transaction', async () => {
    const prisma: MockPrisma = {
      authCredential: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        upsert: jest.fn((args: unknown) => ({ operation: 'upsert', args })),
        deleteMany: jest.fn((args: unknown) => ({
          operation: 'deleteMany',
          args,
        })),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    const mockCache: MockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const { state } = await usePrismaAuthState(
      'session-1',
      prisma as PrismaService,
      mockCache as Cache,
    );

    await state.keys.set({
      session: {
        'key-1': { value: 'stored' } as unknown as Uint8Array,
        'key-2': null,
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.objectContaining({ operation: 'upsert' }),
      expect.objectContaining({ operation: 'deleteMany' }),
    ]);
  });
});

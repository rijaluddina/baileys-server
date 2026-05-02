import { usePrismaAuthState } from './prisma-auth-state';

jest.mock('@whiskeysockets/baileys', () => ({
  initAuthCreds: jest.fn(() => ({})),
  BufferJSON: {
    replacer: (_key: string, value: unknown) => value,
    reviver: (_key: string, value: unknown) => value,
  },
  proto: {
    Message: {
      AppStateSyncKeyData: {
        fromObject: jest.fn((value) => value),
      },
    },
  },
}));

describe('usePrismaAuthState', () => {
  it('persists signal key mutations in a single transaction', async () => {
    const prisma = {
      authCredential: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        upsert: jest.fn((args) => ({ operation: 'upsert', args })),
        deleteMany: jest.fn((args) => ({ operation: 'deleteMany', args })),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    const { state } = await usePrismaAuthState('session-1', prisma as any);

    await state.keys.set({
      session: {
        'key-1': { value: 'stored' } as any,
        'key-2': null as any,
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.objectContaining({ operation: 'upsert' }),
      expect.objectContaining({ operation: 'deleteMany' }),
    ]);
  });
});

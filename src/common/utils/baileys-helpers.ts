import type { Prisma } from '../../generated/prisma/client/client.js';

export interface Long {
  low: number;
  high: number;
  unsigned: boolean;
}

export function toLong(val: number | Long | undefined): number {
  if (!val) return Date.now() / 1000;
  if (typeof val === 'number') return val;
  return val.low;
}

export function getMessageType(
  message: Record<string, unknown> | undefined,
): string | null {
  if (!message) return null;
  const types = [
    'conversation',
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'documentMessage',
    'stickerMessage',
    'contactMessage',
    'locationMessage',
    'extendedTextMessage',
    'pollCreationMessage',
    'reactionMessage',
    'listMessage',
    'buttonsMessage',
  ];
  return types.find((t) => t in message) ?? null;
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

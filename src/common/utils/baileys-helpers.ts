import type { Prisma } from '../../generated/prisma/client/client.js';

export interface Long {
  low: number;
  high: number;
  unsigned: boolean;
}

export function toLong(val: string | number | Long | undefined): number {
  if (val === undefined || val === null) return Math.floor(Date.now() / 1000);
  if (typeof val === 'string') return parseInt(val, 10);
  if (typeof val === 'number') return val;
  // Handle Baileys Long object (low/high bits)
  if ('low' in val && 'high' in val) {
    const low = val.low >>> 0;
    const high = val.high;
    return high * 4294967296 + low;
  }
  return Math.floor(Date.now() / 1000);
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

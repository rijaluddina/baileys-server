import * as crypto from 'crypto';

export function generateApiKey(prefixLength = 8): {
  key: string;
  hash: string;
  prefix: string;
} {
  const key = crypto.randomBytes(32).toString('hex');
  const hash = hashApiKey(key);
  const prefix = key.slice(0, prefixLength);
  return { key, hash, prefix };
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function verifyApiKey(key: string, hash: string): boolean {
  const keyHash = hashApiKey(key);
  return crypto.timingSafeEqual(Buffer.from(keyHash), Buffer.from(hash));
}

export function generateSessionId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

export function generateIdempotencyKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

export function generateSecret(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function encrypt(data: string, secret: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(secret).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decrypt(encrypted: string, secret: string): string {
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.createHash('sha256').update(secret).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

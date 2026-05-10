export function isJidUser(jid: string): boolean {
  return (
    jid.includes('@s.whatsapp.net') &&
    !jid.includes('@g.us') &&
    !jid.includes('@broadcast') &&
    !jid.includes('@newsletter') &&
    !jid.includes('@status')
  );
}

export function isJidGroup(jid: string): boolean {
  return jid.includes('@g.us');
}

export function isJidBroadcast(jid: string): boolean {
  return jid.includes('@broadcast') && !jid.includes('@status');
}

export function isJidStatusBroadcast(jid: string): boolean {
  return jid === 'status@broadcast';
}

export function isJidNewsletter(jid: string): boolean {
  return jid.includes('@newsletter');
}

export function jidNormalizedUser(jid: string): string {
  return (
    jid.replace(':@s.whatsapp.net', '@s.whatsapp.net').split('@')[0] +
    '@s.whatsapp.net'
  );
}

export function jidDecode(
  jid: string,
): { user: string; server: string } | null {
  const parts = jid.split('@');
  if (parts.length !== 2) return null;
  return { user: parts[0], server: parts[1] };
}

export function extractPhoneFromJid(jid: string): string | null {
  const decoded = jidDecode(jid);
  if (!decoded) return null;
  if (decoded.server === 's.whatsapp.net') {
    return decoded.user;
  }
  return null;
}

export function buildUserJid(
  phoneNumber: string,
  withCountryCode = true,
): string {
  const clean = phoneNumber.replace(/\D/g, '');
  const number = withCountryCode ? clean : `62${clean}`;
  return `${number}@s.whatsapp.net`;
}

export function buildGroupJid(inviteCode: string): string {
  return `${inviteCode}@g.us`;
}

export function isValidJid(jid: string): boolean {
  if (!jid || typeof jid !== 'string') return false;
  const parts = jid.split('@');
  if (parts.length !== 2) return false;
  const [user, server] = parts;
  return user.length > 0 && server.length > 0;
}

export function normalizeJid(jid: string): string {
  return jidNormalizedUser(jid);
}

export function jidToPhone(jid: string): string {
  const decoded = jidDecode(jid);
  if (!decoded) return '';
  const phone = decoded.user;
  if (phone.startsWith('62')) {
    return `0${phone.slice(2)}`;
  }
  return phone;
}

export function phoneToJid(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  const number = clean.startsWith('0') ? `62${clean.slice(1)}` : clean;
  return `${number}@s.whatsapp.net`;
}

export function getChatType(
  jid: string,
): 'user' | 'group' | 'broadcast' | 'newsletter' | 'status' | 'unknown' {
  if (isJidUser(jid)) return 'user';
  if (isJidGroup(jid)) return 'group';
  if (isJidBroadcast(jid)) return 'broadcast';
  if (isJidNewsletter(jid)) return 'newsletter';
  if (isJidStatusBroadcast(jid)) return 'status';
  return 'unknown';
}

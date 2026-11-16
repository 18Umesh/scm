import { randomBytes, scryptSync, timingSafeEqual, createHash, createHmac, randomUUID,createCipheriv,createDecipheriv } from 'node:crypto';
function identityKey(){const value=process.env.AUTH_ENCRYPTION_KEY??(process.env.NODE_ENV==='production'?'':'local-fictional-identity-key');if(!value)throw new Error('encryptionNotConfigured');return createHash('sha256').update(value).digest();}
export function protectIdentitySecret(value:string){const nonce=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',identityKey(),nonce);const data=Buffer.concat([cipher.update(value),cipher.final()]);return['enc',nonce.toString('base64url'),data.toString('base64url'),cipher.getAuthTag().toString('base64url')].join(':');}
export function readIdentitySecret(value:string){if(!value.startsWith('enc:'))return value;const[,nonce,data,tag]=value.split(':');const cipher=createDecipheriv('aes-256-gcm',identityKey(),Buffer.from(nonce,'base64url'));cipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8');}
export function id(): string {
  const bytes = Buffer.from(randomUUID().replaceAll('-', ''), 'hex');
  bytes.writeUIntBE(Date.now(), 0, 6); bytes[6] = (bytes[6] & 15) | 0x70;
  const s = bytes.toString('hex'); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hex] = stored.split(':');
  if (!salt || !hex || hex.length !== 128) return false;
  const actual = scryptSync(password, salt, 64); return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
export function token() { return randomBytes(32).toString('base64url'); }
export function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
function base32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const c of value.toUpperCase().replace(/=+$/, '')) { const n = alphabet.indexOf(c); if (n < 0) throw new Error('Invalid TOTP secret'); bits += n.toString(2).padStart(5,'0'); }
  return Buffer.from(bits.match(/.{8}/g)!.map(b => parseInt(b,2)));
}
export function totp(secret: string, time = Date.now()): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const hmac = createHmac('sha1', base32(secret)).update(counter).digest(); const offset = hmac[19] & 15;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6,'0');
}
export function verifyTotp(secret: string, code: string, time = Date.now()): boolean {
  return /^\d{6}$/.test(code) && [-1,0,1].some(d => timingSafeEqual(Buffer.from(totp(secret, time + d * 30000)), Buffer.from(code)));
}
export class RateLimiter {
  private entries = new Map<string, { count: number; reset: number }>();
  take(key: string, max = 8, windowMs = 60000, now = Date.now()): boolean {
    if (this.entries.size > 10000) for (const [k,v] of this.entries) if (v.reset <= now) this.entries.delete(k);
    let entry = this.entries.get(key);
    if (!entry || entry.reset <= now) { entry = { count: 0, reset: now + windowMs }; this.entries.set(key, entry); }
    entry.count++; return entry.count <= max;
  }
}

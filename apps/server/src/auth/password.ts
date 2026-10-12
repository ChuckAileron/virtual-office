import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Limita intentos de login fallidos por clave dentro de una ventana de tiempo. */
export function createLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const map = new Map<string, { count: number; until: number }>();
  const live = (key: string) => {
    const e = map.get(key);
    if (e && e.until <= now()) { map.delete(key); return null; }
    return e ?? null;
  };
  return {
    blocked: (key: string) => (live(key)?.count ?? 0) >= max,
    fail(key: string) {
      const e = live(key) ?? { count: 0, until: now() + windowMs };
      e.count++;
      map.set(key, e);
    },
    reset: (key: string) => { map.delete(key); },
  };
}

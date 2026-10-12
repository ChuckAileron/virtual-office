import { randomBytes } from 'node:crypto';
import * as path from 'node:path';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  livekit: { apiKey: string; apiSecret: string; publicUrl: string | null };
  idleMs: number;
  petTickMs: number;
  webDist: string;
  trustProxy: boolean;
  production: boolean;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

type Env = Record<string, string | undefined>;

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function loadConfig(env: Env = process.env): AppConfig {
  const production = env.NODE_ENV === 'production';
  let jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    if (production) throw new Error('JWT_SECRET es obligatorio en producción');
    // Solo desarrollo: los tokens dejan de valer al reiniciar el servidor
    jwtSecret = randomBytes(32).toString('hex');
  }
  return {
    port: num(env.PORT, 3000),
    databaseUrl: env.DATABASE_URL || 'postgresql://localhost:5432/office',
    jwtSecret,
    livekit: {
      apiKey: env.LIVEKIT_API_KEY || '',
      apiSecret: env.LIVEKIT_API_SECRET || '',
      publicUrl: env.LIVEKIT_PUBLIC_URL || null,
    },
    idleMs: num(env.IDLE_MS, 5 * 60 * 1000),
    petTickMs: num(env.PET_TICK_MS, 700),
    webDist: env.WEB_DIST || path.join(__dirname, '..', '..', 'web', 'dist'),
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    production,
  };
}

import { randomBytes } from 'node:crypto';
import * as path from 'node:path';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  janus: {
    /** URL WebSocket que usa el navegador. */
    publicUrl: string | null;
    /** Secreto con el que se derivan id de sala y PIN. Nunca sale del servidor. */
    roomSecret: string;
    /** API HTTP interna de Janus (p. ej. `http://janus:8088/janus`). Si es null, modo legado. */
    apiUrl: string | null;
    /** Secreto HMAC con el que se firman los tokens que exige Janus. */
    authSecret: string | null;
    /** admin_key de VideoRoom: solo el servidor puede crear salas. */
    adminKey: string | null;
    /** Validez de los tokens de Janus, en segundos. */
    tokenTtlSeconds: number;
  };
  idleMs: number;
  petTickMs: number;
  webDist: string;
  /** Archivo de persistencia del modo `memory` (desarrollo sin Postgres). */
  memoryFile: string;
  /** Directorio persistente de imágenes de decoración. */
  uploadsDir: string;
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
    janus: {
      publicUrl: env.JANUS_PUBLIC_URL || null,
      roomSecret: env.JANUS_ROOM_SECRET || jwtSecret,
      apiUrl: env.JANUS_API_URL || null,
      authSecret: env.JANUS_AUTH_SECRET || null,
      adminKey: env.JANUS_ADMIN_KEY || null,
      tokenTtlSeconds: num(env.JANUS_TOKEN_TTL, 24 * 60 * 60),
    },
    idleMs: num(env.IDLE_MS, 5 * 60 * 1000),
    petTickMs: num(env.PET_TICK_MS, 700),
    webDist: env.WEB_DIST || path.join(__dirname, '..', '..', 'web', 'dist'),
    memoryFile: env.MEMORY_FILE || path.join(__dirname, '..', '..', '..', 'data', 'offices.json'),
    uploadsDir: env.UPLOADS_DIR || path.join(__dirname, '..', '..', '..', 'data', 'floor-images'),
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    production,
  };
}

import { randomBytes } from 'node:crypto';
import * as path from 'node:path';

export interface AppConfig {
  port: number;
  environment: 'local' | 'cloud';
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
  const environment = env.ENVIRONMENT?.trim().toLowerCase() === 'local' ? 'local' : 'cloud';
  const production = env.NODE_ENV === 'production' || environment === 'cloud';
  let databaseUrl: string;
  if (environment === 'local') {
    databaseUrl = env.DATABASE_URL || 'postgresql://localhost:5432/office';
  } else {
    const username = env.DATABASE_USERNAME || env.PGUSER;
    const password = env.DATABASE_PASSWORD || env.PGPASSWORD;
    if (!username || !password) {
      throw new Error('DATABASE_USERNAME y DATABASE_PASSWORD son obligatorias fuera de LOCAL');
    }
    const host = env.DATABASE_HOST || env.PGHOST;
    if (!host) throw new Error('DATABASE_HOST o PGHOST es obligatorio fuera de LOCAL');
    const port = num(env.DATABASE_PORT || env.PGPORT, 5432);
    const database = env.DATABASE_NAME || env.PGDATABASE || 'office';
    const url = new URL(`postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`);
    const sslmode = env.DATABASE_SSLMODE || 'require';
    url.searchParams.set('sslmode', sslmode);
    // Railway puede servir una cadena con CA autofirmada. Pide TLS cifrado con
    // semántica libpq para require; verify-full sigue disponible al aportar una CA.
    if (sslmode.toLowerCase() === 'require') url.searchParams.set('uselibpqcompat', 'true');
    databaseUrl = url.toString();
  }
  let jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    if (production) throw new Error('JWT_SECRET es obligatorio en producción');
    // Solo desarrollo: los tokens dejan de valer al reiniciar el servidor
    jwtSecret = randomBytes(32).toString('hex');
  }
  return {
    port: num(env.PORT, 3000),
    environment,
    databaseUrl,
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

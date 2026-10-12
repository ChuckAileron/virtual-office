import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Pool } from 'pg';

/**
 * Persistencia de desarrollo para el modo `memory` (pg-mem).
 *
 * Sin esto, cada reinicio del servidor borra cuentas, espacios de trabajo y objetos porque la
 * base vive en RAM. Guardamos un snapshot JSON de las tablas y lo restauramos al
 * arrancar. Los ids seriales se omiten: al restaurar en tablas vacías se
 * reasignan de forma consecutiva y la secuencia sigue avanzando con normalidad.
 */

// Tablas cuyo contenido se persiste.
const TABLES = ['users', 'rooms', 'objects', 'pets', 'floor_decorations', 'floor_styles'] as const;

interface MemoryTable {
  find(): Array<Record<string, unknown>>;
  insert(item: Record<string, unknown>): unknown;
}

interface PgMem {
  public: { getTable(name: string, nullIfNotFound?: boolean): MemoryTable | null };
  adapters: { createPg(): { Pool: new () => Pool } };
}

let store: { db: PgMem; file: string; timer: NodeJS.Timeout } | null = null;

function snapshot(db: PgMem): Record<string, Array<Record<string, unknown>>> {
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const name of TABLES) {
    const table = db.public.getTable(name, true);
    if (!table) continue;
    out[name] = table.find().map(({ id: _id, ...rest }) => rest);
  }
  return out;
}

/** Vuelca el estado actual a disco (best-effort). */
export function persistMemory(): void {
  if (!store) return;
  try {
    fs.mkdirSync(path.dirname(store.file), { recursive: true });
    fs.writeFileSync(store.file, JSON.stringify(snapshot(store.db)));
  } catch {
    // Persistencia de desarrollo: un fallo de escritura no debe tumbar el servidor.
  }
}

/** Crea la base en memoria y programa el guardado periódico. Devuelve el Pool. */
export function openMemory(file: string): Pool {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { newDb } = require('pg-mem') as { newDb(): PgMem };
  const db = newDb();
  const timer = setInterval(persistMemory, 2000);
  timer.unref?.();
  store = { db, file, timer };
  return new (db.adapters.createPg().Pool)();
}

/** Restaura el snapshot guardado. Debe llamarse después de crear el esquema. */
export function restoreMemory(): void {
  if (!store || !fs.existsSync(store.file)) return;
  try {
    const data = JSON.parse(fs.readFileSync(store.file, 'utf8')) as Record<string, Array<Record<string, unknown>>>;
    for (const name of TABLES) {
      const rows = data[name];
      const table = store.db.public.getTable(name, true);
      if (!table || !Array.isArray(rows)) continue;
      for (const row of rows) table.insert(row);
    }
  } catch {
    // Snapshot corrupto: se ignora y se arranca con la base vacía.
  }
}

/** Guarda y detiene el guardado periódico. */
export function closeMemory(): void {
  if (!store) return;
  clearInterval(store.timer);
  persistMemory();
  store = null;
}

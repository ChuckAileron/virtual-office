import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';

const sqlitePath = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

if (!sqlitePath || !existsSync(sqlitePath)) {
  console.error('Uso: npm run migrate:sqlite -- <ruta-a-offices.db>');
  process.exit(1);
}
if (!databaseUrl || databaseUrl === 'memory') {
  console.error('Configura DATABASE_URL con la conexión de PostgreSQL destino.');
  process.exit(1);
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

const sourceHash = await sha256File(sqlitePath);
const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const pg = new Pool({ connectionString: databaseUrl, max: 1 });

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, username TEXT NOT NULL, username_lower TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL, appearance TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member'
  )`,
  `CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, size TEXT NOT NULL, tiles TEXT NOT NULL, offices TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS objects (
    id SERIAL PRIMARY KEY, room_code TEXT NOT NULL, type TEXT NOT NULL,
    x INTEGER NOT NULL, y INTEGER NOT NULL, orientation TEXT NOT NULL DEFAULT 'front'
  )`,
  `CREATE TABLE IF NOT EXISTS pets (
    id SERIAL PRIMARY KEY, room_code TEXT NOT NULL, kind TEXT NOT NULL, color TEXT NOT NULL,
    x INTEGER NOT NULL, y INTEGER NOT NULL, dir TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS floor_decorations (
    id SERIAL PRIMARY KEY, room_code TEXT NOT NULL, image_url TEXT NOT NULL,
    x INTEGER NOT NULL, y INTEGER NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS floor_styles (
    room_code TEXT NOT NULL, office_id INTEGER NOT NULL, color TEXT NOT NULL,
    pattern TEXT NOT NULL, PRIMARY KEY (room_code, office_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sqlite_imports (source_sha256 TEXT PRIMARY KEY, imported_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'",
  "ALTER TABLE objects ADD COLUMN IF NOT EXISTS orientation TEXT NOT NULL DEFAULT 'front'",
];

function tableExists(name) {
  return sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

function readTable(name) {
  return tableExists(name) ? sqlite.prepare(`SELECT * FROM ${name}`).all() : [];
}

function normalizedSize(size, width, height, layout) {
  const old = size && typeof size === 'object' ? size : {};
  return {
    width: old.width ?? width,
    height: old.height ?? height,
    offices: old.offices ?? layout.offices?.filter((office) => office.kind === 'office').length ?? 1,
    conference: old.conference ?? Boolean(layout.offices?.some((office) => office.kind === 'conference')),
    boss: old.boss ?? Boolean(layout.offices?.some((office) => office.kind === 'boss')),
    kitchen: old.kitchen ?? Boolean(layout.offices?.some((office) => office.kind === 'kitchen')),
    rest: old.rest ?? Boolean(layout.offices?.some((office) => office.kind === 'rest')),
    version: old.version ?? 1,
  };
}

try {
  for (const sql of schema) await pg.query(sql);
  const alreadyImported = await pg.query('SELECT 1 FROM sqlite_imports WHERE source_sha256 = $1', [sourceHash]);
  if (alreadyImported.rowCount) {
    console.log('Esta copia SQLite ya fue importada (hash idéntico); no se hicieron cambios.');
    process.exitCode = 0;
  } else {
    const users = readTable('users');
    const rooms = readTable('rooms');
    const objects = readTable('room_objects');
    const pets = readTable('room_pets');
    let userCount = 0;
    let roomCount = 0;
    let objectCount = 0;
    let petCount = 0;

    await pg.query('BEGIN');
    try {
      for (const user of users) {
        const result = await pg.query(
          `INSERT INTO users (username, username_lower, password, appearance, role)
           VALUES ($1, $2, $3, $4, 'member') ON CONFLICT (username_lower) DO NOTHING`,
          [user.username, String(user.username).toLowerCase(), user.password, user.appearance],
        );
        userCount += result.rowCount ?? 0;
      }

      const importedCodes = new Set();
      for (const room of rooms) {
        const layout = JSON.parse(room.layout);
        const size = normalizedSize(layout.size, room.width, room.height, layout);
        const result = await pg.query(
          `INSERT INTO rooms (code, name, size, tiles, offices) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (code) DO NOTHING`,
          [room.code, room.name, JSON.stringify(size), JSON.stringify(layout.tiles), JSON.stringify(layout.offices)],
        );
        if ((result.rowCount ?? 0) > 0) {
          importedCodes.add(room.code);
          roomCount++;
        }
      }

      for (const object of objects) {
        if (!importedCodes.has(object.room_code)) continue;
        await pg.query(
          `INSERT INTO objects (room_code, type, x, y, orientation) VALUES ($1, $2, $3, $4, 'front')`,
          [object.room_code, object.type, object.x, object.y],
        );
        objectCount++;
      }
      for (const pet of pets) {
        if (!importedCodes.has(pet.room_code)) continue;
        await pg.query(
          `INSERT INTO pets (room_code, kind, color, x, y, dir) VALUES ($1, $2, $3, $4, $5, 'down')`,
          [pet.room_code, pet.kind, pet.color, pet.x, pet.y],
        );
        petCount++;
      }

      await pg.query('INSERT INTO sqlite_imports (source_sha256) VALUES ($1)', [sourceHash]);
      await pg.query('COMMIT');
    } catch (error) {
      await pg.query('ROLLBACK');
      throw error;
    }
    console.log(`Importación completada: ${userCount} usuarios, ${roomCount} salas, ${objectCount} objetos y ${petCount} mascotas.`);
    console.log('Los usuarios que ya existían en PostgreSQL se conservaron; las salas con código duplicado no se sobrescribieron.');
  }
} finally {
  sqlite.close();
  await pg.end();
}

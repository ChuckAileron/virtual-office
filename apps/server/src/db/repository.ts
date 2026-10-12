import { randomInt } from 'node:crypto';
import { CODE_ALPHABET, Appearance, FloorSize, Layout, Office, Pet, PlacedObject, Tiles } from '@vo/shared';

export const DB = Symbol('DB');

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface UserRow {
  id: number;
  username: string;
  password: string;
  appearance: Appearance;
}

export interface RoomRow {
  code: string;
  name: string;
  size: FloorSize;
  tiles: Tiles;
  offices: Office[];
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    appearance TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    size TEXT NOT NULL,
    tiles TEXT NOT NULL,
    offices TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS objects (
    id SERIAL PRIMARY KEY,
    room_code TEXT NOT NULL,
    type TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pets (
    id SERIAL PRIMARY KEY,
    room_code TEXT NOT NULL,
    kind TEXT NOT NULL,
    color TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    dir TEXT NOT NULL
  )`,
];

const newCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export class Repository {
  constructor(private readonly db: Queryable) {}

  async migrate(): Promise<void> {
    for (const sql of SCHEMA) await this.db.query(sql);
  }

  /** Devuelve null si el nombre ya existe (sin distinguir mayúsculas). */
  async createUser(username: string, password: string, appearance: Appearance): Promise<UserRow | null> {
    if (await this.getUserByName(username)) return null;
    try {
      const r = await this.db.query(
        'INSERT INTO users (username, username_lower, password, appearance) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, username.toLowerCase(), password, JSON.stringify(appearance)],
      );
      return { id: Number(r.rows[0].id), username, password, appearance };
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return null;
      throw e;
    }
  }

  async getUserByName(username: string): Promise<UserRow | null> {
    const r = await this.db.query('SELECT * FROM users WHERE username_lower = $1', [username.toLowerCase()]);
    return r.rows[0] ? this.toUser(r.rows[0]) : null;
  }

  async getUserById(id: number): Promise<UserRow | null> {
    const r = await this.db.query('SELECT * FROM users WHERE id = $1', [id]);
    return r.rows[0] ? this.toUser(r.rows[0]) : null;
  }

  async updateAppearance(id: number, appearance: Appearance): Promise<void> {
    await this.db.query('UPDATE users SET appearance = $1 WHERE id = $2', [JSON.stringify(appearance), id]);
  }

  async saveRoom(name: string, layout: Layout): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = newCode();
      const exists = await this.db.query('SELECT code FROM rooms WHERE code = $1', [code]);
      if (exists.rows.length) continue;
      await this.db.query('INSERT INTO rooms (code, name, size, tiles, offices) VALUES ($1, $2, $3, $4, $5)', [
        code,
        name,
        JSON.stringify(layout.size),
        JSON.stringify(layout.tiles),
        JSON.stringify(layout.offices),
      ]);
      return code;
    }
    throw new Error('No se pudo generar un código único');
  }

  async loadRooms(): Promise<RoomRow[]> {
    const r = await this.db.query('SELECT * FROM rooms');
    return r.rows.map((row) => ({
      code: row.code,
      name: row.name,
      size: JSON.parse(row.size),
      tiles: JSON.parse(row.tiles),
      offices: JSON.parse(row.offices),
    }));
  }

  async addObject(code: string, type: string, x: number, y: number): Promise<PlacedObject> {
    const r = await this.db.query('INSERT INTO objects (room_code, type, x, y) VALUES ($1, $2, $3, $4) RETURNING id', [code, type, x, y]);
    return { id: Number(r.rows[0].id), type, x, y };
  }

  async removeObject(code: string, id: number): Promise<void> {
    await this.db.query('DELETE FROM objects WHERE id = $1 AND room_code = $2', [id, code]);
  }

  async loadObjects(code: string): Promise<PlacedObject[]> {
    const r = await this.db.query('SELECT id, type, x, y FROM objects WHERE room_code = $1 ORDER BY id', [code]);
    return r.rows.map((o) => ({ id: Number(o.id), type: o.type, x: Number(o.x), y: Number(o.y) }));
  }

  async addPet(code: string, kind: string, color: string, x: number, y: number): Promise<Pet> {
    const r = await this.db.query(
      'INSERT INTO pets (room_code, kind, color, x, y, dir) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [code, kind, color, x, y, 'down'],
    );
    return { id: Number(r.rows[0].id), kind, color, x, y, dir: 'down' };
  }

  async removePet(code: string, id: number): Promise<void> {
    await this.db.query('DELETE FROM pets WHERE id = $1 AND room_code = $2', [id, code]);
  }

  async loadPets(code: string): Promise<Pet[]> {
    const r = await this.db.query('SELECT id, kind, color, x, y, dir FROM pets WHERE room_code = $1 ORDER BY id', [code]);
    return r.rows.map((p) => ({ id: Number(p.id), kind: p.kind, color: p.color, x: Number(p.x), y: Number(p.y), dir: p.dir }));
  }

  private toUser(row: any): UserRow {
    return { id: Number(row.id), username: row.username, password: row.password, appearance: JSON.parse(row.appearance) };
  }
}

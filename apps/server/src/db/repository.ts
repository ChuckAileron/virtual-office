import { randomInt } from 'node:crypto';
import { CODE_ALPHABET, Appearance, FloorDecoration, FloorSize, Layout, Office, OfficeFloorStyle, Pet, PlacedObject, Role, Tiles, asRole } from '@vo/shared';

export const DB = Symbol('DB');

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface UserRow {
  id: number;
  username: string;
  password: string;
  appearance: Appearance;
  role: Role;
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
    appearance TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
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
    y INTEGER NOT NULL,
    orientation TEXT NOT NULL DEFAULT 'front'
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
  `CREATE TABLE IF NOT EXISTS floor_decorations (
    id SERIAL PRIMARY KEY,
    room_code TEXT NOT NULL,
    image_url TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    w INTEGER NOT NULL,
    h INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS floor_styles (
    room_code TEXT NOT NULL,
    office_id INTEGER NOT NULL,
    color TEXT NOT NULL,
    pattern TEXT NOT NULL,
    PRIMARY KEY (room_code, office_id)
  )`,
];

const newCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export class Repository {
  constructor(private readonly db: Queryable) {}

  async migrate(): Promise<void> {
    for (const sql of SCHEMA) await this.db.query(sql);
    await this.db.query("ALTER TABLE objects ADD COLUMN IF NOT EXISTS orientation TEXT NOT NULL DEFAULT 'front'");
    await this.db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'");
  }

  /** Devuelve null si el nombre ya existe (sin distinguir mayúsculas). */
  async createUser(username: string, password: string, appearance: Appearance, role: Role = 'member'): Promise<UserRow | null> {
    if (await this.getUserByName(username)) return null;
    try {
      const r = await this.db.query(
        'INSERT INTO users (username, username_lower, password, appearance, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [username, username.toLowerCase(), password, JSON.stringify(appearance), role],
      );
      return { id: Number(r.rows[0].id), username, password, appearance, role };
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

  async updatePassword(id: number, password: string): Promise<void> {
    await this.db.query('UPDATE users SET password = $1 WHERE id = $2', [password, id]);
  }

  async updateRole(id: number, role: Role): Promise<void> {
    await this.db.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
  }

  /** Cuentas con su rol, ordenadas por usuario; usada por el panel de administración. */
  async listUsers(): Promise<Array<{ username: string; role: Role }>> {
    const r = await this.db.query('SELECT username, role FROM users ORDER BY username_lower');
    return r.rows.map((row) => ({ username: row.username, role: asRole(row.role) }));
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

  async updateRoomLayout(code: string, layout: Layout): Promise<void> {
    await this.db.query('UPDATE rooms SET size = $1, tiles = $2, offices = $3 WHERE code = $4', [
      JSON.stringify(layout.size),
      JSON.stringify(layout.tiles),
      JSON.stringify(layout.offices),
      code,
    ]);
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

  async addObject(code: string, type: string, x: number, y: number, perspective: 'front' | 'side' = 'front', flipped = false): Promise<PlacedObject> {
    const orientation = perspective === 'side' ? (flipped ? 'side-flipped' : 'side') : (flipped ? 'front-flipped' : 'front');
    const r = await this.db.query(
      'INSERT INTO objects (room_code, type, x, y, orientation) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [code, type, x, y, orientation],
    );
    return { id: Number(r.rows[0].id), type, x, y, perspective, flipped };
  }

  async removeObject(code: string, id: number): Promise<void> {
    await this.db.query('DELETE FROM objects WHERE id = $1 AND room_code = $2', [id, code]);
  }

  async moveObject(code: string, id: number, x: number, y: number): Promise<void> {
    await this.db.query('UPDATE objects SET x = $1, y = $2 WHERE id = $3 AND room_code = $4', [x, y, id, code]);
  }

  async updateObjectPreset(code: string, id: number, type: string, x: number, y: number, perspective: 'front' | 'side' = 'front', flipped = false): Promise<void> {
    const orientation = perspective === 'side' ? (flipped ? 'side-flipped' : 'side') : (flipped ? 'front-flipped' : 'front');
    await this.db.query('UPDATE objects SET type = $1, x = $2, y = $3, orientation = $4 WHERE id = $5 AND room_code = $6', [type, x, y, orientation, id, code]);
  }

  async loadObjects(code: string): Promise<PlacedObject[]> {
    const r = await this.db.query('SELECT id, type, x, y, orientation FROM objects WHERE room_code = $1 ORDER BY id', [code]);
    return r.rows.map((o) => ({
      id: Number(o.id), type: o.type, x: Number(o.x), y: Number(o.y),
      perspective: String(o.orientation).startsWith('side') ? 'side' : 'front',
      flipped: o.orientation === 'side-flipped' || o.orientation === 'front-flipped',
    }));
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

  async movePet(code: string, id: number, x: number, y: number): Promise<void> {
    await this.db.query('UPDATE pets SET x = $1, y = $2 WHERE id = $3 AND room_code = $4', [x, y, id, code]);
  }

  async addFloorDecoration(code: string, imageUrl: string, x: number, y: number, w: number, h: number): Promise<FloorDecoration> {
    const r = await this.db.query(
      'INSERT INTO floor_decorations (room_code, image_url, x, y, w, h) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [code, imageUrl, x, y, w, h],
    );
    return { id: Number(r.rows[0].id), imageUrl, x, y, w, h };
  }

  async removeFloorDecoration(code: string, id: number): Promise<void> {
    await this.db.query('DELETE FROM floor_decorations WHERE id = $1 AND room_code = $2', [id, code]);
  }

  async loadFloorDecorations(code: string): Promise<FloorDecoration[]> {
    const r = await this.db.query(
      'SELECT id, image_url, x, y, w, h FROM floor_decorations WHERE room_code = $1 ORDER BY id',
      [code],
    );
    return r.rows.map((d) => ({
      id: Number(d.id), imageUrl: d.image_url, x: Number(d.x), y: Number(d.y), w: Number(d.w), h: Number(d.h),
    }));
  }

  async moveFloorDecoration(code: string, id: number, x: number, y: number): Promise<void> {
    await this.db.query('UPDATE floor_decorations SET x = $1, y = $2 WHERE id = $3 AND room_code = $4', [x, y, id, code]);
  }

  async loadOfficeFloorStyles(code: string): Promise<OfficeFloorStyle[]> {
    const r = await this.db.query('SELECT office_id, color, pattern FROM floor_styles WHERE room_code = $1', [code]);
    return r.rows.map((style) => ({ officeId: Number(style.office_id), color: style.color, pattern: style.pattern }));
  }

  async saveOfficeFloorStyle(code: string, style: OfficeFloorStyle): Promise<void> {
    await this.db.query(
      `INSERT INTO floor_styles (room_code, office_id, color, pattern) VALUES ($1, $2, $3, $4)
       ON CONFLICT (room_code, office_id) DO UPDATE SET color = EXCLUDED.color, pattern = EXCLUDED.pattern`,
      [code, style.officeId, style.color, style.pattern],
    );
  }

  async remapOfficeFloorStyles(code: string, mappings: Array<{ from: number; to: number }>): Promise<void> {
    if (!mappings.some(({ from, to }) => from !== to)) return;
    const temporaryOffset = 1_000_000;
    await this.db.query('UPDATE floor_styles SET office_id = office_id + $1 WHERE room_code = $2', [temporaryOffset, code]);
    for (const { from, to } of mappings) {
      await this.db.query('UPDATE floor_styles SET office_id = $1 WHERE room_code = $2 AND office_id = $3', [to, code, from + temporaryOffset]);
    }
  }

  private toUser(row: any): UserRow {
    return {
      id: Number(row.id),
      username: row.username,
      password: row.password,
      appearance: JSON.parse(row.appearance),
      role: asRole(row.role),
    };
  }
}

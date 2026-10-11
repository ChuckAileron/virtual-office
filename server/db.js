'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

// Sin caracteres ambiguos (0/O, 1/I)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatCode(raw) {
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function generateCode() {
  let raw = '';
  for (let i = 0; i < 8; i++) raw += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return raw;
}

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      layout TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password TEXT NOT NULL,
      appearance TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      type TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_room_objects_room ON room_objects (room_code)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      kind TEXT NOT NULL,
      color TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_room_pets_room ON room_pets (room_code)');
  const insertPet = db.prepare('INSERT INTO room_pets (room_code, kind, color, x, y) VALUES (?, ?, ?, ?, ?)');
  const deletePet = db.prepare('DELETE FROM room_pets WHERE id = ? AND room_code = ?');
  const selectPets = db.prepare('SELECT id, kind, color, x, y FROM room_pets WHERE room_code = ? ORDER BY id');
  const insertObject = db.prepare('INSERT INTO room_objects (room_code, type, x, y) VALUES (?, ?, ?, ?)');
  const deleteObject = db.prepare('DELETE FROM room_objects WHERE id = ? AND room_code = ?');
  const selectObjects = db.prepare('SELECT id, type, x, y FROM room_objects WHERE room_code = ? ORDER BY id');
  const insert = db.prepare('INSERT INTO rooms (code, name, width, height, layout) VALUES (?, ?, ?, ?, ?)');
  const selectAll = db.prepare('SELECT code, name, layout FROM rooms');
  const insertUser = db.prepare('INSERT INTO users (username, password, appearance) VALUES (?, ?, ?)');
  const selectUser = db.prepare('SELECT id, username, password, appearance FROM users WHERE username = ?');

  return {
    /** Crea un usuario; devuelve null si el nombre ya existe. */
    createUser(username, passwordHash, appearance) {
      try {
        const r = insertUser.run(username, passwordHash, JSON.stringify(appearance));
        return { id: Number(r.lastInsertRowid), username, appearance };
      } catch (e) {
        if (/UNIQUE|constraint/i.test(String(e.message))) return null;
        throw e;
      }
    },
    getUser(username) {
      const row = selectUser.get(String(username));
      return row ? { ...row, appearance: JSON.parse(row.appearance) } : null;
    },
    /** Guarda una sala con un código único (reintenta ante colisión). */
    saveRoom({ name, size, tiles, offices }) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = generateCode();
        try {
          insert.run(code, name, size.width, size.height, JSON.stringify({ size, tiles, offices }));
          return code;
        } catch (e) {
          if (!/UNIQUE|constraint/i.test(String(e.message))) throw e;
        }
      }
      throw new Error('No se pudo generar un código único');
    },
    loadRooms() {
      return selectAll.all().map((row) => ({ code: row.code, name: row.name, ...JSON.parse(row.layout) }));
    },
    addObject(code, type, x, y) {
      return Number(insertObject.run(code, type, x, y).lastInsertRowid);
    },
    removeObject(code, id) {
      return deleteObject.run(id, code).changes > 0;
    },
    loadObjects(code) {
      return selectObjects.all(code).map((o) => ({ id: Number(o.id), type: o.type, x: o.x, y: o.y }));
    },
    addPet(code, kind, color, x, y) {
      return Number(insertPet.run(code, kind, color, x, y).lastInsertRowid);
    },
    removePet(code, id) {
      return deletePet.run(id, code).changes > 0;
    },
    loadPets(code) {
      return selectPets.all(code).map((p) => ({ id: Number(p.id), kind: p.kind, color: p.color, x: p.x, y: p.y, dir: 'down' }));
    },
    close() { db.close(); },
  };
}

module.exports = { openDb, normalizeCode, formatCode };

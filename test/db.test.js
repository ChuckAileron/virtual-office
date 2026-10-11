'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDb, normalizeCode, formatCode } = require('../server/db');
const { generateLayout } = require('../server/layout');

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vo-')), 'test.db');
const layout = generateLayout({ offices: 3, conference: true, boss: true });

let db = openDb(file);
const code = db.saveRoom({ name: 'Piso test', ...layout });
assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
db.close();

// Persiste tras "reiniciar"
db = openDb(file);
const rooms = db.loadRooms();
assert.strictEqual(rooms.length, 1);
assert.strictEqual(rooms[0].code, code);
assert.strictEqual(rooms[0].name, 'Piso test');
assert.deepStrictEqual(rooms[0].tiles, layout.tiles);
assert.strictEqual(rooms[0].offices.length, 5);
db.close();

assert.strictEqual(normalizeCode(' ab-cd 12 34 '), 'ABCD1234');
assert.strictEqual(formatCode('ABCD1234'), 'ABCD-1234');
console.log('db OK');

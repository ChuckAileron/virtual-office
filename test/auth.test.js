'use strict';
const assert = require('assert');
const { validateCredentials, hashPassword, verifyPassword, createSessions, createLimiter } = require('../server/auth');
const { sanitizeAppearance } = require('../server/appearance');
const { openDb } = require('../server/db');

// Credenciales
assert.strictEqual(validateCredentials('ana_01', 'secreto1'), null);
assert.ok(validateCredentials('a', 'secreto1'));
assert.ok(validateCredentials('ana bad', 'secreto1'));
assert.ok(validateCredentials('ana', '123'));
assert.ok(validateCredentials({}, 'secreto1'));

// Hash
const h = hashPassword('secreto1');
assert.ok(verifyPassword('secreto1', h));
assert.ok(!verifyPassword('otra-cosa', h));
assert.notStrictEqual(hashPassword('secreto1'), h, 'sal distinta por usuario');

// Sesiones con expiración
let t = 1000;
const sessions = createSessions(100, () => t);
const tok = sessions.issue('ana');
assert.strictEqual(sessions.get(tok).username, 'ana');
assert.strictEqual(sessions.get('nope'), null);
t += 101;
assert.strictEqual(sessions.get(tok), null);

// Límite de intentos
t = 0;
const lim = createLimiter(3, 100, () => t);
for (let i = 0; i < 3; i++) { assert.ok(!lim.blocked('k')); lim.fail('k'); }
assert.ok(lim.blocked('k'));
t = 101;
assert.ok(!lim.blocked('k'));

// Apariencia
const ok = { gender: 'female', style: 2, skin: '#FFDCBC', hair: '#0b0b0b', shirt: '#ec4899', pants: '#334155' };
assert.strictEqual(sanitizeAppearance(ok).skin, '#ffdcbc');
assert.strictEqual(sanitizeAppearance({ ...ok, gender: 'x' }), null);
assert.strictEqual(sanitizeAppearance({ ...ok, style: 9 }), null);
assert.strictEqual(sanitizeAppearance({ ...ok, shirt: 'red;}' }), null);
assert.strictEqual(sanitizeAppearance(null), null);

// Usuarios en SQLite
const db = openDb(':memory:');
const u = db.createUser('Ana', hashPassword('secreto1'), sanitizeAppearance(ok));
assert.ok(u.id > 0);
assert.strictEqual(db.createUser('ANA', 'x', ok), null, 'usuario único sin distinguir mayúsculas');
const got = db.getUser('ana');
assert.strictEqual(got.username, 'Ana');
assert.deepStrictEqual(got.appearance, sanitizeAppearance(ok));
assert.ok(verifyPassword('secreto1', got.password));
assert.strictEqual(db.getUser('nadie'), null);
db.close();

console.log('auth OK');

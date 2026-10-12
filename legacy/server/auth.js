'use strict';
const crypto = require('crypto');

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 100;

function validateCredentials(username, password) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return 'El usuario debe tener 3-16 caracteres (letras, números o guion bajo)';
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres`;
  }
  return null;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** Tokens de sesión en memoria (se pierden al reiniciar el servidor). */
function createSessions(ttlMs, now = () => Date.now()) {
  const map = new Map();
  return {
    issue(username) {
      const t = now();
      for (const [k, v] of map) if (v.expires <= t) map.delete(k);
      const token = crypto.randomBytes(24).toString('hex');
      map.set(token, { username, expires: t + ttlMs });
      return token;
    },
    get(token) {
      const s = map.get(String(token));
      if (!s) return null;
      if (s.expires <= now()) { map.delete(String(token)); return null; }
      return s;
    },
  };
}

/** Limita intentos de login fallidos por clave. */
function createLimiter(max, windowMs, now = () => Date.now()) {
  const map = new Map();
  const live = (key) => {
    const e = map.get(key);
    if (e && e.until <= now()) { map.delete(key); return null; }
    return e || null;
  };
  return {
    blocked: (key) => (live(key)?.count || 0) >= max,
    fail(key) {
      const e = live(key) || { count: 0, until: now() + windowMs };
      e.count++;
      map.set(key, e);
    },
    reset: (key) => map.delete(key),
  };
}

module.exports = { validateCredentials, hashPassword, verifyPassword, createSessions, createLimiter };

'use strict';
// Generación aleatoria de personajes: apariencia = { gender, style, skin, hair, shirt, pants }.
const Appearance = (() => {
  const SKINS = ['#ffdcbc', '#f1c9a5', '#e0ac82', '#d9a67c', '#c68e63', '#8d5a3b', '#6b4226'];
  const HAIRS = ['#0b0b0b', '#1a1210', '#3b2a1d', '#5a3418', '#7c3a1c', '#a83a1b', '#d9a441', '#e6b655', '#b8b8b8', '#2d6a9f', '#7b3fa0', '#2e8b57'];
  const SHIRTS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f59e0b', '#14b8a6', '#f8fafc', '#0ea5e9', '#ec4899', '#8b5cf6', '#f97316', '#10b981', '#fde047', '#f472b6'];
  const PANTS = ['#334155', '#1f2937', '#3f3f46', '#475569', '#1e3a5f', '#44403c', '#1e293b', '#374151'];
  const STYLES = 3;

  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function random(gender) {
    return {
      gender,
      style: Math.floor(Math.random() * STYLES),
      skin: pick(SKINS),
      hair: pick(HAIRS),
      shirt: pick(SHIRTS),
      pants: pick(PANTS),
    };
  }

  return { random };
})();

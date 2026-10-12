'use strict';
const assert = require('assert');
const { computeFloorSize, generateLayout, isWalkable, T } = require('../server/layout');

// Sin extras: sólo oficinas
let s = computeFloorSize({ offices: 4 });
assert.strictEqual(s.conference, false);
assert.strictEqual(s.boss, false);

// El jefe y la sala de reuniones agrandan el piso
const base = computeFloorSize({ offices: 6 });
const withConf = computeFloorSize({ offices: 6, conference: true });
const withBoss = computeFloorSize({ offices: 6, boss: true });
assert.ok(withConf.height > base.height);
assert.ok(withBoss.height > base.height);

// La sala de reuniones crece con la cantidad de oficinas (una silla por oficina)
assert.ok(computeFloorSize({ offices: 40, conference: true }).width >= computeFloorSize({ offices: 4, conference: true }).width);

function countTiles(tiles, type) {
  return tiles.flat().filter((t) => t === type).length;
}

for (const n of [1, 2, 3, 5, 6, 7, 12, 25, 60]) {
  for (const conference of [false, true]) {
    for (const boss of [false, true]) {
      const l = generateLayout({ offices: n, conference, boss });
      const { width: W, height: H } = l.size;
      assert.strictEqual(l.tiles.length, H);
      assert.strictEqual(l.tiles[0].length, W);
      assert.strictEqual(countTiles(l.tiles, T.PLANT), 0, 'sin plantas decorativas automáticas');

      const normal = l.offices.filter((o) => o.kind === 'office');
      const conf = l.offices.filter((o) => o.kind === 'conference');
      const bossRooms = l.offices.filter((o) => o.kind === 'boss');
      assert.strictEqual(normal.length, n);
      assert.strictEqual(conf.length, conference ? 1 : 0);
      assert.strictEqual(bossRooms.length, boss ? 1 : 0);

      // Dentro del piso, sin solaparse y con puerta
      for (const o of l.offices) {
        assert.ok(o.x >= 1 && o.y >= 1 && o.x + o.w <= W - 1 && o.y + o.h <= H - 1, 'fuera del piso');
        assert.strictEqual(l.tiles[o.y + o.h - 1][o.x + Math.floor(o.w / 2)], T.DOOR);
      }
      for (let i = 0; i < l.offices.length; i++) {
        for (let j = i + 1; j < l.offices.length; j++) {
          const a = l.offices[i], b = l.offices[j];
          assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, 'solapadas');
        }
      }

      if (conference) {
        const c = conf[0];
        assert.strictEqual(c.y, Math.min(...l.offices.map((o) => o.y)), 'reuniones arriba');
        assert.strictEqual(countTiles(l.tiles, T.CHAIR), n, 'una silla por oficina');
      }
      if (boss) {
        const b = bossRooms[0];
        assert.ok(b.w > normal[0].w && b.h > normal[0].h, 'jefe más grande');
        assert.ok(Math.abs(b.x + b.w / 2 - W / 2) <= 1, 'jefe centrado horizontalmente');
        if (n > 1) {
          assert.ok(normal.some((o) => o.y < b.y) && normal.some((o) => o.y > b.y), 'jefe al medio');
        }
      }

      // Todo el piso transitable es alcanzable desde el pasillo
      const start = { x: 1, y: 1 };
      assert.ok(isWalkable(l.tiles, start.x, start.y));
      const seen = new Set([`${start.x},${start.y}`]);
      const queue = [start];
      while (queue.length) {
        const { x, y } = queue.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          const k = `${nx},${ny}`;
          if (!seen.has(k) && isWalkable(l.tiles, nx, ny)) { seen.add(k); queue.push({ x: nx, y: ny }); }
        }
      }
      let walkable = 0;
      l.tiles.forEach((row, y) => row.forEach((_, x) => { if (isWalkable(l.tiles, x, y)) walkable++; }));
      assert.strictEqual(seen.size, walkable, `zonas inaccesibles (n=${n}, conf=${conference}, boss=${boss})`);
    }
  }
}
console.log('layout OK');

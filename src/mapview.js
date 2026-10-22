// "Map" view: the same tiles assembled on one continuous hex map, to prove the
// hex workflow: one terrain chunk (one draw call) where coasts blend across hex
// borders and roads meet edge midpoints, plus caravans riding the road curves.
import { HexMap, DIRS, DIR_NAMES, HEX_R, hexToWorld, edgeMid } from './engine/hex.js';
import { TerrainChunk } from './engine/terrain.js';
import { SpriteLayer } from './engine/spriteLayer.js';
import { TILES, composeTile, waterAt } from './tiles.js';
import { rng } from './art/ink.js';

const FLORA = {
  meadow: ['tree0', 'pine0', 'tree1', 'tree2', 'pine1', 'tree3', 'shrub0', 'shrub1', 'flowerShrub0', 'pine2', 'shrub2', 'rock1'],
  autumn: ['autumnTree0', 'autumnShrub0', 'poplar0', 'autumnTree1', 'autumnShrub1', 'autumnShrub2', 'autumnTree2', 'rock2', 'autumnShrub3'],
  moor: ['heather0', 'heather1', 'heather2', 'tree0', 'heather3', 'rock1', 'heather0', 'pine0'],
  jungle: ['palm1', 'jungleShrub0', 'banana0', 'jungleShrub1', 'fern0', 'banana1', 'jungleShrub2', 'fern1'],
};

const key = (q, r) => `${q},${r}`;
const dirBetween = (a, b) => DIRS.findIndex(([dq, dr]) => a[0] + dq === b[0] && a[1] + dr === b[1]);

export function buildMapView(scene, atlas, tex, ox, oy) {
  const hexes = new Map();
  for (let r = -1; r <= 5; r++) {
    const qa = Math.ceil(-3.2 - r / 2), qb = Math.floor(3.2 - r / 2);
    for (let q = qa; q <= qb; q++) hexes.set(key(q, r), { q, r, biome: 'meadow', water: 0, roads: new Set(), tile: null });
  }
  const H = (q, r) => hexes.get(key(q, r));

  // towns (family, stage) and wild set pieces
  const place = (q, r, fam, stage) => { const h = H(q, r); h.tile = TILES[fam][stage]; h.fam = fam; };
  place(0, 0, 'apple', 1); place(1, 1, 'wool', 2); place(0, 3, 'fish', 1);
  place(2, -1, 'spice', 0); place(2, 0, 'wool', 0); place(-1, -1, 'apple', 0);

  // biomes around each town
  const ring = (q, r, b) => { for (const [dq, dr] of [[0, 0], ...DIRS]) { const h = H(q + dq, r + dr); if (h && h.biome === 'meadow') h.biome = b; } };
  H(2, -1).biome = 'jungle'; H(3, -1).biome = 'jungle'; H(3, -2)?.biome && (H(3, -2).biome = 'jungle');
  ring(1, 1, 'moor'); ring(2, 0, 'moor'); ring(0, 0, 'autumn'); H(-1, -1).biome = 'autumn';
  H(0, 1).biome = 'meadow';

  // water: the fishing village's coast continues into a bay on the west
  for (const h of hexes.values()) {
    const [x] = hexToWorld(h.q, h.r);
    if (h.r >= 2 && x < HEX_R * 1.6) h.water = 1;
  }
  Object.assign(H(-1, 3), { water: 1 }); Object.assign(H(-1, 4), { water: 1 }); Object.assign(H(0, 2), { water: 0.75 });
  Object.assign(H(0, 4), { water: 0.3 }); Object.assign(H(-1, 2), { water: 0.62 }); Object.assign(H(0, 5), { water: 0.62 }); Object.assign(H(-1, 5), { water: 1 });
  Object.assign(H(0, 3), { water: 0.47 });

  // the trade road: west edge -> orchard -> moor farm -> fishing village -> east edge
  const route = [[-4, 0], [-3, 0], [-2, 0], [-1, 0], [0, 0], [0, 1], [1, 1], [1, 2], [0, 3], [0, 4], [1, 4], [2, 4]];
  for (let i = 0; i < route.length; i++) {
    const h = H(...route[i]); if (!h) continue;
    if (i > 0) h.roads.add(dirBetween(route[i], route[i - 1]));
    if (i < route.length - 1) h.roads.add(dirBetween(route[i], route[i + 1]));
  }

  // ---- terrain data ----
  let q0 = 1e9, q1 = -1e9, r0 = 1e9, r1 = -1e9;
  for (const h of hexes.values()) { q0 = Math.min(q0, h.q); q1 = Math.max(q1, h.q); r0 = Math.min(r0, h.r); r1 = Math.max(r1, h.r); }
  const map = new HexMap(q0, r0, q1 - q0 + 1, r1 - r0 + 1);
  let n = 0;
  for (const h of hexes.values()) {
    const t = h.tile;
    map.set(h.q, h.r, { biome: h.biome, water: h.water, roads: [...h.roads], seed: 11 + n++ * 37, plaza: t?.plaza });
  }
  const chunk = new TerrainChunk(map);
  chunk.mesh.position.set(ox, oy, 0);
  scene.add(chunk.mesh);

  // ---- sprites ----
  const layer = new SpriteLayer(atlas, tex, 4096);
  layer.mesh.position.set(ox, oy, 0);
  layer.mesh.renderOrder = 1;
  scene.add(layer.mesh);
  for (const h of hexes.values()) {
    const [cx, cy] = hexToWorld(h.q, h.r);
    const water = { own: h.water };
    DIR_NAMES.forEach((nm, i) => { water[nm] = map.water(h.q + DIRS[i][0], h.r + DIRS[i][1]); });
    const roads = [...h.roads].map((i) => DIR_NAMES[i]);
    let tile;
    if (h.tile) tile = { ...h.tile, water, roads };
    else {
      const r = rng(h.q * 131 + h.r * 71 + 5);
      tile = { water, roads, sprites: [], scatter: { names: FLORA[h.biome], n: h.biome === 'moor' ? 13 : 11, seed: 100 + h.q * 13 + h.r * 29, minDist: 34 } };
      if (h.water > 0.3) for (let k = 0; k < 6; k++) {
        const x = (r() * 2 - 1) * 200, y = (r() * 2 - 1) * 220;
        if (waterAt(tile, x, y) > 0.62) tile.sprites.push([`waterRock${k % 3}`, x, y]);
        if (tile.sprites.length >= 2) break;
      }
    }
    for (const s of composeTile(tile)) layer.add(s.name, cx + s.x, cy - s.y);
  }
  const staticCount = layer.items.length;

  // ---- caravans: polyline along the exact road curves ----
  const pts = [];
  for (let i = 1; i < route.length - 1; i++) {
    const a = dirBetween(route[i], route[i - 1]), b = dirBetween(route[i], route[i + 1]);
    const [cx, cy] = hexToWorld(...route[i]);
    const A = edgeMid(a), B = edgeMid(b);
    for (let k = 0; k <= 16; k++) {
      const t = k / 16, u = 1 - t;
      const x = Math.abs(a - b) === 3 ? A[0] * u + B[0] * t : u * u * A[0] + t * t * B[0];
      const y = Math.abs(a - b) === 3 ? A[1] * u + B[1] * t : u * u * A[1] + t * t * B[1];
      pts.push({ x: cx + x, y: cy - y, edge: k === 0 || k === 16 });
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1];
  const edges = pts.map((p, i) => (p.edge ? cum[i] : null)).filter((v) => v !== null);
  const sample = (d) => {
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < d) lo = m; else hi = m; }
    const t = (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    return [pts[lo].x + (pts[hi].x - pts[lo].x) * t, pts[lo].y + (pts[hi].y - pts[lo].y) * t];
  };
  const goods = ['apple', 'wool', 'fish', 'apple', 'empty', 'wool'];
  const wagons = goods.map((g, i) => ({ name: g === 'empty' ? 'wagon_empty' : `wagon_${g}`, d: (total * i) / goods.length, dir: i % 2 ? -1 : 1, speed: 120 + (i % 3) * 18, phase: i * 1.7 }));

  return {
    chunk, layer,
    bounds: (() => {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const h of hexes.values()) { const [x, y] = hexToWorld(h.q, h.r); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { x: ox + (x0 + x1) / 2, y: oy + (y0 + y1) / 2 + HEX_R * 0.15, w: x1 - x0 + HEX_R * 2, h: y1 - y0 + HEX_R * 2.5 };
    })(),
    update(t, dt) {
      layer.items.length = staticCount;
      for (const w of wagons) {
        w.d += w.dir * w.speed * dt;
        if (w.d > total - 60) { w.d = total - 60; w.dir = -1; }
        if (w.d < 60) { w.d = 60; w.dir = 1; }
        const [x, y] = sample(w.d), [x2] = sample(w.d + w.dir * 4);
        // extra hop when rolling through a hex edge / junction
        const near = Math.min(...edges.map((e) => Math.abs(e - w.d)));
        const bounce = 0.35 + 0.9 * Math.exp(-near / 26);
        layer.add(w.name, x, y, { flip: x2 < x, bounce, phase: w.phase });
      }
      layer.dirty = true;
      chunk.update(t);
      layer.update(t);
    },
  };
}

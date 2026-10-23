// "Map" view: reference town tiles on one continuous hex map, joined by
// code-built filler land. Filler roads leave each town exactly where its
// painted road leaves the tile (per-edge road exits from tools/ingest.py), and
// caravans follow the painted road's traced centre line inside town hexes and
// the shader's road curve in filler hexes.
import { HexMap, DIRS, DIR_NAMES, HEX_R, hexToWorld, edgePort } from './engine/hex.js';
import { TerrainChunk } from './engine/terrain.js';
import { SpriteLayer } from './engine/spriteLayer.js';
import { TILES, composeTile, waterAt } from './tiles.js';
import { rng } from './art/ink.js';
import { dressFiller } from './filler.js';

const key = (q, r) => `${q},${r}`;
const dirBetween = (a, b) => DIRS.findIndex(([dq, dr]) => a[0] + dq === b[0] && a[1] + dr === b[1]);

export function buildMapView(scene, atlas, tex, ox, oy, ref) {
  const hexes = new Map();
  for (let r = -1; r <= 4; r++) {
    const qa = Math.ceil(-3.2 - r / 2), qb = Math.floor(3.2 - r / 2);
    for (let q = qa; q <= qb; q++) hexes.set(key(q, r), { q, r, biome: 'meadow', water: 0, roads: new Set(), roadOff: {}, ref: null });
  }
  const H = (q, r) => hexes.get(key(q, r));

  // towns and wild set pieces (reference tiles); each town's road exits face its neighbours on the routes
  const place = (q, r, ref_, biome) => Object.assign(H(q, r), { ref: ref_, biome, tile: TILES[ref_.split('_')[0]][+ref_.split('_')[1]] });
  place(-1, 0, 'apple_1', 'autumn');   // W + E exits
  place(1, 0, 'wool_2', 'moor');       // W + E
  place(2, -1, 'spice_1', 'jungle');   // W + SE
  place(0, 2, 'fish_1', 'meadow');     // NW + E, water to the west
  place(-2, -1, 'apple_0', 'autumn'); place(2, 1, 'wool_0', 'moor'); place(3, -1, 'spice_0', 'jungle');

  const ring = (q, r, b) => { for (const [dq, dr] of [[0, 0], ...DIRS]) { const h = H(q + dq, r + dr); if (h && !h.ref && h.biome === 'meadow') h.biome = b; } };
  ring(-1, 0, 'autumn'); ring(-2, -1, 'autumn'); ring(1, 0, 'moor'); ring(2, 1, 'moor'); ring(2, -1, 'jungle'); ring(3, -1, 'jungle');
  for (const [q, r] of [[0, 0], [0, 1], [1, 1], [1, 2]]) H(q, r).biome = 'meadow';

  // water: a bay south-west of the fishing village
  for (const h of hexes.values()) if (!h.ref && (h.r >= 3 && h.q <= -1 || h.r === 2 && h.q <= -2)) h.water = 1;
  Object.assign(H(-1, 2), { water: 1 }); Object.assign(H(0, 3), { water: 0.8 }); Object.assign(H(-2, 1), { water: 0.55 });
  Object.assign(H(-1, 1), { water: 0.45 }); Object.assign(H(1, 3), { water: 0.4 }); Object.assign(H(0, 2), { water: 0.47 });

  // trade routes, as hex chains (ends sit on the map edge or in a town)
  const routes = [
    [[-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0]],        // orchard -> moor farm -> east
    [[2, -1], [1, -1], [0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],         // spice garden -> fishing village -> east
  ];
  for (const route of routes) for (let i = 0; i < route.length; i++) {
    const h = H(...route[i]);
    if (h.ref) continue;                                                // towns: the painted road
    if (i > 0) h.roads.add(dirBetween(route[i], route[i - 1]));
    if (i < route.length - 1) h.roads.add(dirBetween(route[i], route[i + 1]));
    else h.roads.add(route[i][0] < 0 ? 3 : 0);                          // run off the map edge
    if (i === 0) h.roads.add(route[i][0] < 0 ? 3 : 0);
  }
  // slide filler road ends onto the towns' painted exits (same point seen from both sides)
  for (const h of hexes.values()) for (const p of (h.ref && ref.manifest.tiles[h.ref].ports) || []) {
    const n = H(h.q + DIRS[p.edge][0], h.r + DIRS[p.edge][1]);
    if (n && !n.ref) { n.roads.add((p.edge + 3) % 6); n.roadOff[(p.edge + 3) % 6] = -p.off; }
  }

  // ---- terrain data ----
  let q0 = 1e9, q1 = -1e9, r0 = 1e9, r1 = -1e9;
  for (const h of hexes.values()) { q0 = Math.min(q0, h.q); q1 = Math.max(q1, h.q); r0 = Math.min(r0, h.r); r1 = Math.max(r1, h.r); }
  const map = new HexMap(q0, r0, q1 - q0 + 1, r1 - r0 + 1);
  let n = 0;
  for (const h of hexes.values()) map.set(h.q, h.r, { biome: h.biome, water: h.water, roads: [...h.roads], seed: 11 + n++ * 37, roadOff: h.roadOff });
  const chunk = new TerrainChunk(map);
  chunk.mesh.position.set(ox, oy, 0);
  scene.add(chunk.mesh);

  // ---- sprites ----
  const layer = new SpriteLayer(atlas, tex, 1024);               // code-drawn bits (rocks in the bay)
  layer.mesh.position.set(ox, oy, 0);
  layer.mesh.renderOrder = 1;
  scene.add(layer.mesh);
  // reference tiles: ground under all sprites, overhang over them
  const refGround = new SpriteLayer(ref.atlas, ref.tex, 64), refOver = new SpriteLayer(ref.atlas, ref.tex, 64);
  refGround.mesh.renderOrder = 0.5; refOver.mesh.renderOrder = 2;
  for (const l of [refGround, refOver]) { l.mesh.position.set(ox, oy, 0); scene.add(l.mesh); }
  for (const h of hexes.values()) {
    if (!h.ref) continue;
    const [cx, cy] = hexToWorld(h.q, h.r);
    refGround.add(h.ref + '_m', cx, cy, { clip: [1, 0] });
    refOver.add(h.ref + '_m', cx, cy, { clip: [2, 0], z: -1e5 });
  }
  refGround.commit(); refOver.commit();
  // props cut from the reference tiles share one y-sorted layer with the wagons
  const refProps = new SpriteLayer(ref.atlas, ref.tex, 2048);
  refProps.mesh.renderOrder = 1; refProps.mesh.position.set(ox, oy, 0); scene.add(refProps.mesh);

  for (const h of hexes.values()) {
    if (h.ref) continue;
    const [cx, cy] = hexToWorld(h.q, h.r);
    const water = { own: h.water };
    DIR_NAMES.forEach((nm, i) => { water[nm] = map.water(h.q + DIRS[i][0], h.r + DIRS[i][1]); });
    const tile = { water, roads: [...h.roads].map((i) => DIR_NAMES[i]), roadOff: h.roadOff, sprites: [] };
    if (h.water > 0.3) {
      const r = rng(h.q * 131 + h.r * 71 + 5);
      for (let k = 0; k < 6; k++) {
        const x = (r() * 2 - 1) * 200, y = (r() * 2 - 1) * 220;
        if (waterAt(tile, x, y) > 0.62) tile.sprites.push([`waterRock${k % 3}`, x, y]);
        if (tile.sprites.length >= 2) break;
      }
      for (const s of composeTile(tile)) layer.add(s.name, cx + s.x, cy - s.y);
    }
    // review loop 3: filler covered ~0.25 of a hex vs 0.6+ on the wild reference tiles
    const density = h.roads.size ? 1.15 : 1.5;
    if (h.water < 0.95) for (const s of dressFiller(ref.props, h.biome, tile, 100 + h.q * 13 + h.r * 29, { density })) refProps.add(s.name, cx + s.x, cy - s.y);
  }
  layer.commit();
  const staticCount = refProps.items.length;

  // ---- caravans: polylines along the drawn roads ----
  const bez = (A, B, C, k) => { const t = k / 16, u = 1 - t; return [u * u * A[0] + 2 * u * t * B[0] + t * t * C[0], u * u * A[1] + 2 * u * t * B[1] + t * t * C[1]]; };
  const paths = routes.map((route) => {
    const pts = [];
    for (let i = 0; i < route.length; i++) {
      const h = H(...route[i]);
      const [cx, cy] = hexToWorld(h.q, h.r);
      const edgeOut = route[i][0] < 0 ? 3 : 0;
      const into = i > 0 ? dirBetween(route[i], route[i - 1]) : edgeOut;
      const out = i < route.length - 1 ? dirBetween(route[i], route[i + 1]) : edgeOut;
      let local;
      if (h.ref) {
        const t = ref.manifest.tiles[h.ref];
        local = t.road.slice();
        if (i === 0) { if (t.ports[0].edge === out) local.reverse(); local = local.slice(Math.floor(local.length / 2)); } // starts in town
        else if (t.ports[0].edge !== into) local.reverse();
      } else {
        const A = edgePort(into, h.roadOff[into] ?? 0), C = edgePort(out, h.roadOff[out] ?? 0);
        const B = Math.abs(into - out) === 3 ? [(A[0] + C[0]) / 2, (A[1] + C[1]) / 2] : [0, 0];
        local = Array.from({ length: 17 }, (_, k) => bez(A, B, C, k));
      }
      local.forEach(([x, y], k) => pts.push({ x: cx + x, y: cy - y, edge: k === 0 }));
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, cum, total: cum[cum.length - 1], edges: pts.map((p, i) => (p.edge ? cum[i] : null)).filter((v) => v !== null) };
  });
  const sample = (P, d) => {
    let lo = 0, hi = P.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.cum[m] < d) lo = m; else hi = m; }
    const t = (d - P.cum[lo]) / Math.max(1e-6, P.cum[hi] - P.cum[lo]);
    return [P.pts[lo].x + (P.pts[hi].x - P.pts[lo].x) * t, P.pts[lo].y + (P.pts[hi].y - P.pts[lo].y) * t];
  };
  // reference wagons at map scale (the reference map draws carts ~0.3 of a hex)
  const wagons = [['apple', 0], ['wool', 0], ['apple', 0], ['spice', 1], ['fish', 1], ['spice', 1]].map(([g, ri], i) => {
    const P = paths[ri];
    return { name: `${g}_wagon`, P, d: (P.total * ((i % 3) + 0.5)) / 3, dir: i % 2 ? -1 : 1, speed: 110 + (i % 3) * 16, phase: i * 1.7 };
  });

  return {
    chunk, layer, refGround, refOver, refProps,
    bounds: (() => {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const h of hexes.values()) { const [x, y] = hexToWorld(h.q, h.r); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { x: ox + (x0 + x1) / 2, y: oy + (y0 + y1) / 2 + HEX_R * 0.15, w: x1 - x0 + HEX_R * 2, h: y1 - y0 + HEX_R * 2.5 };
    })(),
    update(t, dt) {
      refProps.items.length = staticCount;
      for (const w of wagons) {
        const P = w.P;
        w.d += w.dir * w.speed * dt;
        if (w.d > P.total - 40) { w.d = P.total - 40; w.dir = -1; }
        if (w.d < 40) { w.d = 40; w.dir = 1; }
        const [x, y] = sample(P, w.d), [x2] = sample(P, w.d + w.dir * 4);
        // extra hop when rolling over a hex edge / junction
        const near = Math.min(...P.edges.map((e) => Math.abs(e - w.d)));
        const bounce = 0.35 + 0.9 * Math.exp(-near / 26);
        refProps.add(w.name, x, y + 6, { scale: 0.3, flip: x2 < x, bounce, phase: w.phase });
      }
      refProps.dirty = true;
      chunk.update(t);
      refProps.update(t);
      refOver.update(t);
    },
  };
}

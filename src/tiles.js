// Hex tile compositions: 4 goods families x 3 growth stages (wild, village, town),
// matching the reference sheets. Coordinates are tile-local design px, y down,
// origin at the hex centre. Explicit placements carry the composition; a seeded
// scatter fills borders with biome flora while respecting water, roads and yards.
import { HEX_A, HEX_R, edgeMid, edgePort, insideHex, dirIndex, DIR_NAMES } from './engine/hex.js';
import { rng } from './art/ink.js';

// iso offset helper (matches the sprite projection) for laying out pens and fences
const iso = (x, y) => [(x - y) * 0.866, (x + y) * 0.5];

function pen(cx, cy, W = 130, H = 100, sheep = 4, gateFront = false) {
  const out = [];
  const add = (n, [dx, dy]) => out.push([n, cx + dx, cy + dy]);
  add(`wall${W}x`, iso(0, -H / 2));
  add(`wall${H}y`, iso(-W / 2, 0));
  add(`wall${W}x`, iso(0, H / 2));
  add(gateFront ? `fence${H}y` : `wall${H}y`, iso(W / 2, 0));
  const spots = [[-30, -20], [25, -28], [-12, 22], [34, 18]];
  for (let i = 0; i < sheep; i++) { const [dx, dy] = iso(...spots[i]); out.push([`sheep${i % 4}`, cx + dx, cy + dy]); }
  return out;
}

export const FAMILIES = [
  { key: 'fish', title: 'Fishing village', good: 'Fish', biome: 'meadow' },
  { key: 'apple', title: 'Orchard', good: 'Apples', biome: 'autumn' },
  { key: 'wool', title: 'Moorland farm', good: 'Wool', biome: 'moor' },
  { key: 'spice', title: 'Spice garden', good: 'Spice', biome: 'jungle' },
];

const COAST = { own: 0.47, W: 1, SW: 1, NW: 0.75, SE: 0.55, E: 0, NE: 0 };

export const TILES = {
  fish: [
    {
      water: COAST, roads: [],
      sprites: [
        ['rockCluster0', -120, -95], ['rock1', -60, -120], ['rock2', -150, -40],
        ['waterRock0', -170, 40], ['waterRock1', -105, 140], ['waterRock2', -30, 205], ['waterRock1', 30, 170],
        ['rock2', 70, -10], ['rock3', 130, 70], ['rock1', 175, 120], ['rock2', 40, 60],
        ['tree0', -20, -190], ['pine0', 40, -175], ['tree2', 120, -150], ['pine1', 190, -90], ['tree1', 175, -30], ['pine2', 90, -100],
        ['shrub1', 205, 40], ['shrub3', 150, -60],
      ],
      scatter: { names: ['shrub0', 'shrub2', 'flowerShrub0', 'shrub3', 'fern0', 'flowerShrub1'], n: 12, seed: 3 },
    },
    {
      water: COAST, roads: ['NE', 'SE'],
      sprites: [
        ['dock', -175, 25],
        ['fishRack', -60, -40], ['houseRedSmoke', 30, -85], ['stallRed', 105, 30],
        ['cratefish', -20, 25], ['cratefish', 5, 10], ['barrel', -40, -5], ['barrelSmall', 55, -20], ['crateEmpty', 30, 40],
        ['fence40x', 75, -45],
        ['waterRock0', -150, 160], ['waterRock2', -80, 210], ['rockCluster1', 120, 175],
        ['tree0', -40, -200], ['tree2', 60, -205], ['pine1', 0, -215], ['tree1', 205, -60], ['tree3', 180, 70],
      ],
      scatter: { names: ['shrub0', 'shrub2', 'tree3', 'shrub1', 'flowerShrub0', 'fern1'], n: 10, seed: 11 },
    },
    {
      water: COAST, roads: ['NE', 'SE'],
      sprites: [
        ['dock', -175, 25],
        ['fishRack', -95, -55], ['fishRackM', 15, 75],
        ['houseRed', -15, -95], ['houseRedSmokeM', 140, -35], ['lighthouse', 75, -170],
        ['stallRed', 150, 75], ['stallRedM', 55, -5],
        ['cratefish', -55, 5], ['cratefish', -30, 20], ['barrel', -70, -10], ['barrelSmall', 0, 30], ['cratefishM', 95, 30],
        ['waterRock0', -150, 160], ['waterRock2', -80, 210], ['rockCluster1', 150, 170],
        ['tree0', -60, -200], ['pine0', 10, -205], ['tree2', 195, -95], ['rock0', 135, -150],
      ],
      scatter: { names: ['shrub0', 'shrub2', 'shrub1', 'flowerShrub1'], n: 7, seed: 17 },
    },
  ],
  apple: [
    {
      water: null, roads: [],
      sprites: [
        ['autumnTree0', -120, -110], ['autumnTree1', 110, -130], ['autumnTree0', -110, 90], ['autumnTree2', 30, 175],
        ['wall130x', 20, -10], ['berryShrub0', -10, -60], ['berryShrub1', 25, -45], ['berryShrub0', 60, -28], ['berryShrub1', 95, -10],
        ['rockCluster1', -190, -40], ['rock1', 150, 80], ['rock2', -40, 210], ['rock2', 170, 20],
      ],
      scatter: { names: ['autumnShrub0', 'autumnShrub1', 'autumnShrub2', 'autumnShrub3'], n: 24, seed: 5 },
    },
    {
      water: null, roads: ['W', 'SE'], plaza: { x: 20, y: -40, r: 105, type: 'yard' },
      sprites: [
        ['barn', -40, -48], ['houseRedSmall', 100, -105],
        ['crateapple', 30, 20], ['crateapple', 55, 5], ['crateappleM', 70, 35], ['crateapple', -95, 40], ['barrel', 75, -55],
        ['fence60x', -110, 15], ['fence40y', 120, 40], ['fence40x', 50, 75],
        ['autumnTree0', -130, -130], ['autumnTree1', -10, -185], ['poplar0', 110, -185], ['poplar1', 155, -150],
        ['rock1', 120, -5], ['rock2', -60, 175],
      ],
      scatter: { names: ['autumnShrub0', 'autumnShrub1', 'autumnShrub2', 'autumnShrub3'], n: 16, seed: 6 },
    },
    {
      water: null, roads: ['W', 'SE'], plaza: { x: 10, y: -30, r: 135, type: 'yard' },
      sprites: [
        ['barn', -55, -12], ['houseRed', 5, -160], ['houseRedSmallM', 120, -80], ['houseRedSmoke', 125, 40],
        ['crateapple', 25, 45], ['crateapple', 45, 30], ['crateappleM', -10, 70], ['crateapple', -130, 50], ['barrel', 60, -30],
        ['fence60x', -120, 35], ['fence40y', 175, 95], ['fence40x', 50, 100],
        ['autumnTree0', 50, 150], ['autumnTree1', -150, -110], ['poplar0', -90, -170], ['poplar1', -50, -195], ['autumnTree2', 195, -60],
        ['rock1', -60, 170],
      ],
      scatter: { names: ['autumnShrub0', 'autumnShrub1', 'autumnShrub2', 'autumnShrub3'], n: 12, seed: 7 },
    },
  ],
  wool: [
    {
      water: null, roads: [],
      sprites: [
        ['mountain0', -60, -95], ['rockCluster1', 110, 60], ['rock3', -110, 160],
        ['tree0', -150, -60], ['tree1', 40, -60], ['tree3', -60, 130], ['shrub0', 120, -140], ['shrub1', 180, 0],
      ],
      scatter: { names: ['heather0', 'heather1', 'heather2', 'heather3', 'heather0', 'heather2'], n: 30, seed: 8, minDist: 26 },
    },
    {
      water: null, roads: ['W', 'SE'], plaza: { x: -10, y: -30, r: 115, type: 'yard' },
      sprites: [
        ...pen(-45, -5, 130, 100, 3, true),
        ['houseSlateSmall', 110, -60],
        ['fence60y', 140, 10], ['fence40x', 95, 55],
        ['tree0', -150, -130], ['tree2', 30, -180], ['pine0', 155, -150], ['tree1', -60, -200], ['rock1', 120, -170],
        ['rock3', -130, 160], ['shrub1', 180, 70],
      ],
      scatter: { names: ['heather0', 'heather1', 'heather2', 'heather3'], n: 24, seed: 9, minDist: 22 },
    },
    {
      water: null, roads: ['W', 'SE'], plaza: { x: 0, y: -30, r: 140, type: 'yard' },
      sprites: [
        ...pen(-75, 5, 130, 100, 4, true),
        ['shedSlate', 60, 0], ['houseSlate', -60, -150], ['houseSlateSmallM', 70, -140], ['houseSlateSmall', 160, -20],
        ['fence40y', 175, 60], ['fence60x', 70, 65], ['crateEmpty', 120, 50],
        ['pine0', -170, -90], ['tree0', 10, -200], ['tree2', -130, 150], ['pine1', 190, -120],
      ],
      scatter: { names: ['heather0', 'heather1', 'heather2', 'heather3'], n: 14, seed: 10, minDist: 22 },
    },
  ],
  spice: [
    {
      water: null, roads: [], plaza: { x: -40, y: 0, r: 150, type: 'earth' },
      sprites: [
        ['chiliVine0', -110, -60], ['chiliVine1', -20, -100], ['chiliVine2', -60, 30], ['chiliVine0', 30, -10],
        ['palm0', 100, -150], ['banana0', -170, 120], ['banana1', 60, 170], ['flowerBush0', 120, -10],
        ['rock0', 150, 80], ['rock1', -180, -60], ['rock2', -40, 200],
        ['jungleShrub0', -60, -200], ['jungleShrub2', -150, -150], ['banana1', 170, -60],
      ],
      scatter: { names: ['jungleShrub0', 'jungleShrub1', 'jungleShrub2', 'fern0', 'fern1'], n: 12, seed: 12 },
    },
    {
      water: null, roads: ['W', 'SE'], plaza: { x: 10, y: -30, r: 110, type: 'yard' },
      sprites: [
        ['houseRedSmall', -105, -40], ['shedRed', 50, -40],
        ['crateEmpty', -20, 30], ['cratechili', 5, 45], ['barrel', 70, 40], ['barrelSmall', -60, 30], ['chiliBasket', 35, 50],
        ['chiliVine0', -10, -150], ['chiliVine1', 45, -170], ['chiliVine2', 100, -150], ['palm0', 140, -170],
        ['jungleShrub2', -110, -160], ['banana0', -170, -60], ['banana1', 150, 20], ['rock1', 130, 60],
      ],
      scatter: { names: ['jungleShrub0', 'jungleShrub1', 'jungleShrub2', 'fern0', 'fern1'], n: 12, seed: 13 },
    },
    {
      water: null, roads: ['W', 'SE'], plaza: { x: 10, y: -20, r: 140, type: 'yard' },
      sprites: [
        ['houseRedSmall', -110, -30], ['houseRed', -40, -165], ['shedRed', 40, -40], ['houseRedSmokeM', 140, -80], ['awning', 120, 30],
        ['cratechili', -30, 40], ['cratechili', -5, 55], ['barrel', 60, 50], ['barrelSmall', -60, 40], ['chiliBasket', 20, 60], ['fence40x', -70, 75],
        ['chiliVine0', 30, -175], ['chiliVine1', 80, -165], ['palm0', 150, -175],
        ['jungleShrub2', -150, -130], ['banana0', -180, 30], ['rock1', 160, 110],
      ],
      scatter: { names: ['jungleShrub0', 'jungleShrub1', 'fern0', 'fern1'], n: 10, seed: 14 },
    },
  ],
};

// ---- CPU mirrors of the shader fields, used to keep scatter off water / roads / yards ----
export function waterAt(tile, x, y) {
  if (!tile.water) return 0;
  let ws = 0, wt = 0;
  const pts = [[0, 0, tile.water.own ?? 0]];
  DIR_NAMES.forEach((n, i) => { const [mx, my] = edgeMid(i, 2); pts.push([mx, my, tile.water[n] ?? 0]); });
  for (const [cx, cy, w] of pts) {
    const d = Math.hypot(x - cx, y - cy) / (HEX_R * 1.6);
    let k = Math.max(0, 1 - d * d); k *= k; ws += k * w; wt += k;
  }
  return ws / wt;
}

const lerpMid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

export function roadDist(tile, x, y) {
  const rs = tile.roads.map(dirIndex);
  if (!rs.length) return 1e9;
  let best = 1e9;
  const P = (i) => edgePort(i, tile.roadOff?.[i] ?? 0);
  const segs = rs.length === 2 ? (Math.abs(rs[0] - rs[1]) !== 3 ? [[P(rs[0]), [0, 0], P(rs[1])]] : [[P(rs[0]), lerpMid(P(rs[0]), P(rs[1])), P(rs[1])]])
    : rs.map((i) => [[0, 0], [0, 0], P(i)]);
  for (const [a, b, c] of segs) for (let t = 0; t <= 1.0001; t += 0.025) {
    const u = 1 - t, px = u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], py = u * u * a[1] + 2 * u * t * b[1] + t * t * c[1];
    best = Math.min(best, Math.hypot(x - px, y - py));
  }
  return best;
}

export function plazaDist(tile, x, y) {
  const p = tile.plaza; if (!p) return 1e9;
  return Math.hypot(x - p.x, (y - p.y) * 1.25) - p.r;
}

// Final sprite list for a tile: explicit placements + seeded border scatter.
export function composeTile(tile) {
  const out = tile.sprites.map(([n, x, y]) => ({ name: n, x, y }));
  const sc = tile.scatter;
  if (sc) {
    const r = rng(sc.seed * 7919);
    const minD = sc.minDist ?? 30;
    let tries = 0, placed = 0;
    while (placed < sc.n && tries++ < 4000) {
      const x = (r() * 2 - 1) * HEX_A, y = (r() * 2 - 1) * HEX_R;
      if (!insideHex(x, y, 16)) continue;
      if (waterAt(tile, x, y) > 0.4) continue;
      if (roadDist(tile, x, y) < 38) continue;
      if (plazaDist(tile, x, y) < 12) continue;
      if (tile.plaza?.type === 'earth' && plazaDist(tile, x, y) < 20) continue;
      if (out.some((o) => Math.hypot(o.x - x, (o.y - y) * 1.4) < (o.name.startsWith('house') || o.name.startsWith('barn') || o.name.startsWith('shed') || o.name.startsWith('mountain') ? 92 : minD))) continue;
      out.push({ name: sc.names[placed % sc.names.length], x, y });
      placed++;
    }
  }
  return out;
}

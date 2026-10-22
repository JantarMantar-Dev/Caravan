// Filler hexes dressed with props cut from the reference tiles (tools/props.py):
// trees, bushes, rocks and heather keep the reference's own ink and shading,
// so code-built land reads as the same hand as the town tiles next to it.
// Placement is a seeded dart throw inside the hex that keeps clear of water,
// roads and town yards (CPU mirrors of the terrain shader fields).
import { insideHex } from './engine/hex.js';
import { waterAt, roadDist, plazaDist } from './tiles.js';
import { rng } from './art/ink.js';

// biome -> prop pools. Jungle has few clean cut-outs (its palms cross the tile
// edges), so it borrows the meadow greenery.
const POOLS = { meadow: ['meadow'], autumn: ['autumn'], moor: ['moor'], jungle: ['jungle', 'meadow'] };

let byBiome = null;
function pools(props) {
  if (byBiome) return byBiome;
  byBiome = {};
  for (const [name, p] of Object.entries(props)) (byBiome[p.biome] ??= []).push({ name, ...p });
  return byBiome;
}

// tile: { water, roads, plaza } as in tiles.js. Returns [{ name, x, y }] in
// hex-local design units (y down), like composeTile.
export function dressFiller(props, biome, tile, seed, { density = 1 } = {}) {
  const all = POOLS[biome].flatMap((b) => pools(props)[b] ?? []);
  if (!all.length) return [];
  const r = rng(seed * 7919 + 13);
  const out = [];
  const big = all.filter((p) => p.area > 4000), small = all.filter((p) => p.area <= 4000);
  // the reference wild tiles carry 15-25 props each, clumped; filler stays a
  // little lighter so towns keep the focus
  const target = Math.round((biome === 'moor' ? 24 : 16) * density);
  let tries = 0;
  while (out.length < target && tries++ < 3000) {
    const pick = (r() < 0.5 && big.length ? big : small.length ? small : big);
    const p = pick[Math.floor(r() * pick.length)];
    const rad = Math.max(14, p.w * 0.4);
    const x = (r() * 2 - 1) * 245, y = (r() * 2 - 1) * 283;
    if (!insideHex(x, y, rad * 0.6 + 6)) continue;
    // the canopy rises above the anchor: keep its top inside the hex too
    if (!insideHex(x, y - p.ay * 0.7, rad * 0.5)) continue;
    if (waterAt(tile, x, y) > 0.38) continue;
    if (roadDist(tile, x, y) < 34 + rad * 0.7) continue;
    if (plazaDist(tile, x, y) < rad) continue;
    if (out.some((o) => Math.hypot(o.x - x, (o.y - y) * 1.5) < (o.rad + rad) * 0.7)) continue;
    out.push({ name: p.name, x, y, rad });
  }
  return out;
}

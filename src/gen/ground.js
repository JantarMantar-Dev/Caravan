// Ground planes as vectors: sand (all land), grass and road, traced from the
// reference by tools/scene.py and dressed with scattered detail (sand grains,
// pebbles, grass patches and tufts). The water is not drawn here: it is a
// shader (src/lab/water.js) under the grass and over the sand, so waves can
// run up the beach.
import { INK, rng, f, P, ellipse, circle, line, smooth, inPoly, id, mix } from './util.js';

export const GROUND = {
  sand: '#f3dba0', sandDot: '#dcbd80', sandLight: '#fbecc4',
  grass: '#93c52c', grassLight: '#b2d843', grassDark: '#6f9f1f', grassEdge: '#3f6216',
  road: '#f6e3ad', roadEdge: '#8b6a3a', roadDot: '#dfc58f',
};

// where feet wear the sand: the door, the rack, the land end of the dock
const WEAR = [[278, 314, 13], [120, 294, 12], [188, 250, 10], [172, 320, 16]];

const ringsPath = (rings) => rings.map((r) => smooth(r, true, 0.9)).join('');

function bounds(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

function scatter(R, rings, density, fn) {
  const [x0, y0, x1, y1] = bounds(rings);
  const n = Math.round((x1 - x0) * (y1 - y0) * density);
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = R.range(x0, x1), y = R.range(y0, y1);
    if (inPoly(rings, x, y)) s += fn(x, y);
  }
  return s;
}

// a soft irregular blob
function blob(R, x, y, r) {
  const k = 7, pts = [];
  for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; const d = r * R.range(0.65, 1.1); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.55]); }
  return smooth(pts, true, 1);
}

export function sand({ rings, seed = 21, pal = GROUND }) {
  const R = rng(seed);
  const d = ringsPath(rings);
  const c = id('sd');
  let s = `<clipPath id="${c}"><path d="${d}" clip-rule="evenodd"/></clipPath>`;
  s += `<path d="${d}" fill="${pal.sand}" fill-rule="evenodd"/>`;
  s += `<g clip-path="url(#${c})">`;
  // a few broad lighter areas, sparse grains and pebbles; nothing that
  // turns to noise at game zoom
  s += scatter(R, rings, 1 / 3200, (x, y) => `<path d="${blob(R, x, y, R.range(14, 26))}" fill="${pal.sandLight}" opacity="0.8"/>`);
  // worn, compacted ground where people walk: the door, the rack, the dock
  for (const [x, y, r] of WEAR) if (inPoly(rings, x, y)) s += `<path d="${blob(R, x, y, r)}" fill="${pal.sandDot}" opacity="0.45"/>`;
  s += scatter(R, rings, 1 / 700, (x, y) => circle([x, y], R.range(0.5, 0.8), pal.sandDot));
  s += scatter(R, rings, 1 / 6000, (x, y) => ellipse([x, y], R.range(1.4, 2.2), R.range(0.9, 1.2), '#b9b0a4', `stroke="${INK}" stroke-width="0.5"`));
  s += '</g>';
  return s;
}

export function grass({ rings, seed = 22, pal = GROUND }) {
  const R = rng(seed);
  const d = ringsPath(rings);
  const c = id('gr');
  let s = `<clipPath id="${c}"><path d="${d}" clip-rule="evenodd"/></clipPath>`;
  s += `<path d="${d}" fill="${pal.grass}" fill-rule="evenodd"/>`;
  s += `<g clip-path="url(#${c})">`;
  // broad quiet turf: a handful of large connected lighter areas, flat
  s += scatter(R, rings, 1 / 9000, (x, y) => `<path d="${blob(R, x, y, R.range(28, 48))}" fill="${pal.grassLight}"/>`);
  s += scatter(R, rings, 1 / 14000, (x, y) => `<path d="${blob(R, x, y, R.range(16, 26))}" fill="${pal.grassDark}" opacity="0.35"/>`);
  // tufts in small clumps rather than an even sprinkle
  const tuft = (x, y) => {
    const h = R.range(2.4, 4), c = R() < 0.75 ? pal.grassDark : '#cbe668';
    return `<path d="M${f(x)},${f(y)}q${f(-0.6)},${f(-h * 0.5)} ${f(-1.8)},${f(-h)}M${f(x)},${f(y)}q${f(0.1)},${f(-h * 0.6)} ${f(0.3)},${f(-h * 1.2)}M${f(x)},${f(y)}q${f(0.8)},${f(-h * 0.4)} ${f(2)},${f(-h * 0.85)}" stroke="${c}" stroke-width="0.9" fill="none" stroke-linecap="round"/>`;
  };
  s += scatter(R, rings, 1 / 2600, (x, y) => {
    let t = '';
    for (let k = 0, n = 3 + Math.floor(R() * 4); k < n; k++) t += tuft(x + R.range(-7, 7), y + R.range(-3.5, 3.5));
    return t;
  });
  // flowers only in a few clumps
  s += scatter(R, rings, 1 / 22000, (x, y) => {
    const c = R.pick(['#ffffff', '#f6d94a', '#ffffff']);
    let t = '';
    for (let k = 0; k < 6; k++) t += circle([x + R.range(-6, 6), y + R.range(-3, 3)], 1, c, `stroke="#5c7a2a" stroke-width="0.3"`);
    return t;
  });
  s += '</g>';
  s += `<path d="${d}" fill="none" stroke="${pal.grassEdge}" stroke-width="1.3" stroke-linejoin="round"/>`;
  // grass spilling over its edge: blades every few px along the border
  let blades = '';
  for (const r of rings) {
    const n = r.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const a = r[i], b = r[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t < L; t += R.range(4, 9)) {
        const x = a[0] + ((b[0] - a[0]) * t) / L, y = a[1] + ((b[1] - a[1]) * t) / L;
        const nx = (sgn * (b[1] - a[1])) / L, ny = (sgn * -(b[0] - a[0])) / L;   // outward
        if (ny < -0.2 || R() < 0.35) continue;                                   // mostly on the lower edges
        const hgt = R.range(2, 3.6);
        blades += `M${f(x - nx)},${f(y - ny)}q${f(nx * 1.5 - 0.6)},${f(-hgt * 0.4)} ${f(nx * 2.4 - 1.2)},${f(-hgt)}M${f(x - nx)},${f(y - ny)}q${f(nx * 1.5 + 0.4)},${f(-hgt * 0.3)} ${f(nx * 2.2 + 1)},${f(-hgt * 0.8)}`;
      }
    }
  }
  s += `<path d="${blades}" stroke="${pal.grass}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
  s += `<path d="${blades}" stroke="${pal.grassDark}" stroke-width="0.6" fill="none" stroke-linecap="round" opacity="0.8"/>`;
  return s;
}

export function road({ rings, seed = 23, pal = GROUND }) {
  const R = rng(seed);
  const d = ringsPath(rings);
  const c = id('rd');
  let s = `<clipPath id="${c}"><path d="${d}" clip-rule="evenodd"/></clipPath>`;
  s += `<path d="${d}" fill="${pal.road}" fill-rule="evenodd"/>`;
  s += `<g clip-path="url(#${c})">`;
  s += scatter(R, rings, 1 / 500, (x, y) => circle([x, y], R.range(0.5, 0.8), pal.roadDot));
  s += scatter(R, rings, 1 / 5000, (x, y) => ellipse([x, y], R.range(1.2, 2), R.range(0.8, 1.1), '#c8bca9', `stroke="${INK}" stroke-width="0.45"`));
  s += '</g>';
  s += `<path d="${d}" fill="none" stroke="${pal.roadEdge}" stroke-width="0.9" stroke-linejoin="round" opacity="0.7"/>`;
  return s;
}

// the tile's ink frame, drawn over everything
export const frame = (hex) => `<path d="M${hex.map(P).join('L')}Z" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
export { line };

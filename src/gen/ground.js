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
  s += scatter(R, rings, 1 / 900, (x, y) => `<path d="${blob(R, x, y, R.range(6, 14))}" fill="${pal.sandLight}" opacity="0.7"/>`);
  s += scatter(R, rings, 1 / 70, (x, y) => circle([x, y], R.range(0.45, 0.85), pal.sandDot));
  s += scatter(R, rings, 1 / 2600, (x, y) => ellipse([x, y], R.range(1.4, 2.4), R.range(0.9, 1.3), mix('#b9b0a4', '#ffffff', R() * 0.3), `stroke="${INK}" stroke-width="0.5"`));
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
  // darker inner rim along the edge, then light patches
  s += `<path d="${d}" fill="none" stroke="${pal.grassDark}" stroke-width="4" opacity="0.45"/>`;
  s += scatter(R, rings, 1 / 1500, (x, y) => `<path d="${blob(R, x, y, R.range(8, 20))}" fill="${pal.grassLight}"/>`);
  s += scatter(R, rings, 1 / 2600, (x, y) => `<path d="${blob(R, x, y, R.range(6, 13))}" fill="${pal.grassDark}" opacity="0.55"/>`);
  // tufts: little V strokes, dark with a light blade beside
  s += scatter(R, rings, 1 / 160, (x, y) => {
    const h = R.range(2.2, 3.6);
    return `<path d="M${f(x - 1.6)},${f(y - h)}L${f(x)},${f(y)}L${f(x + 0.4)},${f(y - h * 1.2)}M${f(x)},${f(y)}L${f(x + 2)},${f(y - h * 0.8)}" stroke="${R() < 0.75 ? pal.grassDark : '#cbe668'}" stroke-width="0.85" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  s += '</g>';
  s += `<path d="${d}" fill="none" stroke="${pal.grassEdge}" stroke-width="1.3" stroke-linejoin="round"/>`;
  return s;
}

export function road({ rings, seed = 23, pal = GROUND }) {
  const R = rng(seed);
  const d = ringsPath(rings);
  const c = id('rd');
  let s = `<clipPath id="${c}"><path d="${d}" clip-rule="evenodd"/></clipPath>`;
  s += `<path d="${d}" fill="${pal.road}" fill-rule="evenodd"/>`;
  s += `<g clip-path="url(#${c})">`;
  s += `<path d="${d}" fill="none" stroke="${pal.roadDot}" stroke-width="5" opacity="0.6"/>`;
  s += scatter(R, rings, 1 / 90, (x, y) => circle([x, y], R.range(0.4, 0.8), pal.roadDot));
  s += scatter(R, rings, 1 / 1800, (x, y) => ellipse([x, y], R.range(1.2, 2), R.range(0.8, 1.1), '#c8bca9', `stroke="${INK}" stroke-width="0.45"`));
  s += '</g>';
  s += `<path d="${d}" fill="none" stroke="${pal.roadEdge}" stroke-width="1.1" stroke-linejoin="round"/>`;
  return s;
}

// the tile's ink frame, drawn over everything
export const frame = (hex) => `<path d="M${hex.map(P).join('L')}Z" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
export { line };

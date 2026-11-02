// The same scene drawn as pixel art: a low-resolution grid (one art pixel =
// P tile px), flat colours from a small palette, no ink lines. Each sprite
// gets a one-pixel outline in a darker shade of whatever it borders, the way
// hand-made pixel sprites are edged. The scene file (assets/scenes/<tile>.json)
// and the projection are shared with the vector generators, so both styles
// lay out identically and the lab can switch between them.
import { iso, inPoly } from '../gen/util.js';

export const P = 3;                       // tile px per art pixel

export const PAL = {
  grass: '#78bf40', grassDark: '#5fa834', grassLight: '#95d256', tuft: '#3f8a2e',
  sand: '#f0dcaa', sandDark: '#dcc28a', sandLight: '#f8ecc8',
  road: '#ecd59c', roadDark: '#d2b67a', roadLight: '#f6e6bb',
  pine: ['#15402e', '#1f5c38', '#2d7a42', '#4f9a4f'],
  leaf: ['#1b5229', '#2a7531', '#45993a', '#7cc64f', '#a8dd6a'],
  stone: ['#4d525e', '#767b86', '#a3a7af', '#d0d2d7'],
  crate: ['#6b4423', '#a26f3c', '#c99556', '#e6bd7c'],
  wood: ['#4a2e1d', '#6e4528', '#966139', '#bc8a52', '#d8aa6c'],
  roof: ['#7a2a20', '#b2432c', '#d45b37', '#ea7d4f'],
  wall: ['#f5efe0', '#ddd2b8', '#b3a585'],
  fish: ['#3d5878', '#8fa9c4', '#d8e4ee', '#ffffff'],
  trunk: ['#43291a', '#6a4327', '#8c5c34'],
  awning: ['#f1e9d6', '#cf5a3b'],
  pane: '#2b3a50', door: '#7a4826', net: '#ece4cc', netKnot: '#8a7a55', white: '#f8f6ec',
  // one shadow for everything, on any ground: a cool translucent dark
  shadow: [16, 28, 46, 78],
};

const hex2 = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const OUT = [26, 20, 32];

function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  return r;
}

// a pixel grid the size of the tile; all drawing calls take tile px
class Pix {
  constructor(w, h) {
    this.W = Math.ceil(w / P); this.H = Math.ceil(h / P);
    this.d = new Uint8ClampedArray(this.W * this.H * 4);
  }
  set(i, j, c) {
    if (c == null || i < 0 || j < 0 || i >= this.W || j >= this.H) return;
    const k = (j * this.W + i) * 4, v = typeof c === 'string' ? hex2(c) : c;
    this.d[k] = v[0]; this.d[k + 1] = v[1]; this.d[k + 2] = v[2]; this.d[k + 3] = v[3] ?? 255;
  }
  alpha(i, j) { return i < 0 || j < 0 || i >= this.W || j >= this.H ? 0 : this.d[(j * this.W + i) * 4 + 3]; }
  // every pixel whose centre lies in the polygon (tile px); fn(i, j) -> colour
  poly(pts, c) {
    const ys = pts.map((p) => p[1]);
    const j0 = Math.max(0, Math.floor(Math.min(...ys) / P)), j1 = Math.min(this.H - 1, Math.ceil(Math.max(...ys) / P));
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) * P, xs = [];
      for (let k = 0, n = pts.length; k < n; k++) {
        const a = pts[k], b = pts[(k + 1) % n];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let i = Math.ceil(xs[k] / P - 0.5); i + 0.5 <= xs[k + 1] / P; i++) this.set(i, j, typeof c === 'function' ? c(i, j) : c);
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let j = Math.floor((cy - ry) / P); j <= Math.ceil((cy + ry) / P); j++)
      for (let i = Math.floor((cx - rx) / P); i <= Math.ceil((cx + rx) / P); i++) {
        const x = (i + 0.5) * P, y = (j + 0.5) * P;
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(i, j, typeof c === 'function' ? c(i, j, (x - cx) / rx, (y - cy) / ry) : c);
      }
  }
  rect(x0, y0, x1, y1, c) { this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], c); }
  // a line one art pixel wide (Bresenham), tile px in
  line(a, b, c) {
    let x0 = Math.floor(a[0] / P), y0 = Math.floor(a[1] / P);
    const x1 = Math.floor(b[0] / P), y1 = Math.floor(b[1] / P);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  // edge every opaque shape with a darker shade of the pixel it borders
  outline() {
    const src = Uint8ClampedArray.from(this.d), W = this.W, H = this.H;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = (j * W + i) * 4;
      if (src[k + 3] === 255) continue;
      for (const [di, dj] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const I = i + di, J = j + dj;
        if (I < 0 || J < 0 || I >= W || J >= H) continue;
        const n = (J * W + I) * 4;
        if (src[n + 3] !== 255) continue;
        this.set(i, j, [src[n] * 0.25 + OUT[0] * 0.75, src[n + 1] * 0.25 + OUT[1] * 0.75, src[n + 2] * 0.25 + OUT[2] * 0.75, 255]);
        break;
      }
    }
  }
  // crop to the used pixels: a canvas and its box in tile px
  out() {
    let i0 = this.W, j0 = this.H, i1 = -1, j1 = -1;
    for (let j = 0; j < this.H; j++) for (let i = 0; i < this.W; i++) if (this.d[(j * this.W + i) * 4 + 3]) { i0 = Math.min(i0, i); j0 = Math.min(j0, j); i1 = Math.max(i1, i); j1 = Math.max(j1, j); }
    if (i1 < 0) { i0 = j0 = 0; i1 = j1 = 0; }
    const w = i1 - i0 + 1, h = j1 - j0 + 1;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const img = new ImageData(w, h);
    for (let j = 0; j < h; j++) img.data.set(this.d.subarray(((j + j0) * this.W + i0) * 4, ((j + j0) * this.W + i0 + w) * 4), j * w * 4);
    cv.getContext('2d').putImageData(img, 0, 0);
    return { canvas: cv, box: [i0 * P, j0 * P, w * P, h * P] };
  }
}

// ------------------------------------------------------------- sprites
// a leafy crown in clusters, the usual pixel-art way: each cluster has a
// lit cap on its upper left, a dark underside, mid green between; clusters
// on the shaded right sit one tone darker. Small rim lobes break the outline
// into leafy bumps. The topmost cluster at a pixel wins.
const LOBES = {
  broad: [[0, -0.55, 0.42], [-0.42, -0.2, 0.4], [0.42, -0.24, 0.4], [-0.5, 0.25, 0.36], [0.48, 0.22, 0.36], [0, 0.1, 0.42], [0, 0.42, 0.34],
    [-0.8, 0.05, 0.16], [0.82, 0.0, 0.16], [-0.3, -0.78, 0.16], [0.36, -0.7, 0.16]],
  spread: [[-0.25, -0.45, 0.4], [0.35, -0.4, 0.38], [-0.68, 0.0, 0.36], [0.66, -0.02, 0.36], [0, -0.05, 0.42], [-0.32, 0.32, 0.36], [0.36, 0.3, 0.36],
    [-0.98, 0.15, 0.15], [0.98, 0.12, 0.14], [0.0, -0.72, 0.16]],
  sapling: [[0, -0.42, 0.44], [-0.36, 0.05, 0.4], [0.38, 0.04, 0.4], [0, 0.28, 0.38], [-0.62, -0.18, 0.14], [0.6, -0.2, 0.14]],
  bush: [[-0.45, 0, 0.46], [0.45, -0.02, 0.46], [0, -0.32, 0.48], [0, 0.12, 0.46]],
};
function crown(px, cx, cy, r, form, flip, pal = PAL.leaf) {
  // rim lobes smaller than a pixel and a half only make single-pixel spikes
  const L = LOBES[form].map(([u, v, q]) => [cx + (flip ? -u : u) * r, cy + v * r, q * r]).filter((l) => l[2] >= P * 1.6);
  const tone = (i, j) => {
    const x = (i + 0.5) * P, y = (j + 0.5) * P;
    for (let k = L.length - 1; k >= 0; k--) {
      const [lx, ly, q] = L[k];
      const nx = (x - lx) / q, ny = (y - ly) / q;
      if (nx * nx + ny * ny > 1) continue;
      let t = ny > 0.5 ? 0 : (ny < -0.35 && nx < 0.35) ? 2 : 1;      // underside, cap, body
      if (ny < -0.62 && nx < -0.05 && nx > -0.6) t = 3;               // brightest leaves
      if (lx > cx + r * 0.25 && t > 0) t -= 1;                       // the shaded side
      if (ly < cy - r * 0.3 && t < 3 && ny < 0.2) t += 1;              // the top catches more sun
      // leaf texture: stray lit leaves in the body, dark gaps under the caps
      const n = h01(i, j, 11 + k);
      if (t >= 1 && t < 3 && n < 0.16 && ny < 0.3) t += 1;
      else if (t >= 1 && n > 0.9) t -= 1;
      if (t === 3 && ny < -0.75 && nx < -0.2 && n < 0.5) t = 4;
      return pal[t];
    }
    return null;
  };
  for (const [lx, ly, q] of L) px.ellipse(lx, ly, q, q, (i, j) => tone(i, j));
}
// a trunk lit on the left, flaring into roots at the foot
function trunk(px, x, y, top, w) {
  const c = (i) => { const xx = (i + 0.5) * P; return xx < x - w * 0.2 ? PAL.trunk[2] : xx < x + w * 0.15 ? PAL.trunk[1] : PAL.trunk[0]; };
  px.rect(x - w / 2, top, x + w / 2, y, c);
  px.poly([[x - w / 2, y - P * 1.5], [x + w / 2, y - P * 1.5], [x + w / 2 + P * 1.2, y], [x - w / 2 - P * 1.2, y]], c);
}
function groundShadow(px, x, y, rx, ry) { px.ellipse(x, y, rx, ry, (i, j) => (px.alpha(i, j) === 255 ? null : PAL.shadow)); }

function tree(px, { x, y, r = 30, form = 'broad', flip = false }) {
  const h = r * ({ broad: 1.15, spread: 1.0, sapling: 1.2 }[form] ?? 1.15);
  const cx = x + (form === 'broad' ? 0 : r * 0.1 * (flip ? -1 : 1)), cy = y - h;
  trunk(px, x, y, cy, Math.max(P * 1.6, r * 0.28));
  crown(px, cx, cy, r, LOBES[form] ? form : 'broad', flip);
  px.outline();
  groundShadow(px, x + r * 0.3, y + 1, r * 0.85, r * 0.25);
}
function bush(px, { x, y, r = 12 }) {
  crown(px, x, y - r * 0.5, r, 'bush', false);
  px.outline();
  groundShadow(px, x + r * 0.2, y + 1, r * 1.0, r * 0.3);
}
// fir: a saw-tooth of tiers widening downwards, lit on the left
function pine(px, { x, y, w = 50, h = 84, tiers = 4, seed = 1 }) {
  const R = rng(seed);
  tiers = Math.max(3, tiers + 1);
  const top = y - h, base = y - h * 0.14;
  trunk(px, x, y, base - P, Math.max(P * 1.5, w * 0.12));
  const widths = Array.from({ length: tiers }, (_, k) => ((k + 1) / tiers) * R.range(0.85, 1.1));
  const pal = PAL.pine;
  for (let j = Math.floor(top / P); j <= Math.ceil(base / P); j++) {
    const yc = (j + 0.5) * P, t = (yc - top) / (base - top);
    if (t < 0 || t > 1) continue;
    const k = Math.min(tiers - 1, Math.floor(t * tiers)), u = t * tiers - k;
    const hw = (w / 2) * (0.18 + 0.82 * widths[k]) * (0.45 + 0.55 * u) * Math.min(1, t * 6 + 0.2);
    for (let i = Math.floor((x - hw) / P); (i + 0.5) * P <= x + hw; i++) {
      const dx = ((i + 0.5) * P - x) / Math.max(hw, 1);
      let t = u > 0.82 && dx > -0.6 ? 0 : dx < -0.45 && u < 0.75 ? 3 : dx < 0.05 ? 2 : dx < 0.55 ? 1 : 0;
      // needles: short lit strokes and dark gaps scattered through each tier
      const n = h01(i, j, 21);
      if (t > 0 && t < 3 && n < 0.14) t += 1; else if (t > 0 && n > 0.88) t -= 1;
      px.set(i, j, pal[t]);
    }
  }
  px.outline();
  groundShadow(px, x + w * 0.2, y + 1, w * 0.45, w * 0.13);
}

// rocks: low-poly chunks. An irregular outer ring, a smaller top plane
// pushed up-left inside it, and the band between cut into facets, each lit
// by how its edge faces the upper-left light.
function boulder(R, px, x, y, bw, bh, wet) {
  const k = 6 + Math.floor(R() * 2), cy = y - bh * 0.5, a0 = R.range(0, 0.6);
  const V = [];
  for (let i = 0; i < k; i++) {
    const a = a0 + (i / k) * Math.PI * 2, j = R.range(0.82, 1.06);
    V.push([x + Math.cos(a) * bw * 0.5 * j, Math.min(y, cy + Math.sin(a) * bh * 0.62 * j)]);
  }
  const C = [x - bw * 0.06, cy - bh * 0.12];
  const W = V.map(([vx, vy]) => [C[0] + (vx - C[0]) * 0.5 - bw * 0.04, C[1] + (vy - C[1]) * 0.45 - bh * 0.1]);
  const pal = PAL.stone, L = [-0.6, -0.8];
  for (let i = 0; i < k; i++) {
    const A = V[i], B = V[(i + 1) % k];
    let nx = B[1] - A[1], ny = -(B[0] - A[0]);
    const n = Math.hypot(nx, ny) || 1;
    nx /= n; ny /= n;
    if (nx * (A[0] - x) + ny * (A[1] - cy) < 0) { nx = -nx; ny = -ny; }   // outward
    const d = nx * L[0] + ny * L[1];
    const t = d > 0.5 ? 3 : d > 0.0 ? 2 : d > -0.8 ? 1 : 0;
    // pitted surface: a few darker pixels on each facet
    px.poly([A, B, W[(i + 1) % k], W[i]], (I, J) => pal[t > 0 && h01(I, J, 31) < 0.1 ? t - 1 : t]);
  }
  px.poly(W, (I, J) => pal[h01(I, J, 32) < 0.08 ? 1 : h01(I, J, 33) < 0.1 ? 3 : 2]);
  // the top plane's upper-left edges catch the light
  for (let i = 0; i < k; i++) {
    const A = W[i], B = W[(i + 1) % k];
    if ((A[1] + B[1]) / 2 < C[1] && (A[0] + B[0]) / 2 < C[0] + bw * 0.1) px.line(A, B, pal[3]);
  }
  // a crack from the top plane down a shaded facet
  if (bw > P * 7) {
    const s = Math.floor(R() * k), A = W[s], B = V[s];
    if (B[0] > C[0]) px.line(A, [(A[0] + B[0]) / 2 + P, (A[1] + B[1]) / 2], pal[0]);
  }
  if (wet) px.poly(V, (i, j) => ((j + 0.5) * P > y - Math.max(P, bh * 0.14) ? '#45606f' : null));
}
function rock(px, { x, y, w = 40, h = 30, n = 1, seed = 1, wet = false }) {
  const R = rng(seed);
  const parts = [[x, y, n === 1 ? w : w * 0.6, n === 1 ? h : h * 0.85]];
  const slots = [[0.3, 0.04, 0.42], [-0.34, 0.08, 0.32], [0.1, 0.16, 0.26], [0.48, 0.14, 0.22], [-0.12, 0.2, 0.18]];
  for (let k = 1; k < n; k++) { const [dx, dy, sz] = slots[(k - 1) % 5]; parts.push([x + dx * w, y + dy * h, w * sz, h * sz * 1.1]); }
  parts.sort((a, b) => a[1] - b[1]);
  for (const [bx, by, bw, bh] of parts) boulder(R, px, bx, by, bw, bh, wet);
  px.outline();
  if (!wet) groundShadow(px, x + w * 0.1, y + 1, w * 0.5, h * 0.12);
}

// built things share the vector generators' projection
const at = (proj, o) => iso(proj?.au, proj?.av).at(o);
const U_ = (proj) => iso(proj?.au, proj?.av).U;
// screen pixel -> (u, v) on the plane z of a projection p: lets a face be
// patterned in its own coordinates (plank seams, fish rows) with clean,
// regular pixel rhythm
function uvOf(proj, p, z = 0) {
  const { U, V } = iso(proj?.au, proj?.av), o = p(0, 0, z), det = U[0] * V[1] - V[0] * U[1];
  return (i, j) => {
    const x = (i + 0.5) * P - o[0], y = (j + 0.5) * P - o[1];
    return [(x * V[1] - V[0] * y) / det, (U[0] * y - x * U[1]) / det];
  };
}
// cast shadow: fills only where nothing is drawn yet, after the outline
function castShadow(px, pts) { px.poly(pts, (i, j) => (px.alpha(i, j) === 255 ? null : PAL.shadow)); }
function post(px, p, u, v, z0, z1, r) {
  const b = p(u, v, z0), t = p(u, v, z1);
  // round post: lit stripe on the left, a ring of grain, a pale cut top
  px.rect(b[0] - r, t[1], b[0] + r, b[1], (i, j) => {
    const x = (i + 0.5) * P - b[0];
    const c = x < -r * 0.45 ? 3 : x < r * 0.2 ? 2 : x < r * 0.7 ? 1 : 0;
    return PAL.wood[(j * 7) % 11 === 0 && c > 0 ? c - 1 : c];
  });
  px.rect(t[0] - r, t[1] - P * 0.6, t[0] + r, t[1] + P * 0.4, PAL.wood[4]);
}

function dock(px, { origin, len = 270, depth = 54, height = 32, thick = 9, gap = 46, postUp = 12, postR = 6.8, proj }) {
  const p = at(proj, origin);
  const n = Math.max(2, Math.round((len - 12) / gap) + 1);
  const us = Array.from({ length: n }, (_, i) => 6 + ((len - 12) * i) / (n - 1));
  for (const u of us) post(px, p, u, depth - 4, -height, -thick, postR * 0.9);
  // deck: boards four art pixels wide, one connected dark seam between each,
  // every fifth board a shade darker so the deck is not a flat sheet
  // each board its own tone, with grain streaks and knots; butt joints
  // staggered across the deck and a nail pair where boards cross the joists
  const pl = 14, uv = uvOf(proj, p), TONE = [3, 3, 2, 4, 3, 2, 3, 4];
  px.poly([p(0, 0, 0), p(len, 0, 0), p(len, depth, 0), p(0, depth, 0)], (i, j) => {
    const [u, v] = uv(i, j), b = Math.floor(u / pl), t = TONE[Math.floor(h01(b, 0, 41) * 8)];
    const n = h01(i, j, 42);
    if (n < 0.025) return PAL.wood[t - 1];
    return PAL.wood[t];
  });
  for (let u = pl, b = 1; u < len - 2; u += pl, b++) {
    px.line(p(u, 1, 0), p(u, depth - 1, 0), PAL.wood[1]);
    const jv = depth * [0.3, 0.62, 0.45][b % 3];
    px.line(p(u - pl + 2, jv, 0), p(u - 2, jv, 0), PAL.wood[1]);
    for (const v of [4, depth - 5]) { const q = p(u - pl / 2, v, 0); px.set(Math.floor(q[0] / P), Math.floor(q[1] / P), PAL.wood[0]); }
  }
  px.poly([p(0, 0, 0), p(len, 0, 0), p(len, 0, -thick), p(0, 0, -thick)], (i, j) => (h01(i, j, 44) < 0.08 ? PAL.wood[0] : PAL.wood[1]));
  px.line(p(0, 0, -1), p(len, 0, -1), PAL.wood[2]);
  px.poly([p(len, 0, 0), p(len, depth, 0), p(len, depth, -thick), p(len, 0, -thick)], PAL.wood[0]);
  for (const [i, u] of us.entries()) post(px, p, u, -1.5, -height, postUp - (i % 3) * 2, postR);
  post(px, p, len + 1.5, depth - 6, -height, postUp, postR);
  px.outline();
  castShadow(px, [p(0, 0, -height), p(len, 0, -height), p(len, depth, -height), p(0, depth, -height)].map(([a, b]) => [a + 9, b + 4]));
}

function house(px, { corner, w = 74, d = 50, h = 44, rise = 30, over = 5, chimney = 0.22, proj }) {
  const U = U_(proj);
  const p = at(proj, [corner[0] - w * U[0], corner[1] - w * U[1]]);
  const half = d / 2, top = h + rise, ze = h - over * (rise / half);
  px.poly([p(-over, half, top), p(w + over, half, top), p(w + over, d + over, ze), p(-over, d + over, ze)], PAL.roof[0]);
  // plaster with a few blemishes; the side wall in shade
  px.poly([p(0, 0, 0), p(w, 0, 0), p(w, 0, h), p(0, 0, h)], (i, j) => PAL.wall[h01(i, j, 51) < 0.06 ? 1 : 0]);
  px.poly([p(w, 0, 0), p(w, d, 0), p(w, d, h), p(w, half, top), p(w, 0, h)], (i, j) => PAL.wall[h01(i, j, 52) < 0.07 ? 2 : 1]);
  // a stone footing: blocks with mortar joints
  const foot = (q, n, lit) => {
    px.poly([q(0, 0), q(n, 0), q(n, 7), q(0, 7)], lit ? PAL.stone[2] : PAL.stone[1]);
    px.line(q(0, 3.5), q(n, 3.5), PAL.stone[0]);
    for (let s2 = 4; s2 < n; s2 += 9) { px.line(q(s2, 0), q(s2, 3.5), PAL.stone[0]); px.line(q(s2 + 4.5, 3.5), q(s2 + 4.5, 7), PAL.stone[0]); }
  };
  foot((s2, z) => p(s2, 0, z), w, true);
  foot((s2, z) => p(w, s2, z), d, false);
  // the corner where the walls meet, a lit edge
  px.line(p(w, 0, 7), p(w, 0, h), PAL.white);
  // windows and door
  // windows: a wooden frame, a dark pane, one glint pixel in the top-left
  const win = (q) => {
    px.poly([q(-6, 17), q(6, 17), q(6, 32), q(-6, 32)], PAL.wood[2]);
    px.poly([q(-4, 19), q(4, 19), q(4, 30), q(-4, 30)], PAL.pane);
    px.line(q(-4, 25), q(4, 25), PAL.wood[2]);
    px.poly([q(-8, 14), q(8, 14), q(8, 16), q(-8, 16)], PAL.wood[1]);
    const g = q(-2.5, 28.5);
    px.set(Math.floor(g[0] / P), Math.floor(g[1] / P), '#8fa6bd');
  };
  for (const t of [0.16, 0.4]) win((s2, z) => p(w * t + s2, 0, z));
  win((s2, z) => p(w, d * 0.5 + s2, z - 2));
  // door: a darker frame, planks, a brass knob
  const du = w * 0.72;
  px.poly([p(du - 8, 0, 0), p(du + 8, 0, 0), p(du + 8, 0, 27), p(du - 8, 0, 27)], PAL.wood[0]);
  px.poly([p(du - 8, 0, 27), p(du - 5, 0, 30.5), p(du + 5, 0, 30.5), p(du + 8, 0, 27)], PAL.wood[0]);
  px.poly([p(du - 5, 0, 0), p(du + 5, 0, 0), p(du + 5, 0, 24), p(du + 3, 0, 27), p(du - 3, 0, 27), p(du - 5, 0, 24)], PAL.door);
  px.line(p(du - 1.5, 0, 1), p(du - 1.5, 0, 25), PAL.wood[0]);
  px.line(p(du - 4, 0, 26), p(du - 4, 0, 1), PAL.wood[2]);
  const kn = p(du + 2.5, 0, 11);
  px.set(Math.floor(kn[0] / P), Math.floor(kn[1] / P), '#e0b84a');
  // roof: courses of light and mid, a dark eave
  const S = (s, t) => p(s, -over + (half + over) * t, ze + (top - ze) * t);
  // clay tiles: courses with a shadowed lower lip, staggered joints, the
  // odd sun-bleached tile
  const rows = 7;
  for (let r = 0; r < rows; r++) px.poly([S(-over, r / rows), S(w + over, r / rows), S(w + over, (r + 1) / rows), S(-over, (r + 1) / rows)], (i, j) => {
    const n = h01(i, j, 53);
    return n < 0.07 ? PAL.roof[3] : n > 0.95 ? PAL.roof[1] : PAL.roof[2];
  });
  for (let r = 1; r < rows; r++) px.line(S(-over, r / rows), S(w + over, r / rows), PAL.roof[1]);
  for (let r = 0; r < rows; r++)
    for (let s2 = -over + (r % 2 ? 5 : 0) + 4; s2 < w + over - 2; s2 += 10) px.line(S(s2, (r + 0.15) / rows), S(s2, (r + 0.8) / rows), PAL.roof[1]);
  px.poly([S(-over, 0), S(w + over, 0), S(w + over, 0.08), S(-over, 0.08)], PAL.roof[0]);
  px.poly([p(w + over, -over, ze), p(w + over, half, top), p(w + over, half, top - 4), p(w + over, -over, ze - 4)], PAL.roof[0]);
  px.line(p(-over, half, top), p(w + over, half, top), PAL.roof[0]);
  if (chimney) {
    const cu = w * chimney, cv = half * 0.35;
    const zr = ze + (top - ze) * ((cv + over) / (half + over));
    px.poly([p(cu, cv, zr), p(cu + 11, cv, zr), p(cu + 11, cv, top + 6), p(cu, cv, top + 6)], PAL.wall[0]);
    px.poly([p(cu + 11, cv, zr), p(cu + 11, cv + 10, zr), p(cu + 11, cv + 10, top + 6), p(cu + 11, cv, top + 6)], PAL.wall[2]);
    px.line(p(cu, cv, top + 1), p(cu + 11, cv, top + 1), PAL.wall[1]);
    // a darker cap with the flue showing
    px.poly([p(cu - 2, cv - 2, top + 6), p(cu + 13, cv - 2, top + 6), p(cu + 13, cv + 12, top + 6), p(cu - 2, cv + 12, top + 6)], PAL.stone[1]);
    px.poly([p(cu + 2, cv + 2, top + 6), p(cu + 9, cv + 2, top + 6), p(cu + 9, cv + 8, top + 6), p(cu + 2, cv + 8, top + 6)], PAL.stone[0]);
  }
  px.outline();
  px.poly([p(w, 0, 0), p(w + 16, 6, 0), p(w + 16, d + 6, 0), p(w, d, 0)].map(([a, b]) => [a + P, b]), (i, j) => (px.alpha(i, j) === 255 ? null : PAL.shadow));
}

// a plank box: lit front, shaded side, board seams and corner battens
// a plank box in pale crate wood, so it stands off the darker deck: lit
// front, shaded side, one board seam and corner battens
function box(px, p, w, d, h, top, C = PAL.crate) {
  px.poly([p(0, 0, h), p(w, 0, h), p(w, d, h), p(0, d, h)], top);
  px.poly([p(0, 0, 0), p(w, 0, 0), p(w, 0, h), p(0, 0, h)], C[3]);
  px.poly([p(w, 0, 0), p(w, d, 0), p(w, d, h), p(w, 0, h)], C[1]);
  px.line(p(1, 0, h / 2), p(w - 1, 0, h / 2), C[1]); px.line(p(w, 1, h / 2), p(w, d - 1, h / 2), C[0]);
  for (const u of [0, w - 3.5]) px.poly([p(u, 0, 0), p(u + 3.5, 0, 0), p(u + 3.5, 0, h), p(u, 0, h)], C[2]);
  px.poly([p(w, d - 3.5, 0), p(w, d, 0), p(w, d, h), p(w, d - 3.5, h)], C[0]);
}
// crates: lit front, shaded side, a light rim round the top; fish lie in
// rows along the crate, dark back, pale belly, a dark tail pixel
function crate(px, { corner, w = 40, d = 26, h = 18, fill = 'fish', proj }) {
  const U = U_(proj);
  const p = at(proj, [corner[0] - w * U[0], corner[1] - w * U[1]]);
  box(px, p, w, d, h, fill === 'lid' ? PAL.crate[3] : PAL.crate[0]);
  const uv = uvOf(proj, p, h);
  if (fill === 'lid') px.poly([p(0, 0, h), p(w, 0, h), p(w, d, h), p(0, d, h)], (i, j) => (uv(i, j)[0] % 9 < 1.5 ? PAL.crate[1] : null));
  else {
    const r = 3.2;
    px.poly([p(r, r, h), p(w - r, r, h), p(w - r, d - r, h), p(r, d - r, h)], (i, j) => {
      if (fill !== 'fish') return PAL.crate[0];
      const [u, v] = uv(i, j);
      const row = Math.floor((v - r) / 7), fv = (v - r) / 7 - row, fu = ((u - r + row * 5) % 15) / 15;
      if (fu > 0.86) return PAL.fish[0];                     // tail
      if (fu < 0.12 && fv > 0.3 && fv < 0.6) return '#1a1420'; // eye
      if (fv < 0.42) return PAL.fish[0];                     // back
      if (fv < 0.58 && fu > 0.2 && fu < 0.6) return PAL.fish[3]; // the shine
      return fv < 0.8 ? PAL.fish[1] : PAL.fish[2];
    });
    // the rim: board tops along the near edges, light
    px.poly([p(0, 0, h), p(w, 0, h), p(w - r, r, h), p(r, r, h)], PAL.crate[3]);
    px.poly([p(w, 0, h), p(w, d, h), p(w - r, d - r, h), p(w - r, r, h)], PAL.crate[2]);
  }
  px.outline();
  castShadow(px, [p(w, 0, 0), p(w + 7, 3, 0), p(w + 7, d + 3, 0), p(w, d, 0)].map(([a, b]) => [a + 2, b + 2]));
}
function barrel(px, { x, y, r = 9, h = 20 }) {
  // staves bulge one pixel at the middle; two dark hoops; lit left half
  px.poly([[x - r, y - h], [x + r, y - h], [x + r + P * 0.6, y - h / 2], [x + r, y], [x - r, y], [x - r - P * 0.6, y - h / 2]], (i, j) => {
    const yy = (j + 0.5) * P, t = (y - yy) / h, xx = (i + 0.5) * P;
    if (Math.abs(t - 0.22) < 0.08 || Math.abs(t - 0.74) < 0.08) return xx < x - r * 0.3 ? PAL.stone[2] : xx < x + r * 0.3 ? PAL.stone[1] : PAL.stone[0];
    if (Math.abs(xx - (x - r * 0.35)) < P * 0.5 || Math.abs(xx - (x + r * 0.35)) < P * 0.5) return xx < x ? PAL.wood[2] : PAL.wood[0];  // stave joints
    return xx < x - r * 0.55 ? PAL.wood[4] : xx < x - r * 0.1 ? PAL.wood[3] : xx < x + r * 0.5 ? PAL.wood[2] : PAL.wood[1];
  });
  px.ellipse(x, y - h, r, Math.max(P * 0.8, r * 0.45), (i, j, u, v) => (u * u + v * v > 0.55 ? PAL.wood[1] : u < 0.2 && v < 0 ? PAL.wood[4] : PAL.wood[3]));
  px.outline();
  groundShadow(px, x + r * 0.6, y + 1, r * 1.1, r * 0.4);
}
function stall(px, { corner, w = 44, d = 22, h = 13, proj }) {
  const U = U_(proj);
  const p = at(proj, [corner[0] - w * U[0], corner[1] - w * U[1]]);
  const postH = 33;
  for (const [u, v] of [[1.5, d - 1.5], [w - 1.5, d - 1.5]]) post(px, p, u, v, 0, postH + 4, 2);
  box(px, p, w, d, h, PAL.wood[3]);
  for (let s = 4; s < w * 0.6; s += 9) px.line(p(s, d * 0.4, h), p(s + 6, d * 0.4, h), PAL.fish[1]);
  for (const u of [1.5, w - 1.5]) post(px, p, u, -2, 0, postH, 2);
  const A = (s, t) => p(s, -6 + (d + 6) * t, postH + 7 * t);
  const n = 6;
  for (let k = 0; k < n; k++) {
    const s0 = -3 + ((w + 6) * k) / n, s1 = -3 + ((w + 6) * (k + 1)) / n;
    px.poly([A(s0, 0), A(s1, 0), A(s1, 1), A(s0, 1)], PAL.awning[k % 2]);
    px.poly([A(s0, 0), A(s1, 0), [A(s1, 0)[0], A(s1, 0)[1] + 5], [A(s0, 0)[0], A(s0, 0)[1] + 5]], PAL.awning[k % 2]);
  }
  px.outline();
}
function fence(px, { start, len = 40, dir = 'v', posts = 4, h = 17, proj }) {
  const p = at(proj, start);
  const q = dir === 'v' ? (s, z) => p(0, s, z) : (s, z) => p(s, 0, z);
  // two rails, one pixel each; posts two pixels wide with a lit top
  for (const z of [h * 0.72, h * 0.32]) px.line(q(-2, z), q(len + 2, z), PAL.wood[3]);
  for (let k = 0; k < posts; k++) {
    const s2 = (len * k) / (posts - 1), b = q(s2, 0), t = q(s2, h + 2);
    px.rect(b[0] - 4, t[1], b[0] + 4, b[1], (i) => ((i + 0.5) * P < b[0] ? PAL.wood[2] : PAL.wood[1]));
    px.rect(b[0] - 4, t[1], b[0] + 4, t[1] + 3, PAL.wood[3]);
  }
  px.outline();
  castShadow(px, [q(0, 0), q(len, 0), [q(len, 0)[0] + 8, q(len, 0)[1] + 3], [q(0, 0)[0] + 8, q(0, 0)[1] + 3]]);
}
function rack(px, { start, len = 96, spread = 13, h = 68, fish = 6, proj }) {
  const p = at(proj, start);
  // legs two pixels thick: lit and shaded side by side
  const leg = (a, b) => { px.line(a, b, PAL.wood[3]); px.line([a[0] + P, a[1]], [b[0] + P, b[1]], PAL.wood[1]); };
  leg(p(-spread, len, 0), p(0, len, h)); leg(p(spread, len, 0), p(0, len, h));
  px.line(p(0, -6, h - 2), p(0, len + 6, h - 2), PAL.wood[2]);
  px.line(p(0, -6, h + 2), p(0, len + 6, h + 2), PAL.wood[3]);
  for (let k = 0; k < fish; k++) {
    const t = p(0, len * (0.16 + (0.7 * k) / Math.max(1, fish - 1)), h - 4);
    const L = [24, 19, 27, 21, 25, 20][k % 6];
    // hung by the tail: a forked dark tail, a two-pixel body (pale belly on
    // the lit left, dark back on the right), the head a pixel narrower
    const I = Math.floor(t[0] / P), J = Math.floor(t[1] / P), n = Math.max(4, Math.round(L / P));
    px.set(I - 1, J, PAL.fish[0]); px.set(I + 1, J, PAL.fish[0]); px.set(I, J + 1, PAL.fish[0]);
    for (let r = 2; r < n; r++) {
      px.set(I - 1, J + r, r > 3 && r < n - 2 && r % 3 === 1 ? PAL.fish[3] : PAL.fish[2]);
      px.set(I, J + r, PAL.fish[1]);
      if (r > 2 && r < n - 1) px.set(I + 1, J + r, PAL.fish[0]);
    }
    px.set(I - 1, J + n, PAL.fish[1]); px.set(I, J + n, PAL.fish[1]); px.set(I, J + n - 2, '#1a1420');
  }
  leg(p(-spread, 0, 0), p(0, 0, h)); leg(p(spread, 0, 0), p(0, 0, h));
  px.outline();
  // the net, one sagging shape of knotted mesh: diagonal cords both ways with
  // the gaps left open. Drawn after the outline so each cord is not edged
  // dark, and only behind what is already there
  const a = p(0, len * 0.08, h - 4), b = p(0, len * 0.9, h - 4), m = [(a[0] + b[0]) / 2 + 3, (a[1] + b[1]) / 2 + h * 0.62];
  px.poly([a, [a[0] + 2, (a[1] + m[1]) / 2], m, [b[0] + 4, (b[1] + m[1]) / 2], b], (i, j) => {
    if (px.alpha(i, j) === 255) return null;
    const u = (i + j) % 3 === 0, v = (i - j + 300) % 3 === 0;
    return u && v ? PAL.netKnot : u || v ? PAL.net : null;
  });
  // the heavier rope along the sagging hem
  const hem = (q, r) => { if (px.alpha(Math.floor(q[0] / P), Math.floor(q[1] / P)) !== 255) px.line(q, r, PAL.netKnot); };
  hem([a[0] + 2, (a[1] + m[1]) / 2], m); hem(m, [b[0] + 4, (b[1] + m[1]) / 2]);
}
function flowers(px, { x, y, n = 4, r = 9, seed = 17 }) {
  const R = rng(seed);
  for (let k = 0; k < n; k++) { const a = R() * 6.28, d = R() * r; px.set(Math.floor((x + Math.cos(a) * d) / P), Math.floor((y + Math.sin(a) * d * 0.5) / P), k % 3 ? PAL.white : '#f2c230'); }
}

const GEN = { tree, pine, bush, rock, dock, house, crate, barrel, stall, fence, rack, flowers };
const KIND = { tree: 'tree', pine: 'tree', bush: 'bush', rock: 'rock', dock: 'dock', house: 'building', crate: 'crate',
  barrel: 'barrel', stall: 'stall', fence: 'fence', rack: 'rack', flowers: 'flower' };

// ------------------------------------------------------------- ground
function ground(scene, rings, fill, dress) {
  const px = new Pix(scene.w, scene.h);
  const inHex = (i, j) => inPoly([scene.hex], (i + 0.5) * P, (j + 0.5) * P);
  for (const r of rings) px.poly(r, (i, j) => (inHex(i, j) ? fill(i, j) : null));
  dress?.(px, inHex);
  return px.out();
}
const h01 = (i, j, s) => { const n = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
// smooth value noise, for ground patches with organic edges instead of blocks
function vnoise(x, y, s) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h01(i, j, s), b = h01(i + 1, j, s), c = h01(i, j + 1, s), d = h01(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function renderPixelScene(scene) {
  const proj = scene.proj ?? { au: 20, av: 30 };
  const L = scene.land;
  const edge = (px, inHex, base, rim) => {
    // a one-pixel rim where this plane meets whatever lies under it
    const W = px.W, H = px.H, a = Uint8ClampedArray.from(px.d);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (a[(j * W + i) * 4 + 3] !== 255) continue;
      const open = [[0, 1], [1, 0], [-1, 0], [0, -1]].some(([di, dj]) => { const I = i + di, J = j + dj; return I >= 0 && J >= 0 && I < W && J < H && inHex(I, J) && a[(J * W + I) * 4 + 3] !== 255; });
      if (open) px.set(i, j, rim);
    }
    void base;
  };
  const planes = [
    { id: 'sand', ...ground(scene, L.sand, (i, j) => (h01(i, j, 1) < 0.05 ? PAL.sandDark : h01(i, j, 2) < 0.06 ? PAL.sandLight : vnoise(i / 8, j / 5, 6) < 0.25 && (i + j) % 2 ? PAL.sandDark : PAL.sand), (px, inHex) => {
      // the traced land stops just short of the hex edge; carry the sand out
      // to the frame so no water shows in that last pixel or two
      const H = scene.hex, edgeD = (x, y) => Math.min(...H.map((a, k) => { const b = H[(k + 1) % H.length]; return Math.abs((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]); }));
      for (let pass = 0; pass < 3; pass++) {
        const a = Uint8ClampedArray.from(px.d);
        for (let j = 0; j < px.H; j++) for (let i = 0; i < px.W; i++) {
          if (a[(j * px.W + i) * 4 + 3] || !inHex(i, j) || edgeD((i + 0.5) * P, (j + 0.5) * P) > P * 2) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => { const I = i + di, J = j + dj; return I >= 0 && J >= 0 && I < px.W && J < px.H && a[(J * px.W + I) * 4 + 3]; })) px.set(i, j, PAL.sand);
        }
      }
    }) },
    { id: 'grass', ...ground(scene, L.grass, (i, j) => {
      // soft patches of light and dark grass, edged with a checker dither
      const a = vnoise(i / 11, j / 8, 3), b = vnoise(i / 9, j / 7, 8), ck = (i + j) % 2 === 0;
      if (a > 0.7 || (a > 0.67 && ck)) return PAL.grassLight;
      if (b < 0.2 || (b < 0.23 && ck)) return PAL.grassDark;
      return PAL.grass;
    }, (px, inHex) => {
      edge(px, inHex, PAL.grass, PAL.grassDark);
      // tufts: little two-pixel V marks, sparse
      for (let j = 1; j < px.H; j++) for (let i = 1; i < px.W - 1; i++) {
        if (px.alpha(i, j) !== 255 || px.alpha(i - 1, j - 1) !== 255 || px.alpha(i + 1, j - 1) !== 255) continue;
        const n = h01(i, j, 4);
        if (n < 0.03) { px.set(i, j, PAL.tuft); px.set(i - 1, j - 1, PAL.tuft); px.set(i + 1, j - 1, PAL.tuft); }
        else if (n < 0.045) { px.set(i, j - 1, PAL.grassLight); px.set(i, j, PAL.tuft); }       // a lit blade
        else if (n > 0.9975) px.set(i, j, h01(i, j, 5) < 0.5 ? PAL.white : '#f2c230');     // a stray flower
      }
    }) },
    // the road: packed earth, pale down the middle where it is walked, pebbles
    { id: 'road', ...ground(scene, L.road, (i, j) => {
      const n = h01(i, j, 7);
      return n < 0.03 ? PAL.roadDark : n > 0.97 ? PAL.roadLight : vnoise(i / 6, j / 5, 9) > 0.72 ? PAL.roadLight : vnoise(i / 6, j / 5, 9) > 0.68 && (i + j) % 2 ? PAL.roadLight : PAL.road;
    }, (px, inHex) => edge(px, inHex, PAL.road, PAL.roadDark)) },
  ];
  const objects = [];
  for (const a of scene.assets) {
    const g = GEN[a.type];
    if (!g) continue;
    const px = new Pix(scene.w, scene.h);
    g(px, { ...a, proj });
    const o = px.out();
    const foot = a.type === 'dock' ? at(proj, a.origin)(a.len / 2, 0, 0) : a.corner ?? a.start ?? [a.x, a.y];
    objects.push({ id: a.id, type: a.type, kind: KIND[a.type] ?? 'prop', ...o, foot, z: a.z ?? foot[1], wet: !!a.wet || a.type === 'dock' });
  }
  objects.sort((a, b) => a.z - b.z);
  // the hex frame, one art pixel thick
  const fr = new Pix(scene.w, scene.h);
  for (let k = 0; k < scene.hex.length; k++) fr.line(scene.hex[k], scene.hex[(k + 1) % scene.hex.length], '#2a2430');
  return { planes, objects, frame: fr.out(), w: scene.w, h: scene.h };
}

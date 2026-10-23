// The same scene drawn as pixel art: a low-resolution grid (one art pixel =
// P tile px), flat colours from a small palette, no ink lines. Each sprite
// gets a one-pixel outline in a darker shade of whatever it borders, the way
// hand-made pixel sprites are edged. The scene file (assets/scenes/<tile>.json)
// and the projection are shared with the vector generators, so both styles
// lay out identically and the lab can switch between them.
import { iso, inPoly } from '../gen/util.js';

export const P = 4;                       // tile px per art pixel

export const PAL = {
  grass: '#6cb13c', grassDark: '#57a033', grassLight: '#82c149', tuft: '#3f8a2e',
  sand: '#e8d293', sandDark: '#d2b779', sandLight: '#f2e2ae',
  road: '#e0c264', roadDark: '#c9a64c',
  pine: ['#163d4b', '#1e5462', '#2a6d6c', '#3f8a73'],
  leaf: ['#2b6a2e', '#3c8834', '#59a93b', '#86c64c'],
  stone: ['#4f515e', '#72757f', '#999ba3', '#c3c4c9'],
  wood: ['#4f3220', '#6f4729', '#93623a', '#b6854f'],
  roof: ['#7d2c22', '#a8402c', '#c8573a'],
  wall: ['#e9dbb7', '#cbb68c', '#a99069'],
  fish: ['#4d6987', '#9bb3cc', '#dbe6ef'],
  trunk: ['#4c311d', '#6e4628'],
  awning: ['#ece3cf', '#c95b3c'],
  pane: '#2e3a4c', door: '#6a3f22', net: '#c8b97c', white: '#f4f1e6', shadow: [20, 50, 10, 70],
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
        this.set(i, j, [src[n] * 0.4 + OUT[0] * 0.6, src[n + 1] * 0.4 + OUT[1] * 0.6, src[n + 2] * 0.4 + OUT[2] * 0.6, 255]);
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
// a leafy crown: lobes shaded by their own normal against the upper-left
// light, the topmost lobe at each pixel wins, so lobes separate naturally
const LOBES = {
  broad: [[0, -0.55, 0.5], [-0.45, -0.1, 0.48], [0.45, -0.12, 0.48], [0, 0.05, 0.55], [-0.3, 0.35, 0.42], [0.32, 0.34, 0.42]],
  spread: [[-0.25, -0.45, 0.45], [0.35, -0.4, 0.4], [-0.65, 0.05, 0.4], [0.62, 0.02, 0.4], [0, 0.0, 0.5], [-0.3, 0.32, 0.4], [0.35, 0.3, 0.4]],
  sapling: [[0, -0.42, 0.5], [-0.32, 0.05, 0.45], [0.34, 0.04, 0.45], [0, 0.25, 0.42]],
  bush: [[-0.45, 0, 0.5], [0.45, -0.02, 0.5], [0, -0.3, 0.52], [0, 0.12, 0.5]],
};
function crown(px, cx, cy, r, form, flip, pal = PAL.leaf) {
  const L = LOBES[form].map(([u, v, q]) => [cx + (flip ? -u : u) * r, cy + v * r, q * r]);
  const tone = (i, j) => {
    const x = (i + 0.5) * P, y = (j + 0.5) * P;
    for (let k = L.length - 1; k >= 0; k--) {
      const [lx, ly, q] = L[k];
      const nx = (x - lx) / q, ny = (y - ly) / q;
      if (nx * nx + ny * ny > 1) continue;
      // mostly the crown's own light, a little of the lobe's, so lobes read
      // without banding every one
      const lit = -0.3 * nx - 0.45 * ny - 0.65 * ((y - cy) / r) - 0.4 * ((x - cx) / r);
      return lit > 0.6 ? pal[3] : lit > 0.05 ? pal[2] : lit > -0.55 ? pal[1] : pal[0];
    }
    return null;
  };
  for (const [lx, ly, q] of L) px.ellipse(lx, ly, q, q, (i, j) => tone(i, j));
}
function trunk(px, x, y, top, w) {
  px.rect(x - w / 2, top, x + w / 2, y, (i) => ((i + 0.5) * P < x ? PAL.trunk[1] : PAL.trunk[0]));
}
function groundShadow(px, x, y, rx, ry) { px.ellipse(x, y, rx, ry, PAL.shadow); }

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
      const c = u > 0.82 && dx > -0.6 ? pal[0] : dx < -0.45 && u < 0.75 ? pal[3] : dx < 0.05 ? pal[2] : dx < 0.55 ? pal[1] : pal[0];
      px.set(i, j, c);
    }
  }
  px.outline();
  groundShadow(px, x + w * 0.2, y + 1, w * 0.45, w * 0.13);
}

// rocks: angular chunks, a lit left face and a dark right face
function boulder(R, px, x, y, bw, bh, wet) {
  const s = R() < 0.6 ? 1 : -1;
  const peak = [x + s * bw * R.range(0, 0.15), y - bh];
  const pts = [[x - bw / 2, y], [x - bw * R.range(0.32, 0.45), y - bh * R.range(0.55, 0.8)], peak, [x + bw * R.range(0.3, 0.42), y - bh * R.range(0.45, 0.75)], [x + bw / 2, y]];
  const ridge = (yy) => peak[0] + (x + bw * 0.08 - peak[0]) * ((yy - peak[1]) / bh);
  const pal = PAL.stone;
  px.poly(pts, (i, j) => {
    const xx = (i + 0.5) * P, yy = (j + 0.5) * P;
    if (wet && yy > y - bh * 0.12) return '#4a6170';
    if (xx > ridge(yy)) return yy > y - bh * 0.35 ? pal[0] : pal[1];
    return yy < peak[1] + bh * 0.35 ? pal[3] : pal[2];
  });
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
function post(px, p, u, v, z0, z1, r) {
  const b = p(u, v, z0), t = p(u, v, z1);
  px.rect(b[0] - r, t[1], b[0] + r, b[1], (i) => ((i + 0.5) * P < b[0] - r * 0.1 ? PAL.wood[2] : PAL.wood[1]));
  px.rect(t[0] - r, t[1] - P * 0.6, t[0] + r, t[1] + P * 0.4, PAL.wood[3]);
}

function dock(px, { origin, len = 270, depth = 54, height = 32, thick = 9, plank = 12, gap = 46, postUp = 12, postR = 6.8, proj }) {
  const p = at(proj, origin);
  const n = Math.max(2, Math.round((len - 12) / gap) + 1);
  const us = Array.from({ length: n }, (_, i) => 6 + ((len - 12) * i) / (n - 1));
  for (const u of us) post(px, p, u, depth - 4, -height, -thick, postR * 0.9);
  // deck: planks across, alternating tone, a dark seam between boards
  let k = 0;
  for (let u = 0; u < len - 0.5; u += plank, k++) {
    const u1 = Math.min(len, u + plank);
    px.poly([p(u, 0, 0), p(u1, 0, 0), p(u1, depth, 0), p(u, depth, 0)], k % 3 === 1 ? PAL.wood[2] : PAL.wood[3]);
    if (k % 2 === 0 && u > 0) px.line(p(u, 0.5, 0), p(u, depth - 1, 0), PAL.wood[1]);
  }
  px.poly([p(0, 0, 0), p(len, 0, 0), p(len, 0, -thick), p(0, 0, -thick)], PAL.wood[1]);
  px.poly([p(len, 0, 0), p(len, depth, 0), p(len, depth, -thick), p(len, 0, -thick)], PAL.wood[0]);
  for (const [i, u] of us.entries()) post(px, p, u, -1.5, -height, postUp - (i % 3) * 2, postR);
  post(px, p, len + 1.5, depth - 6, -height, postUp, postR);
  px.outline();
}

function house(px, { corner, w = 74, d = 50, h = 44, rise = 30, over = 5, chimney = 0.22, proj }) {
  const U = U_(proj);
  const p = at(proj, [corner[0] - w * U[0], corner[1] - w * U[1]]);
  const half = d / 2, top = h + rise, ze = h - over * (rise / half);
  px.poly([p(-over, half, top), p(w + over, half, top), p(w + over, d + over, ze), p(-over, d + over, ze)], PAL.roof[0]);
  px.poly([p(0, 0, 0), p(w, 0, 0), p(w, 0, h), p(0, 0, h)], PAL.wall[0]);
  px.poly([p(w, 0, 0), p(w, d, 0), p(w, d, h), p(w, half, top), p(w, 0, h)], PAL.wall[1]);
  px.poly([p(0, 0, 0), p(w, 0, 0), p(w, 0, 5), p(0, 0, 5)], PAL.wall[2]);
  px.poly([p(w, 0, 0), p(w, d, 0), p(w, d, 5), p(w, 0, 5)], PAL.wall[2]);
  // windows and door
  for (const t of [0.16, 0.38]) px.poly([p(w * t - 5, 0, 18), p(w * t + 5, 0, 18), p(w * t + 5, 0, 31), p(w * t - 5, 0, 31)], PAL.pane);
  px.poly([p(w * 0.72 - 6, 0, 0), p(w * 0.72 + 6, 0, 0), p(w * 0.72 + 6, 0, 24), p(w * 0.72 - 6, 0, 24)], PAL.door);
  px.poly([p(w, d * 0.5 - 4, 16), p(w, d * 0.5 + 4, 16), p(w, d * 0.5 + 4, 27), p(w, d * 0.5 - 4, 27)], PAL.pane);
  // roof: courses of light and mid, a dark eave
  const S = (s, t) => p(s, -over + (half + over) * t, ze + (top - ze) * t);
  const rows = 5;
  for (let r = 0; r < rows; r++) px.poly([S(-over, r / rows), S(w + over, r / rows), S(w + over, (r + 1) / rows), S(-over, (r + 1) / rows)], r % 2 ? PAL.roof[1] : PAL.roof[2]);
  px.poly([S(-over, 0), S(w + over, 0), S(w + over, 0.08), S(-over, 0.08)], PAL.roof[0]);
  px.poly([p(w + over, -over, ze), p(w + over, half, top), p(w + over, half, top - 4), p(w + over, -over, ze - 4)], PAL.roof[0]);
  if (chimney) {
    const cu = w * chimney, cv = half * 0.35;
    const zr = ze + (top - ze) * ((cv + over) / (half + over));
    px.poly([p(cu, cv, zr), p(cu + 11, cv, zr), p(cu + 11, cv, top + 6), p(cu, cv, top + 6)], PAL.stone[2]);
    px.poly([p(cu + 11, cv, zr), p(cu + 11, cv + 10, zr), p(cu + 11, cv + 10, top + 6), p(cu + 11, cv, top + 6)], PAL.stone[1]);
  }
  px.outline();
  px.poly([p(w, 0, 0), p(w + 16, 6, 0), p(w + 16, d + 6, 0), p(w, d, 0)].map(([a, b]) => [a + P, b]), (i, j) => (px.alpha(i, j) === 255 ? null : PAL.shadow));
}

function box(px, p, w, d, h, top) {
  px.poly([p(0, 0, h), p(w, 0, h), p(w, d, h), p(0, d, h)], top);
  px.poly([p(0, 0, 0), p(w, 0, 0), p(w, 0, h), p(0, 0, h)], PAL.wood[2]);
  px.poly([p(w, 0, 0), p(w, d, 0), p(w, d, h), p(w, 0, h)], PAL.wood[1]);
}
function crate(px, { corner, w = 40, d = 26, h = 18, fill = 'fish', proj }) {
  const U = U_(proj);
  const p = at(proj, [corner[0] - w * U[0], corner[1] - w * U[1]]);
  box(px, p, w, d, h, fill === 'lid' ? PAL.wood[3] : PAL.wood[0]);
  if (fill === 'fish') {
    px.poly([p(3, 3, h), p(w - 3, 3, h), p(w - 3, d - 3, h), p(3, d - 3, h)], PAL.fish[2]);
    for (let s = 5; s < w - 10; s += 11) for (const v of [d * 0.35, d * 0.7]) { px.line(p(s, v, h), p(s + 8, v, h), PAL.fish[1]); px.set(Math.floor(p(s, v, h)[0] / P), Math.floor(p(s, v, h)[1] / P) - 1, PAL.fish[0]); }
  }
  px.line(p(0, 0, h / 2), p(w, 0, h / 2), PAL.wood[1]);
  px.outline();
}
function barrel(px, { x, y, r = 9, h = 20 }) {
  px.rect(x - r, y - h, x + r, y, (i, j) => {
    const yy = (j + 0.5) * P, t = (y - yy) / h;
    if (Math.abs(t - 0.22) < 0.07 || Math.abs(t - 0.78) < 0.07) return PAL.stone[0];
    return (i + 0.5) * P < x ? PAL.wood[2] : PAL.wood[1];
  });
  px.ellipse(x, y - h, r, r * 0.45, PAL.wood[3]);
  px.outline();
  groundShadow(px, x + r * 0.5, y + 1, r * 1.2, r * 0.4);
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
  for (const z of [h * 0.72, h * 0.32]) { px.line(q(-2, z), q(len + 2, z), PAL.wood[2]); px.line(q(-2, z - 3), q(len + 2, z - 3), PAL.wood[1]); }
  for (let k = 0; k < posts; k++) { const s = (len * k) / (posts - 1); const b = q(s, 0), t = q(s, h); px.rect(b[0] - 3, t[1], b[0] + 3, b[1], PAL.wood[2]); }
  px.outline();
}
function rack(px, { start, len = 96, spread = 13, h = 68, fish = 6, proj }) {
  const p = at(proj, start);
  const leg = (a, b) => { px.line(a, b, PAL.wood[2]); px.line([a[0] + P, a[1]], [b[0] + P, b[1]], PAL.wood[1]); };
  leg(p(-spread, len, 0), p(0, len, h)); leg(p(spread, len, 0), p(0, len, h));
  px.line(p(0, -6, h - 2), p(0, len + 6, h - 2), PAL.wood[2]);
  px.line(p(0, -6, h + 2), p(0, len + 6, h + 2), PAL.wood[3]);
  // the net as one sagging shape
  const a = p(0, len * 0.08, h - 4), b = p(0, len * 0.9, h - 4), m = [(a[0] + b[0]) / 2 + 3, (a[1] + b[1]) / 2 + h * 0.62];
  px.poly([a, [a[0] + 2, (a[1] + m[1]) / 2], m, [b[0] + 4, (b[1] + m[1]) / 2], b], (i, j) => ((i + j) % 3 === 0 && (i - j) % 3 === 0 ? '#9c8c55' : PAL.net));
  for (let k = 0; k < fish; k++) {
    const t = p(0, len * (0.16 + (0.7 * k) / Math.max(1, fish - 1)), h - 4);
    const L = [24, 19, 27, 21, 25, 20][k % 6];
    px.rect(t[0] - 4, t[1] + 3, t[0] + 4, t[1] + L, (i, j) => ((j + 0.5) * P > t[1] + L - 3 ? PAL.fish[0] : (i + 0.5) * P < t[0] ? PAL.fish[2] : PAL.fish[1]));
    px.rect(t[0] - 6, t[1], t[0] + 6, t[1] + 3.5, PAL.fish[0]);
  }
  leg(p(-spread, 0, 0), p(0, 0, h)); leg(p(spread, 0, 0), p(0, 0, h));
  px.outline();
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
    { id: 'sand', ...ground(scene, L.sand, (i, j) => (h01(i, j, 1) < 0.04 ? PAL.sandDark : h01(i, j, 2) < 0.04 ? PAL.sandLight : PAL.sand)) },
    { id: 'grass', ...ground(scene, L.grass, (i, j) => (h01(Math.floor(i / 6), Math.floor(j / 5), 3) < 0.18 ? PAL.grassLight : PAL.grass), (px, inHex) => {
      edge(px, inHex, PAL.grass, PAL.grassDark);
      // tufts: little two-pixel V marks, sparse
      for (let j = 1; j < px.H; j++) for (let i = 1; i < px.W - 1; i++) {
        if (px.alpha(i, j) !== 255 || px.alpha(i - 1, j - 1) !== 255 || px.alpha(i + 1, j - 1) !== 255 || h01(i, j, 4) > 0.022) continue;
        px.set(i, j, PAL.tuft); px.set(i - 1, j - 1, PAL.tuft); px.set(i + 1, j - 1, PAL.tuft);
      }
    }) },
    { id: 'road', ...ground(scene, L.road, () => PAL.road, (px, inHex) => edge(px, inHex, PAL.road, PAL.roadDark)) },
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

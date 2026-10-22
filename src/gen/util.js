// Shared bits for the SVG asset generators: seeded randomness, colour maths,
// path building and the tile's iso projection.
//
// Every generator draws in tile pixels (the reference tile is 502 x 575) but
// as vectors, so the lab can rasterise an asset at any resolution. Ink is the
// ligne-claire outline of the reference art.

export const INK = '#2a1d15';
export const IW = 1.9;          // outer ink width, tile px
export const IW2 = 1.05;        // inner detail lines

export function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.jit = (v, k) => v * (1 + (r() * 2 - 1) * k);
  return r;
}

export const f = (n) => (Math.round(n * 100) / 100).toString();
export const P = (p) => f(p[0]) + ',' + f(p[1]);
export const pts = (a) => a.map(P).join(' ');

export function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgb2hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * t));
export const shade = (c, k) => (k < 0 ? mix(c, '#000000', -k) : mix(c, '#ffffff', k));

// closed (or open) smooth path through points: Catmull-Rom as cubic Beziers
export function smooth(a, closed = true, t = 1) {
  const n = a.length;
  const g = (i) => (closed ? a[(i + n) % n] : a[Math.max(0, Math.min(n - 1, i))]);
  let d = 'M' + P(a[0]);
  const end = closed ? n : n - 1;
  for (let i = 0; i < end; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * t, p1[1] + ((p2[1] - p0[1]) / 6) * t];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * t, p2[1] - ((p3[1] - p1[1]) / 6) * t];
    d += 'C' + P(c1) + ' ' + P(c2) + ' ' + P(p2);
  }
  return d + (closed ? 'Z' : '');
}

// polygon with rounded corners (radius r, clamped to half of each edge)
export function rounded(a, r) {
  const n = a.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = a[(i - 1 + n) % n], p1 = a[i], p2 = a[(i + 1) % n];
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k1 = Math.min(r, d1 / 2) / d1, k2 = Math.min(r, d2 / 2) / d2;
    const s = [p1[0] + (p0[0] - p1[0]) * k1, p1[1] + (p0[1] - p1[1]) * k1];
    const e = [p1[0] + (p2[0] - p1[0]) * k2, p1[1] + (p2[1] - p1[1]) * k2];
    d += (i ? 'L' : 'M') + P(s) + 'Q' + P(p1) + ' ' + P(e);
  }
  return d + 'Z';
}

export const poly = (a, fill, extra = '') => `<polygon points="${pts(a)}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
export const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
export const line = (a, w = IW2, c = INK, extra = '') =>
  `<path d="M${a.map(P).join('L')}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`;
export const inked = (w = IW) => `stroke="${INK}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"`;
export const ellipse = (c, rx, ry, fill, extra = '') =>
  `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
export const circle = (c, r, fill, extra = '') => `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${f(r)}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;

let uid = 0;
export const id = (p) => `${p}${++uid}`;

// The tile's projection. u runs down-right at `au` degrees, v up-right at
// `av`, z straight up; one unit is one tile px along each axis. All built
// things on a tile (dock, house, crates, stalls, fences) share it, so their
// sizes and angles agree.
export function iso(au = 20, av = 30) {
  const ra = (au * Math.PI) / 180, rv = (av * Math.PI) / 180;
  const U = [Math.cos(ra), Math.sin(ra)], V = [Math.cos(rv), -Math.sin(rv)];
  const at = (o) => (u, v = 0, z = 0) => [o[0] + u * U[0] + v * V[0], o[1] + u * U[1] + v * V[1] - z];
  return { U, V, at };
}

// box faces of an axis-aligned block, as screen polygons: top, front (v = v0
// face, facing down-left, lit) and side (u = u1 face, facing down-right)
export function boxFaces(p, u0, u1, v0, v1, z0, z1) {
  return {
    top: [p(u0, v0, z1), p(u1, v0, z1), p(u1, v1, z1), p(u0, v1, z1)],
    front: [p(u0, v0, z0), p(u1, v0, z0), p(u1, v0, z1), p(u0, v0, z1)],
    side: [p(u1, v0, z0), p(u1, v1, z0), p(u1, v1, z1), p(u1, v0, z1)],
  };
}

export function bboxOf(points, pad = 4) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
}

export function inPoly(rings, x, y) {
  let c = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
}

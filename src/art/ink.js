// Ligne-claire drawing kit for Canvas2D.
// Every sprite is authored in "design px" (dp): the scale of the reference sheets,
// where one hex tile is 490 dp wide. Ink weight is uniform (INK_W) for silhouettes
// and lighter (INK_W2) for interior detail, exactly like a hand-inked comic.

export const INK = '#2a1f1a';
export const INK_W = 2.6;
export const INK_W2 = 1.6;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fill a path, then stroke it with ink. `path` is (ctx) => void that adds sub-paths.
export function ink(ctx, path, fill, lw = INK_W, stroke = INK) {
  ctx.beginPath();
  path(ctx);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw) {
    ctx.lineWidth = lw; ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();
  }
}

export function fillOnly(ctx, path, fill) { ink(ctx, path, fill, 0); }

export function strokeOnly(ctx, path, lw = INK_W2, stroke = INK) {
  ctx.beginPath(); path(ctx);
  ctx.lineWidth = lw; ctx.strokeStyle = stroke;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke();
}

// Draw `inner` clipped to `path`. Used for cel shading inside a silhouette.
export function within(ctx, path, inner) {
  ctx.save(); ctx.beginPath(); path(ctx); ctx.clip(); inner(); ctx.restore();
}

// The standard cel stack: base fill, clipped shading, then the ink contour on top.
export function cel(ctx, path, base, shading, lw = INK_W) {
  fillOnly(ctx, path, base);
  if (shading) within(ctx, path, shading);
  strokeOnly(ctx, path, lw);
}

export const poly = (pts, close = true) => (ctx) => {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
};

export const ellipse = (x, y, rx, ry, rot = 0) => (ctx) => ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
export const circle = (x, y, r) => ellipse(x, y, r, r);

export const rrect = (x, y, w, h, r) => (ctx) => ctx.roundRect(x, y, w, h, r);

// Scalloped blob: the canopy / bush / fleece silhouette of the reference art.
export function scallop(cx, cy, rx, ry, n, bulge, r = Math.random, jitter = 0.12) {
  const pts = [];
  const off = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * jitter * 2;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return (ctx) => {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const dx = mx - cx, dy = my - cy;
      const l = Math.hypot(dx, dy) || 1;
      ctx.quadraticCurveTo(mx + (dx / l) * bulge, my + (dy / l) * bulge, b[0], b[1]);
    }
    ctx.closePath();
  };
}

// Soft ground shadow (the only non-flat element; kept low-opacity so it reads as print).
export function groundShadow(ctx, x, y, rx, ry, a = 0.22) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(30,45,10,${a})`; ctx.fill();
}

// ---- Isometric helper (30° projection used by every building and prop) ----
// x runs to screen right-down, y to screen left-down, z up. `s` = dp per iso unit.
export function iso(ox, oy, s = 1, mir = false) {
  const m = mir ? -1 : 1;
  const P = (x, y, z = 0) => [ox + m * (x - y) * 0.866 * s, oy + (x + y) * 0.5 * s - z * s];
  return P;
}

export function lerp2(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

// Shift a colour by multiplying channels; quick way to make cel shade/highlight tones.
export function tone(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k < 1) { r *= k; g *= k; b *= k; }
  else { const t = k - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

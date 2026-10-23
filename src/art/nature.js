// Nature sprites: trees, bushes, plants, rocks. All drawn around a ground anchor at (0,0).
import { INK, INK_W, INK_W2, ink, fillOnly, strokeOnly, within, poly, ellipse, circle, scallop, groundShadow, tone } from './ink.js';

// Union of blobs with a single clean outer contour (stroke-then-fill trick),
// cel shading = base, lower-right shade crescent, upper-left highlight lobes.
export function blobCluster(ctx, blobs, base, opts = {}) {
  const shade = opts.shade ?? tone(base, 0.72);
  const hi = opts.hi ?? tone(base, 1.28);
  const lw = opts.lw ?? INK_W;
  const sx = opts.sx ?? 5, sy = opts.sy ?? 6;
  const union = (c) => blobs.forEach((b) => b(c));
  ctx.save();
  for (const b of blobs) { ctx.beginPath(); b(ctx); ctx.lineWidth = lw * 2; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }
  fillOnly(ctx, union, shade);
  within(ctx, union, () => {
    ctx.save(); ctx.translate(-sx, -sy); fillOnly(ctx, union, base); ctx.restore();
    if (opts.hiBlobs) opts.hiBlobs.forEach((b) => fillOnly(ctx, b, hi));
    if (opts.detail) opts.detail();
  });
  ctx.restore();
}

function trunk(ctx, h, w, col = '#8a5a32') {
  ink(ctx, poly([[-w / 2, 0], [-w / 2 + 1.5, -h], [w / 2 - 1.5, -h], [w / 2, 0]]), col);
  fillOnly(ctx, poly([[w / 2 - 3.5, -2], [w / 2 - 3.2, -h + 2], [w / 2 - 1.8, -h + 2], [w / 2 - 1.2, -2]]), tone(col, 0.7));
  strokeOnly(ctx, poly([[-w / 2, 0], [-w / 2 + 1.5, -h], [w / 2 - 1.5, -h], [w / 2, 0]]), INK_W);
}

// Leaf texture: small "u" ticks in shade tone scattered over a canopy.
function leafTicks(ctx, r, cx, cy, rx, ry, n, col, size = 4) {
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
    ctx.beginPath(); ctx.arc(x, y, size * (0.7 + r() * 0.5), 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  }
}

export function roundTree(ctx, r, { size = 1, base = '#5fb63a', fruit = null } = {}) {
  const s = size;
  groundShadow(ctx, 6 * s, 0, 30 * s, 8 * s);
  trunk(ctx, 22 * s, 11 * s);
  const cy = -46 * s;
  const blobs = [
    scallop(0, cy - 8 * s, 27 * s, 23 * s, 9, 5 * s, r),
    scallop(-16 * s, cy + 8 * s, 19 * s, 15 * s, 7, 4 * s, r),
    scallop(16 * s, cy + 8 * s, 20 * s, 15 * s, 7, 4 * s, r),
  ];
  const hiBlobs = [scallop(-9 * s, cy - 16 * s, 11 * s, 8 * s, 6, 2.5 * s, r), scallop(-22 * s, cy + 3 * s, 6 * s, 4.5 * s, 5, 1.5 * s, r)];
  blobCluster(ctx, blobs, base, {
    hiBlobs, sx: 6 * s, sy: 7 * s,
    detail: () => leafTicks(ctx, r, 0, cy, 30 * s, 22 * s, 9, tone(base, 0.62), 4 * s),
  });
  if (fruit) {
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, d = 0.35 + r() * 0.55;
      apple(ctx, Math.cos(a) * 24 * s * d, cy + Math.sin(a) * 18 * s * d, 3.6 * s, fruit);
    }
  }
}

export function apple(ctx, x, y, rad, col = '#e22a1f') {
  ink(ctx, circle(x, y, rad), col, INK_W2);
  fillOnly(ctx, circle(x - rad * 0.35, y - rad * 0.35, rad * 0.32), '#ffd2c4');
}

export function autumnTree(ctx, r, { size = 1 } = {}) {
  roundTree(ctx, r, { size, base: '#f0832a', fruit: '#e11f1f' });
}

export function pine(ctx, r, { size = 1, base = '#2f8a43' } = {}) {
  const s = size;
  groundShadow(ctx, 5 * s, 0, 20 * s, 6 * s);
  trunk(ctx, 12 * s, 8 * s, '#7a4e2c');
  const tiers = 4, top = -96 * s, bot = -10 * s;
  const shade = tone(base, 0.7), hi = tone(base, 1.25);
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers, t1 = (i + 1.25) / tiers;
    const yTop = top + (bot - top) * t0 * 0.92, yBot = top + (bot - top) * Math.min(1, t1);
    const w = (10 + 26 * Math.min(1, t1)) * s;
    const pts = [[0, yTop]];
    const steps = 4;
    for (let k = 1; k <= steps; k++) pts.push([(w * k) / steps + (k % 2 ? 2 : -1) * s, yTop + ((yBot - yTop) * k) / steps + (k % 2 ? 0 : -4 * s)]);
    pts.push([w * 0.5, yBot + 2 * s], [0, yBot - 1 * s], [-w * 0.5, yBot + 2 * s]);
    for (let k = steps; k >= 1; k--) pts.push([-(w * k) / steps - (k % 2 ? 2 : -1) * s, yTop + ((yBot - yTop) * k) / steps + (k % 2 ? 0 : -4 * s)]);
    const p = poly(pts);
    fillOnly(ctx, p, base);
    within(ctx, p, () => {
      fillOnly(ctx, poly([[2 * s, yTop], [w + 6, yBot + 6], [2 * s, yBot + 6]]), shade);
      fillOnly(ctx, poly([[-3 * s, yTop + 8 * s], [-w * 0.55, yBot - 2 * s], [-w * 0.25, yBot - 6 * s]]), hi);
    });
    strokeOnly(ctx, p, INK_W);
  }
}

export function poplar(ctx, r, { size = 1, base = '#f2a12b' } = {}) {
  const s = size;
  groundShadow(ctx, 4 * s, 0, 14 * s, 5 * s);
  trunk(ctx, 12 * s, 7 * s);
  const p = (c) => {
    c.moveTo(0, -112 * s);
    c.bezierCurveTo(16 * s, -84 * s, 19 * s, -40 * s, 12 * s, -12 * s);
    c.quadraticCurveTo(0, -6 * s, -12 * s, -12 * s);
    c.bezierCurveTo(-19 * s, -40 * s, -16 * s, -84 * s, 0, -112 * s);
    c.closePath();
  };
  blobCluster(ctx, [p], base, {
    sx: 5 * s, sy: 3 * s,
    detail: () => {
      ctx.strokeStyle = tone(base, 0.65); ctx.lineWidth = 1.6;
      for (let i = 0; i < 7; i++) { const y = -96 * s + i * 12 * s; ctx.beginPath(); ctx.moveTo(-4 * s + (i % 2) * 6 * s, y); ctx.quadraticCurveTo(0, y + 6 * s, 6 * s, y + 2 * s); ctx.stroke(); }
    },
  });
}

export function shrub(ctx, r, { size = 1, base = '#58b03a', flowers = null, berries = null } = {}) {
  const s = size;
  groundShadow(ctx, 3 * s, 0, 18 * s, 5 * s, 0.18);
  const blobs = [scallop(0, -11 * s, 17 * s, 12 * s, 8, 3.5 * s, r), scallop(-9 * s, -7 * s, 10 * s, 7 * s, 6, 2.5 * s, r)];
  blobCluster(ctx, blobs, base, {
    sx: 3 * s, sy: 4 * s,
    hiBlobs: [scallop(-6 * s, -17 * s, 6 * s, 4 * s, 5, 1.5 * s, r)],
    detail: () => leafTicks(ctx, r, 0, -11 * s, 14 * s, 8 * s, 3, tone(base, 0.62), 3 * s),
  });
  if (flowers) for (let i = 0; i < 5; i++) flower(ctx, (r() - 0.5) * 26 * s, -6 * s - r() * 14 * s, 3.4 * s, flowers);
  if (berries) for (let i = 0; i < 6; i++) ink(ctx, circle((r() - 0.5) * 24 * s, -5 * s - r() * 14 * s, 2.2 * s), berries, 1.2);
}

export function flower(ctx, x, y, rad, col) {
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    ink(ctx, circle(x + Math.cos(a) * rad * 0.8, y + Math.sin(a) * rad * 0.8, rad * 0.62), col, 1.1);
  }
  ink(ctx, circle(x, y, rad * 0.42), '#ffd84a', 1);
}

export function flowerBush(ctx, r, { size = 1 } = {}) {
  const s = size;
  groundShadow(ctx, 4 * s, 0, 30 * s, 7 * s, 0.18);
  const blobs = [scallop(0, -20 * s, 30 * s, 20 * s, 10, 4.5 * s, r), scallop(-16 * s, -12 * s, 16 * s, 11 * s, 7, 3 * s, r), scallop(16 * s, -11 * s, 16 * s, 11 * s, 7, 3 * s, r)];
  blobCluster(ctx, blobs, '#4caa3c', { sx: 4 * s, sy: 5 * s, detail: () => leafTicks(ctx, r, 0, -18 * s, 26 * s, 14 * s, 8, '#2f7d2c', 3.5 * s) });
  for (let i = 0; i < 9; i++) flower(ctx, (r() - 0.5) * 48 * s, -8 * s - r() * 28 * s, 5 * s, '#f58bb5');
}

export function heather(ctx, r, { size = 1 } = {}) {
  // Bushy heather mound: 3-4 domes, dark-violet shading, pale bloom speckle, olive stems.
  const s = size;
  groundShadow(ctx, 2 * s, 0, 26 * s, 6 * s, 0.16);
  ctx.strokeStyle = '#6d6a2c'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 7 * s; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (r() - 0.5) * 4, -6 * s); ctx.stroke(); }
  const blobs = [
    scallop(-11 * s, -10 * s, 13 * s, 10 * s, 8, 2.6 * s, r, 0.18),
    scallop(9 * s, -11 * s, 14 * s, 11 * s, 8, 2.6 * s, r, 0.18),
    scallop(-1 * s, -18 * s, 13 * s, 10 * s, 8, 2.6 * s, r, 0.18),
  ];
  blobCluster(ctx, blobs, '#9d58bd', {
    lw: 2.2, sx: 3 * s, sy: 4 * s, shade: '#6a347f', hi: '#c48ade',
    hiBlobs: [scallop(-5 * s, -23 * s, 6 * s, 3.5 * s, 6, 1.4 * s, r), scallop(-15 * s, -15 * s, 4 * s, 3 * s, 5, 1 * s, r)],
    detail: () => {
      for (let i = 0; i < 12; i++) fillOnly(ctx, circle((r() - 0.5) * 40 * s, -4 * s - r() * 22 * s, 1.3 * s), '#ecc8f7');
      leafTicks(ctx, r, 0, -12 * s, 20 * s, 9 * s, 5, '#5a2a6e', 2.6 * s);
    },
  });
}

// Faceted cartoon rock. Light facet top-left, dark facet right, ink between.
export function rock(ctx, r, { size = 1, base = '#a7abb2', ripple = false } = {}) {
  const s = size;
  if (ripple) {
    ctx.save(); ctx.strokeStyle = '#e9f8ff'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(2 * s, -1 * s, 30 * s, 9 * s, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(2 * s, 2 * s, 38 * s, 12 * s, 0, 0.3, Math.PI * 0.75); ctx.stroke();
    ctx.restore();
  } else groundShadow(ctx, 4 * s, 0, 24 * s, 6 * s, 0.2);
  const w = 22 * s, h = 24 * s * (0.8 + r() * 0.5);
  const j = () => (r() - 0.5) * 4 * s;
  const pts = [[-w, 0], [-w - 2 * s + j(), -h * 0.45], [-w * 0.55 + j(), -h * 0.9], [-w * 0.05 + j(), -h], [w * 0.5 + j(), -h * 0.8], [w + j(), -h * 0.3], [w * 0.9, 0]];
  const outline = poly(pts);
  const light = tone(base, 1.22), dark = tone(base, 0.72);
  fillOnly(ctx, outline, base);
  within(ctx, outline, () => {
    fillOnly(ctx, poly([[-w * 0.05, -h], [w * 0.05, -h * 0.5], [w * 1.3, -h * 0.2], [w * 1.3, -h * 1.3]]), dark);
    fillOnly(ctx, poly([[w * 0.05, -h * 0.5], [w * 1.3, -h * 0.15], [w * 1.3, 5], [-w, 5], [-w, -h * 0.05]]), tone(base, 0.86));
    fillOnly(ctx, poly([[-w * 0.55, -h * 0.9], [-w * 0.05, -h], [w * 0.05, -h * 0.5], [-w * 0.75, -h * 0.35]]), light);
  });
  strokeOnly(ctx, outline, INK_W);
  strokeOnly(ctx, poly([[-w * 0.05, -h], [w * 0.05, -h * 0.5], [-w * 0.75, -h * 0.35]], false), INK_W2);
  strokeOnly(ctx, poly([[w * 0.05, -h * 0.5], [w * 0.75, -h * 0.18]], false), INK_W2);
}

export function rockCluster(ctx, r, { size = 1, ripple = false } = {}) {
  const s = size;
  ctx.save(); ctx.translate(16 * s, 4 * s); rock(ctx, r, { size: 0.6 * s, ripple }); ctx.restore();
  rock(ctx, r, { size: s, ripple });
  ctx.save(); ctx.translate(-20 * s, 5 * s); rock(ctx, r, { size: 0.5 * s, ripple: false }); ctx.restore();
}

export function mountain(ctx, r, { size = 1, base = '#9fa3ab' } = {}) {
  const s = size;
  groundShadow(ctx, 6 * s, 0, 62 * s, 12 * s, 0.2);
  const peak = (x, h, w) => {
    const pts = [[x - w, 0], [x - w * 0.55, -h * 0.5], [x - w * 0.15, -h * 0.92], [x, -h], [x + w * 0.2, -h * 0.85], [x + w * 0.6, -h * 0.45], [x + w, 0]];
    const p = poly(pts);
    fillOnly(ctx, p, base);
    within(ctx, p, () => {
      fillOnly(ctx, poly([[x, -h], [x + w * 0.05, -h * 0.5], [x - w * 0.1, 2], [x + w * 1.2, 2], [x + w * 1.2, -h]]), tone(base, 0.74));
      fillOnly(ctx, poly([[x - w * 0.15, -h * 0.92], [x, -h], [x + w * 0.05, -h * 0.5], [x - w * 0.5, -h * 0.35]]), tone(base, 1.2));
    });
    strokeOnly(ctx, p, INK_W);
    strokeOnly(ctx, poly([[x, -h], [x + w * 0.05, -h * 0.5], [x - w * 0.1, -h * 0.1]], false), INK_W2);
    strokeOnly(ctx, poly([[x + w * 0.05, -h * 0.5], [x + w * 0.45, -h * 0.25]], false), INK_W2);
  };
  peak(28 * s, 58 * s, 36 * s);
  peak(-10 * s, 92 * s, 46 * s);
  peak(-46 * s, 40 * s, 24 * s);
  ctx.save(); ctx.translate(40 * s, 6 * s); rock(ctx, r, { size: 0.55 * s }); ctx.restore();
}

export function palm(ctx, r, { size = 1, lean = 1 } = {}) {
  const s = size;
  groundShadow(ctx, 8 * s, 0, 26 * s, 7 * s);
  const tx = 14 * s * lean, ty = -120 * s;
  const tp = (c) => { c.moveTo(-6 * s, 0); c.quadraticCurveTo(-4 * s, -70 * s, tx - 4 * s, ty); c.lineTo(tx + 4 * s, ty); c.quadraticCurveTo(6 * s, -70 * s, 6 * s, 0); c.closePath(); };
  ink(ctx, tp, '#a0703e');
  ctx.strokeStyle = '#6d4626'; ctx.lineWidth = 1.5;
  for (let i = 1; i < 12; i++) { const t = i / 12; const y = -t * 118 * s; const x = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * -4 * s + t * t * tx; ctx.beginPath(); ctx.moveTo(x - 5 * s, y); ctx.lineTo(x + 5 * s, y - 2 * s); ctx.stroke(); }
  const leaf = (ang, len) => {
    const ex = tx + Math.cos(ang) * len, ey = ty + Math.sin(ang) * len * 0.75 + len * 0.25;
    const nx = -Math.sin(ang) * 9 * s, ny = Math.cos(ang) * 9 * s;
    const mx = (tx + ex) / 2, my = (ty + ey) / 2 - 10 * s;
    const p = (c) => { c.moveTo(tx, ty); c.quadraticCurveTo(mx + nx, my + ny - 4 * s, ex, ey); c.quadraticCurveTo(mx - nx, my - ny - 4 * s, tx, ty); c.closePath(); };
    fillOnly(ctx, p, '#45a640');
    within(ctx, p, () => {
      ctx.strokeStyle = '#2c7a2f'; ctx.lineWidth = 2;
      for (let k = 1; k < 8; k++) { const t = k / 8; const px = tx + (ex - tx) * t, py = ty + (ey - ty) * t - Math.sin(t * Math.PI) * 10 * s; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + nx * 1.6, py + ny * 1.6 + 4 * s); ctx.stroke(); }
    });
    strokeOnly(ctx, p, INK_W);
    strokeOnly(ctx, (c) => { c.moveTo(tx, ty); c.quadraticCurveTo(mx, my - 4 * s, ex, ey); }, INK_W2);
  };
  [-2.9, -2.2, -1.5, -0.9, -0.25, 0.35, 2.6, 3.4].forEach((a, i) => leaf(a, (52 + (i % 3) * 8) * s));
  ink(ctx, circle(tx, ty + 4 * s, 6 * s), '#7a5230', INK_W2);
}

export function banana(ctx, r, { size = 1 } = {}) {
  const s = size;
  groundShadow(ctx, 4 * s, 0, 26 * s, 6 * s, 0.18);
  const leaf = (ang, len, w) => {
    const ex = Math.cos(ang) * len, ey = -14 * s + Math.sin(ang) * len;
    const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
    const p = (c) => { c.moveTo(0, -4 * s); c.quadraticCurveTo(ex * 0.5 + nx, ey * 0.5 + ny, ex, ey); c.quadraticCurveTo(ex * 0.5 - nx, ey * 0.5 - ny, 0, -4 * s); c.closePath(); };
    fillOnly(ctx, p, '#5cbf3e');
    within(ctx, p, () => { ctx.save(); ctx.translate(nx * 0.35, ny * 0.35); fillOnly(ctx, p, '#3d9a34'); ctx.restore(); });
    strokeOnly(ctx, p, INK_W);
    strokeOnly(ctx, (c) => { c.moveTo(0, -4 * s); c.lineTo(ex * 0.92, ey * 0.92); }, INK_W2);
  };
  leaf(-2.6, 46 * s, 13 * s); leaf(-0.5, 46 * s, 13 * s); leaf(-1.9, 54 * s, 14 * s); leaf(-1.2, 56 * s, 14 * s); leaf(-3.0, 34 * s, 10 * s); leaf(-0.15, 34 * s, 10 * s);
}

export function chiliVine(ctx, r, { size = 1 } = {}) {
  const s = size;
  groundShadow(ctx, 4 * s, 0, 26 * s, 7 * s, 0.2);
  const stake = (x) => { ink(ctx, poly([[x - 2.5 * s, 2 * s], [x - 2.5 * s, -80 * s], [x + 2.5 * s, -80 * s], [x + 2.5 * s, 2 * s]]), '#a6763f', 2); };
  stake(-14 * s); stake(14 * s);
  ink(ctx, poly([[-17 * s, -62 * s], [17 * s, -66 * s], [17 * s, -61 * s], [-17 * s, -57 * s]]), '#a6763f', 2);
  const blobs = [scallop(-10 * s, -50 * s, 14 * s, 18 * s, 8, 3.5 * s, r), scallop(10 * s, -46 * s, 14 * s, 20 * s, 8, 3.5 * s, r), scallop(0, -24 * s, 16 * s, 16 * s, 8, 3.5 * s, r)];
  blobCluster(ctx, blobs, '#3f9e36', { sx: 3 * s, sy: 4 * s, hiBlobs: [scallop(-12 * s, -58 * s, 6 * s, 5 * s, 5, 1.5 * s, r)] });
  for (let i = 0; i < 14; i++) {
    const x = (r() - 0.5) * 34 * s, y = -16 * s - r() * 46 * s;
    const p = (c) => { c.moveTo(x - 2 * s, y); c.quadraticCurveTo(x - 3 * s, y + 9 * s, x + 1 * s, y + 13 * s); c.quadraticCurveTo(x + 3 * s, y + 6 * s, x + 2 * s, y); c.closePath(); };
    ink(ctx, p, '#d9261c', 1.2);
  }
  stake(-14 * s);
}

export function fern(ctx, r, { size = 1, base = '#4caf3f' } = {}) {
  const s = size;
  for (const [a, l] of [[-2.5, 18], [-1.9, 22], [-1.25, 22], [-0.6, 18]]) {
    const ex = Math.cos(a) * l * s, ey = Math.sin(a) * l * s;
    const nx = -Math.sin(a) * 4 * s, ny = Math.cos(a) * 4 * s;
    ink(ctx, (c) => { c.moveTo(0, 0); c.quadraticCurveTo(ex / 2 + nx, ey / 2 + ny, ex, ey); c.quadraticCurveTo(ex / 2 - nx, ey / 2 - ny, 0, 0); }, base, 1.8);
  }
}

// Low dry-stone terrace wall (apple wild tile), runs along iso x axis.
export function terraceWall(ctx, r, { len = 120 } = {}) {
  const dx = 0.866, dy = 0.5;
  const P = (t, h) => [t * dx, t * dy - h];
  const L = len, H = 16, T = 10;
  ink(ctx, poly([P(0, H), P(L, H), [L * dx - T * dx, L * dy + T * dy - H], [-T * dx, T * dy - H]]), '#c9c6bd');
  ink(ctx, poly([[-T * dx, T * dy - H], [L * dx - T * dx, L * dy + T * dy - H], [L * dx - T * dx, L * dy + T * dy], [-T * dx, T * dy]]), '#a19d94');
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  for (let row = 0; row < 2; row++) {
    for (let t = (row ? 6 : 0); t < L; t += 12) {
      const a = [t * dx - T * dx, t * dy + T * dy - H + row * 8], b = [(t + 11) * dx - T * dx, (t + 11) * dy + T * dy - H + row * 8];
      ctx.beginPath(); ctx.roundRect(Math.min(a[0], b[0]), a[1], Math.abs(b[0] - a[0]), 7, 2.5); ctx.stroke();
    }
  }
}

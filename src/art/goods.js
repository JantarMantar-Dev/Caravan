// Goods icons + caravan wagons (the "badge" layer of the art direction).
import { INK, INK_W, INK_W2, ink, fillOnly, strokeOnly, within, poly, circle, ellipse, iso, tone, scallop, groundShadow } from './ink.js';
import { blobCluster, apple } from './nature.js';
import { box, PAL, fishShape } from './buildings.js';

export const GOODS = ['fish', 'apple', 'wool', 'spice'];

// ---------- icons (front view, chunky) ----------
export function fishIcon(ctx, r, { s = 1 } = {}) {
  ctx.save(); ctx.scale(s, s);
  groundShadow(ctx, 0, 4, 60, 8, 0.12);
  const body = (c) => { c.moveTo(-74, -46); c.bezierCurveTo(-60, -84, 10, -92, 52, -56); c.lineTo(80, -84); c.quadraticCurveTo(74, -52, 84, -14); c.lineTo(52, -38); c.bezierCurveTo(14, -6, -52, -6, -74, -46); c.closePath(); };
  // fins
  ink(ctx, (c) => { c.moveTo(-20, -80); c.quadraticCurveTo(-6, -104, 26, -100); c.quadraticCurveTo(18, -84, 16, -72); c.closePath(); }, '#6f9ac2');
  ink(ctx, (c) => { c.moveTo(-6, -18); c.quadraticCurveTo(0, 4, 20, 2); c.quadraticCurveTo(14, -10, 16, -22); c.closePath(); }, '#6f9ac2');
  fillOnly(ctx, body, '#a9c4dc');
  within(ctx, body, () => {
    fillOnly(ctx, (c) => { c.moveTo(-80, -40); c.bezierCurveTo(-40, -30, 20, -36, 90, -40); c.lineTo(90, 0); c.lineTo(-80, 0); c.closePath(); }, '#e7eef4');
    fillOnly(ctx, (c) => { c.moveTo(-80, -100); c.lineTo(90, -100); c.lineTo(90, -66); c.bezierCurveTo(20, -64, -40, -70, -80, -60); c.closePath(); }, '#7fa6c9');
    const rr = r; for (let i = 0; i < 16; i++) fillOnly(ctx, circle(-30 + rr() * 74, -66 + rr() * 22, 1.6), '#5c86ad');
  });
  strokeOnly(ctx, body, INK_W * 1.6);
  ink(ctx, (c) => { c.moveTo(-44, -26); c.quadraticCurveTo(-30, -34, -26, -50); c.quadraticCurveTo(-48, -44, -44, -26); }, '#8fb2d2', INK_W);
  strokeOnly(ctx, (c) => { c.moveTo(-52, -70); c.quadraticCurveTo(-36, -52, -48, -28); }, INK_W);
  ink(ctx, circle(-60, -56, 7), '#f6d24a', INK_W);
  fillOnly(ctx, circle(-60, -56, 3.4), INK);
  strokeOnly(ctx, (c) => { c.moveTo(-76, -42); c.lineTo(-66, -40); }, INK_W);
  ctx.restore();
}

export function appleIcon(ctx, r, { s = 1 } = {}) {
  ctx.save(); ctx.scale(s, s);
  groundShadow(ctx, 0, 4, 50, 8, 0.12);
  const body = (c) => { c.moveTo(0, -96); c.bezierCurveTo(30, -116, 70, -96, 64, -52); c.bezierCurveTo(60, -10, 26, 6, 0, -6); c.bezierCurveTo(-26, 6, -60, -10, -64, -52); c.bezierCurveTo(-70, -96, -30, -116, 0, -96); c.closePath(); };
  fillOnly(ctx, body, '#e3221d');
  within(ctx, body, () => {
    fillOnly(ctx, (c) => { c.moveTo(20, -110); c.bezierCurveTo(80, -90, 70, 0, 10, 0); c.bezierCurveTo(50, -20, 60, -70, 20, -110); }, '#b3140f');
    fillOnly(ctx, ellipse(-34, -70, 9, 16, 0.5), '#ff8f80');
    fillOnly(ctx, circle(-24, -86, 4), '#ffd6cc');
  });
  strokeOnly(ctx, body, INK_W * 1.6);
  ink(ctx, (c) => { c.moveTo(-3, -98); c.quadraticCurveTo(-6, -122, -14, -132); c.lineTo(-8, -136); c.quadraticCurveTo(2, -122, 4, -98); c.closePath(); }, '#7a4a28', INK_W);
  const leaf = (c) => { c.moveTo(2, -112); c.bezierCurveTo(14, -142, 44, -144, 58, -134); c.bezierCurveTo(44, -112, 20, -106, 2, -112); c.closePath(); };
  fillOnly(ctx, leaf, '#54b33c');
  within(ctx, leaf, () => fillOnly(ctx, (c) => { c.moveTo(2, -112); c.bezierCurveTo(20, -120, 40, -128, 60, -134); c.lineTo(60, -100); c.lineTo(0, -100); }, '#3a8c2c'));
  strokeOnly(ctx, leaf, INK_W * 1.4);
  ctx.restore();
}

export function woolIcon(ctx, r, { s = 1 } = {}) {
  ctx.save(); ctx.scale(s, s);
  groundShadow(ctx, 6, 2, 76, 12, 0.15);
  const blobs = [scallop(0, -62, 82, 58, 22, 7, r, 0.05)];
  blobCluster(ctx, blobs, '#f6efdc', {
    lw: INK_W * 1.6, sx: 10, sy: 10, shade: '#ddd0b2',
    detail: () => { ctx.strokeStyle = '#c9b993'; ctx.lineWidth = 2; for (let i = 0; i < 18; i++) { const x = -60 + r() * 120, y = -100 + r() * 76; ctx.beginPath(); ctx.arc(x, y, 6 + r() * 3, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); } },
  });
  ctx.lineCap = 'round';
  // rope: vertical band + bow
  const rope = (path) => { strokeOnly(ctx, path, 9, INK); strokeOnly(ctx, path, 5.5, '#3f62a8'); };
  rope((c) => { c.moveTo(-4, -118); c.quadraticCurveTo(4, -60, -2, -6); });
  rope((c) => { c.moveTo(-4, -116); c.bezierCurveTo(-30, -136, -36, -110, -6, -114); });
  rope((c) => { c.moveTo(-2, -116); c.bezierCurveTo(26, -138, 34, -108, 2, -112); });
  rope((c) => { c.moveTo(-4, -114); c.quadraticCurveTo(-20, -100, -22, -88); });
  ctx.restore();
}

export function sackShape(ctx, s = 1) {
  const body = (c) => { c.moveTo(-34 * s, -78 * s); c.bezierCurveTo(-56 * s, -50 * s, -66 * s, -6 * s, -30 * s, 0); c.lineTo(30 * s, 0); c.bezierCurveTo(66 * s, -6 * s, 56 * s, -50 * s, 34 * s, -78 * s); c.closePath(); };
  fillOnly(ctx, body, '#e0b057');
  within(ctx, body, () => { fillOnly(ctx, (c) => { c.moveTo(20 * s, -80 * s); c.bezierCurveTo(60 * s, -40 * s, 50 * s, 0, 20 * s, 4 * s); c.lineTo(70 * s, 4 * s); c.lineTo(70 * s, -80 * s); }, '#b9873b'); });
  strokeOnly(ctx, body, INK_W * 1.4);
  ink(ctx, (c) => { c.moveTo(-38 * s, -78 * s); c.quadraticCurveTo(-48 * s, -104 * s, -30 * s, -102 * s); c.quadraticCurveTo(0, -98 * s, 30 * s, -102 * s); c.quadraticCurveTo(48 * s, -104 * s, 38 * s, -78 * s); c.closePath(); }, '#e9bf68', INK_W * 1.4);
  ink(ctx, ellipse(0, -94 * s, 30 * s, 7 * s), '#d6371f', INK_W);
  within(ctx, ellipse(0, -94 * s, 30 * s, 7 * s), () => { for (let i = 0; i < 20; i++) fillOnly(ctx, circle((Math.sin(i * 7.1) * 26) * s, (-94 + Math.cos(i * 3.3) * 5) * s, 1.5 * s), '#a61f12'); });
  ink(ctx, (c) => { c.moveTo(-38 * s, -76 * s); c.quadraticCurveTo(0, -68 * s, 38 * s, -76 * s); c.lineTo(38 * s, -70 * s); c.quadraticCurveTo(0, -62 * s, -38 * s, -70 * s); c.closePath(); }, '#9a6a30', INK_W2);
  ink(ctx, (c) => { c.moveTo(36 * s, -72 * s); c.quadraticCurveTo(52 * s, -64 * s, 44 * s, -48 * s); c.quadraticCurveTo(54 * s, -70 * s, 36 * s, -76 * s); }, '#9a6a30', INK_W2);
}

export function chili(ctx, x, y, len, rot, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const body = (c) => { c.moveTo(0, -7 * s); c.bezierCurveTo(len * 0.5, -11 * s, len * 0.9, -4 * s, len, 6 * s); c.bezierCurveTo(len * 0.8, 4 * s, len * 0.5, 8 * s, 0, 7 * s); c.quadraticCurveTo(-4 * s, 0, 0, -7 * s); c.closePath(); };
  fillOnly(ctx, body, '#e0261c');
  within(ctx, body, () => { fillOnly(ctx, (c) => { c.moveTo(0, 2 * s); c.bezierCurveTo(len * 0.5, 4 * s, len * 0.8, 2 * s, len, 8 * s); c.lineTo(len, 20 * s); c.lineTo(0, 20 * s); }, '#aa140f'); fillOnly(ctx, ellipse(len * 0.35, -4 * s, len * 0.18, 1.8 * s, 0), '#ff8a7a'); });
  strokeOnly(ctx, body, INK_W * 1.2);
  ink(ctx, (c) => { c.moveTo(2 * s, -5 * s); c.quadraticCurveTo(-8 * s, -8 * s, -10 * s, -16 * s); c.lineTo(-6 * s, -17 * s); c.quadraticCurveTo(-4 * s, -9 * s, 2 * s, 3 * s); c.closePath(); }, '#3f9a36', INK_W2);
  ctx.restore();
}

export function spiceIcon(ctx, r, { s = 1 } = {}) {
  ctx.save(); ctx.scale(s, s);
  groundShadow(ctx, 20, 4, 80, 10, 0.12);
  ctx.save(); ctx.translate(-14, 0); sackShape(ctx, 1); ctx.restore();
  chili(ctx, 0, -20, 74, -0.32, 1.25);
  chili(ctx, 10, -6, 76, -0.28, 1.25);
  chili(ctx, 26, 6, 70, -0.36, 1.2);
  ctx.restore();
}

// ---------- caravan wagon (rounded cartoon cart) ----------
// Iso body, wheels as projected circles, tow bar with ring.
export function wagon(ctx, r, { cargo = null, s = 1, mir = false } = {}) {
  const P = iso(0, 0, s, mir);
  const L = 62, D = 36, Z = 14, H = 22;
  const x0 = -L / 2, x1 = L / 2, y0 = -D / 2, y1 = D / 2;
  groundShadow(ctx, 0, 4 * s, 46 * s, 13 * s, 0.13);
  const wheel = (x, y, rad, near) => {
    const pts = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push(P(x + Math.cos(a) * rad, y, rad + Math.sin(a) * rad)); }
    const tire = poly(pts);
    ink(ctx, tire, '#2b2725', INK_W * 1.2);
    const inner = poly(pts.map(([px, py]) => { const c = P(x, y, rad); return [c[0] + (px - c[0]) * 0.62, c[1] + (py - c[1]) * 0.62]; }));
    ink(ctx, inner, near ? '#4a4542' : '#3a3633', INK_W2);
    const c = P(x, y, rad);
    ink(ctx, ellipse(c[0], c[1], rad * 0.28 * s, rad * 0.32 * s), '#7c7672', INK_W2);
    fillOnly(ctx, circle(c[0] - 1.5 * s, c[1] - 1.5 * s, rad * 0.08 * s), '#c9c4bf');
  };
  // far wheels
  wheel(x0 + 12, y0 + 2, 10, false);
  wheel(x1 - 12, y0 + 2, 10, false);
  // chassis
  box(ctx, P, mir, x0 + 4, y0 + 4, Z - 4, L - 8, D - 8, 4, '#3a3532', { top: '#2b2725', lw: INK_W2 });
  // tow bar + ring (towards +x)
  box(ctx, P, mir, x1 - 2, -2, Z - 4, 16, 4, 3, '#3a3532', { top: '#57504b', lw: INK_W2 });
  const ring = P(x1 + 18, 0, Z - 3);
  ink(ctx, ellipse(ring[0], ring[1], 5 * s, 4 * s), null, INK_W * 1.4);
  strokeOnly(ctx, ellipse(ring[0], ring[1], 5 * s, 4 * s), 2.4 * s, '#57504b');
  // body: back wall interior visible, then cargo, then front walls
  const red = '#d9322b', redShade = '#a8211d', redTop = '#e9584a';
  ink(ctx, poly([P(x0, y0, Z), P(x1, y0, Z), P(x1, y0, Z + H), P(x0, y0, Z + H)]), redShade);
  ink(ctx, poly([P(x0, y0, Z), P(x0, y1, Z), P(x0, y1, Z + H), P(x0, y0, Z + H)]), tone(redShade, 0.9));
  ink(ctx, poly([P(x0, y0, Z + 1), P(x1, y0, Z + 1), P(x1, y1, Z + 1), P(x0, y1, Z + 1)]), '#7b2b22', INK_W2);
  if (cargo) cargo(ctx, P, { x0, x1, y0, y1, Z, H, s });
  const fy = poly([P(x0, y1, Z), P(x1, y1, Z), P(x1, y1, Z + H), P(x0, y1, Z + H)]);
  const fx = poly([P(x1, y1, Z), P(x1, y0, Z), P(x1, y0, Z + H), P(x1, y1, Z + H)]);
  for (const [f, col, a, b, len] of [[fy, mir ? redShade : red, (u, v) => P(x0 + u, y1, Z + v), null, L], [fx, mir ? red : redShade, (u, v) => P(x1, y1 - u, Z + v), null, D]]) {
    fillOnly(ctx, f, col);
    within(ctx, f, () => {
      ctx.strokeStyle = tone(col, 0.7); ctx.lineWidth = 1.6 * s;
      for (const v of [H * 0.36, H * 0.68]) { ctx.beginPath(); ctx.moveTo(...a(0, v)); ctx.lineTo(...a(len, v)); ctx.stroke(); }
      for (const u of len > 40 ? [3, len / 2, len - 3] : [3, len - 3]) { const q = [a(u - 2.2, 0), a(u + 2.2, 0), a(u + 2.2, H), a(u - 2.2, H)]; fillOnly(ctx, poly(q), tone(col, 0.86)); strokeOnly(ctx, poly(q), 1.2 * s); }
      fillOnly(ctx, poly([a(0, H - 3), a(len, H - 3), a(len, H), a(0, H)]), tone(col, 1.18));
    });
    strokeOnly(ctx, f, INK_W * s * 0.9);
  }
  // rim on top edges
  ink(ctx, poly([P(x0, y1, Z + H), P(x1, y1, Z + H), P(x1, y0, Z + H), P(x1 - 3, y0, Z + H), P(x1 - 3, y1 - 3, Z + H), P(x0, y1 - 3, Z + H)]), redTop, INK_W2 * s);
  // near wheels
  wheel(x0 + 12, y1 + 2, 10, true);
  wheel(x1 - 12, y1 + 2, 10, true);
}

export const CARGO = {
  fish: (ctx, P, g) => cargoCrate(ctx, P, g, (c, cx, cy, s) => { for (let i = 0; i < 2; i++) fishShape(c, cx - 2 * s + i * 4 * s, cy - 3 * s + i * 7 * s, 16 * s, 5 * s, -0.42, '#a3bdd5'); }),
  apple: (ctx, P, g) => cargoCrate(ctx, P, g, (c, cx, cy, s) => { for (const [dx, dy] of [[-9, -4], [4, -6], [-3, 3], [10, 2]]) apple(c, cx + dx * s, cy + dy * s, 7 * s); }),
  wool: (ctx, P, g, r = Math.random) => {
    const c = P((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, g.Z + g.H + 2);
    ctx.save(); ctx.translate(c[0], c[1] + 14 * g.s); ctx.scale(0.38 * g.s, 0.38 * g.s); woolIcon(ctx, mkR(7)); ctx.restore();
  },
  spice: (ctx, P, g) => {
    const c = P((g.x0 + g.x1) / 2 + 4, (g.y0 + g.y1) / 2, g.Z + 6);
    ctx.save(); ctx.translate(c[0] - 8, c[1]); sackShape(ctx, 0.33); ctx.restore();
    chili(ctx, c[0] + 4, c[1] - 14, 26, -0.45, 0.42);
    chili(ctx, c[0] + 10, c[1] - 8, 26, -0.4, 0.42);
  },
};

function mkR(seed) { let a = seed; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; }

function cargoCrate(ctx, P, g, fill) {
  const { x0, x1, y0, y1, Z, H, s } = g;
  const bx = x0 + 10, by = y0 + 6, bw = x1 - x0 - 20, bd = y1 - y0 - 12, bz = Z + H - 10, bh = 16;
  const top = poly([P(bx, by, bz + bh), P(bx + bw, by, bz + bh), P(bx + bw, by + bd, bz + bh), P(bx, by + bd, bz + bh)]);
  ink(ctx, poly([P(bx, by + bd, bz), P(bx + bw, by + bd, bz), P(bx + bw, by + bd, bz + bh), P(bx, by + bd, bz + bh)]), PAL.woodLight, INK_W * 0.8 * s);
  ink(ctx, poly([P(bx + bw, by + bd, bz), P(bx + bw, by, bz), P(bx + bw, by, bz + bh), P(bx + bw, by + bd, bz + bh)]), PAL.wood, INK_W * 0.8 * s);
  ink(ctx, top, '#6b4526', INK_W * 0.8 * s);
  const inner = poly([P(bx + 3, by + 3, bz + bh), P(bx + bw - 3, by + 3, bz + bh), P(bx + bw - 3, by + bd - 3, bz + bh), P(bx + 3, by + bd - 3, bz + bh)]);
  ink(ctx, inner, '#4a2f1a', INK_W2 * s);
  const c = P(bx + bw / 2, by + bd / 2, bz + bh);
  fill(ctx, c[0], c[1], s);
}

// Isometric cartoon buildings and props. All anchored at footprint centre on the ground.
import { INK, INK_W, INK_W2, ink, fillOnly, strokeOnly, within, poly, circle, ellipse, iso, lerp2, tone, groundShadow, scallop } from './ink.js';
import { apple, blobCluster } from './nature.js';

export const PAL = {
  wall: '#f4e8cf', wallShade: '#d8c4a0',
  stone: '#b9b5ab', stoneShade: '#8f8b82',
  wood: '#a7703c', woodShade: '#7c4f28', woodLight: '#c99358',
  roofRed: '#d8473a', roofSlate: '#4e72aa', roofThatch: '#e0b347',
  glass: '#33465a', door: '#8a4f2a',
};

// Box with the screen-left face lit and the screen-right face shaded.
export function box(ctx, P, mir, x, y, z, dx, dy, dz, col, opts = {}) {
  const lit = opts.lit ?? col, shade = opts.shade ?? tone(col, 0.8), top = opts.top ?? tone(col, 1.12);
  const x1 = x + dx, y1 = y + dy, z1 = z + dz;
  const fy = poly([P(x, y1, z), P(x1, y1, z), P(x1, y1, z1), P(x, y1, z1)]);
  const fx = poly([P(x1, y1, z), P(x1, y, z), P(x1, y, z1), P(x1, y1, z1)]);
  const ft = poly([P(x, y, z1), P(x1, y, z1), P(x1, y1, z1), P(x, y1, z1)]);
  const lw = opts.lw ?? INK_W;
  ink(ctx, fy, mir ? shade : lit, lw);
  ink(ctx, fx, mir ? lit : shade, lw);
  if (!opts.noTop) ink(ctx, ft, top, lw);
  return { fy, fx, ft };
}

// Map face-local (u along face left->right on screen, v up) to screen.
const faceY = (P, x0, y1) => (u, v) => P(x0 + u, y1, v);
const faceX = (P, x1, y1) => (u, v) => P(x1, y1 - u, v);

function windowOn(ctx, F, u, v, w, h, opts = {}) {
  const frame = poly([F(u - 2, v - 2), F(u + w + 2, v - 2), F(u + w + 2, v + h + 2), F(u - 2, v + h + 2)]);
  ink(ctx, frame, opts.frame ?? '#f9f2e2', INK_W2);
  const g = poly([F(u, v), F(u + w, v), F(u + w, v + h), F(u, v + h)]);
  ink(ctx, g, PAL.glass, INK_W2);
  fillOnly(ctx, poly([F(u + 1, v + h * 0.55), F(u + w * 0.45, v + h - 1), F(u + 1, v + h - 1)]), '#6d8aa6');
  strokeOnly(ctx, poly([F(u + w / 2, v), F(u + w / 2, v + h)], false), 1.3);
  strokeOnly(ctx, poly([F(u, v + h / 2), F(u + w, v + h / 2)], false), 1.3);
  if (opts.shutters) {
    ink(ctx, poly([F(u - 7, v), F(u - 2, v), F(u - 2, v + h), F(u - 7, v + h)]), opts.shutters, INK_W2);
    ink(ctx, poly([F(u + w + 2, v), F(u + w + 7, v), F(u + w + 7, v + h), F(u + w + 2, v + h)]), opts.shutters, INK_W2);
  }
}

function doorOn(ctx, F, u, w, h, col = PAL.door) {
  const pts = [F(u, 0), F(u + w, 0), F(u + w, h - w / 2)];
  for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; pts.push(F(u + w / 2 + Math.cos(a) * w / 2, h - w / 2 + Math.sin(a) * w / 2)); }
  pts.push(F(u, h - w / 2));
  ink(ctx, poly(pts), col, INK_W);
  strokeOnly(ctx, poly([F(u + w / 2, 0), F(u + w / 2, h - 1)], false), 1.2, tone(col, 0.6));
  fillOnly(ctx, circle(...F(u + w * 0.75, h * 0.42), 1.4), '#f2d27a');
}

function tileLines(ctx, A, B, C, D, rows, col, ticks = true) {
  // quad A(eave-left) B(eave-right) C(ridge-right) D(ridge-left)
  ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  for (let i = 1; i < rows; i++) {
    const t = i / rows;
    const p = lerp2(A, D, t), q = lerp2(B, C, t);
    ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
    if (ticks) {
      const n = 9;
      for (let k = 0; k < n; k++) {
        const s0 = (k + (i % 2) * 0.5) / n; if (s0 > 1) continue;
        const a = lerp2(p, q, s0), b = lerp2(lerp2(A, D, t - 1 / rows), lerp2(B, C, t - 1 / rows), s0);
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...lerp2(a, b, 0.55)); ctx.stroke();
      }
    }
  }
}

// Gabled cottage. Ridge along x; gable on the +x face.
export function house(ctx, r, o = {}) {
  const w = o.w ?? 58, d = o.d ?? 44, h = o.h ?? 34, rh = o.rh ?? 30, ov = o.ov ?? 6;
  const mir = !!o.mir;
  const wall = o.wall ?? PAL.wall, roof = o.roof ?? PAL.roofRed;
  const P = iso(0, 0, 1, mir);
  const x0 = -w / 2, x1 = w / 2, y0 = -d / 2, y1 = d / 2, hd = d / 2;
  const lit = (a, b) => (mir ? b : a);
  groundShadow(ctx, 0, 6, (w + d) * 0.62, (w + d) * 0.26, 0.2);
  const roofDark = tone(roof, 0.72), roofLight = roof;
  const k = rh / hd; // roof slope
  const eaveZ = h - ov * k;
  // back slope verge (only a sliver shows)
  ink(ctx, poly([P(x1 + ov, 0, h + rh), P(x1 + ov, y0 - ov, eaveZ), P(x1 + ov, y0 - ov, eaveZ - 4), P(x1 + ov, 0, h + rh - 4)]), roofDark);
  ink(ctx, poly([P(x0 - ov, 0, h + rh), P(x1 + ov, 0, h + rh), P(x1 + ov, y0 - ov, eaveZ), P(x0 - ov, y0 - ov, eaveZ)]), roofDark);
  // stone plinth
  if (o.plinth !== false) {
    ink(ctx, poly([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, 6), P(x0, y1, 6)]), lit(PAL.stone, PAL.stoneShade));
    ink(ctx, poly([P(x1, y1, 0), P(x1, y0, 0), P(x1, y0, 6), P(x1, y1, 6)]), lit(PAL.stoneShade, PAL.stone));
  }
  const zb = o.plinth !== false ? 6 : 0;
  const wy = poly([P(x0, y1, zb), P(x1, y1, zb), P(x1, y1, h), P(x0, y1, h)]);
  const wx = poly([P(x1, y1, zb), P(x1, y0, zb), P(x1, y0, h), P(x1, 0, h + rh), P(x1, y1, h)]);
  ink(ctx, wy, lit(wall, tone(wall, 0.84)));
  ink(ctx, wx, lit(tone(wall, 0.84), wall));
  if (o.timber) {
    const F1 = faceY(P, x0, y1), F2 = faceX(P, x1, y1);
    const beam = o.timber;
    ctx.lineWidth = 3.2; ctx.strokeStyle = beam; ctx.lineCap = 'butt';
    for (const F of [[F1, w], [F2, d]]) {
      const [f, L] = F;
      [[0, h - 2, L, h - 2], [0, zb + 2, L, zb + 2], [3, zb, 3, h], [L - 3, zb, L - 3, h], [L / 2, zb, L / 2, h]].forEach(([a, b, c, e]) => { ctx.beginPath(); ctx.moveTo(...f(a, b)); ctx.lineTo(...f(c, e)); ctx.stroke(); });
    }
  }
  // gable decoration: small round window
  if (o.gableWindow !== false) {
    const g = P(x1, 0, h + rh * 0.42);
    ink(ctx, ellipse(g[0], g[1], 3.4, 4.6, 0), PAL.glass, INK_W2);
  }
  // front slope
  const A = P(x0 - ov, y1 + ov, eaveZ), B = P(x1 + ov, y1 + ov, eaveZ), C = P(x1 + ov, 0, h + rh), D = P(x0 - ov, 0, h + rh);
  const slope = poly([A, B, C, D]);
  fillOnly(ctx, slope, lit(roofLight, tone(roof, 0.86)));
  within(ctx, slope, () => {
    tileLines(ctx, A, B, C, D, o.tileRows ?? 5, tone(roof, 0.62), o.ticks !== false);
    if (o.thatch) { ctx.strokeStyle = tone(roof, 0.7); ctx.lineWidth = 1.2; for (let i = 0; i < 26; i++) { const t = i / 26; const a = lerp2(A, B, t), b = lerp2(D, C, t); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...lerp2(a, b, 0.3)); ctx.stroke(); } }
  });
  strokeOnly(ctx, slope, INK_W);
  // verge band on gable side + ridge cap
  ink(ctx, poly([B, C, [C[0], C[1] + 4], [B[0], B[1] + 4]]), roofDark, INK_W);
  ink(ctx, poly([D, C, [C[0] + (mir ? 2 : -2), C[1] - 3], [D[0] + (mir ? 2 : -2), D[1] - 3]]), tone(roof, 0.8), INK_W2);
  // chimney
  if (o.chimney !== false) {
    const cx = x0 + w * (o.chimneyAt ?? 0.22), cy = -d * 0.18;
    const zr = h + rh * (1 - Math.abs(cy) / hd);
    const bx = box(ctx, P, mir, cx - 5, cy - 5, zr - 8, 10, 10, h + rh + 12 - (zr - 8), PAL.stone, { shade: PAL.stoneShade, top: '#d9d5cc' });
    box(ctx, P, mir, cx - 6.5, cy - 6.5, h + rh + 12, 13, 13, 3, '#8d8981', { top: '#4c4842' });
    if (o.smoke) {
      const t = P(cx, cy, h + rh + 18);
      for (let i = 0; i < 3; i++) ink(ctx, circle(t[0] + i * 5, t[1] - i * 9, 5 + i * 1.5), '#f4f4f0', INK_W2);
    }
  }
  // door + windows
  const Fy = faceY(P, x0, y1), Fx = faceX(P, x1, y1);
  const doorFace = o.doorOn === 'x' ? Fx : Fy;
  const L = o.doorOn === 'x' ? d : w;
  doorOn(ctx, doorFace, L * (o.doorAt ?? 0.62) - 6, 12, 22, o.doorCol ?? PAL.door);
  const sh = o.shutters ?? null;
  if (o.doorOn === 'x') { windowOn(ctx, Fy, w * 0.2, 14, 9, 11, { shutters: sh }); windowOn(ctx, Fy, w * 0.62, 14, 9, 11, { shutters: sh }); windowOn(ctx, Fx, d * 0.18, 15, 7, 10, { shutters: sh }); }
  else { windowOn(ctx, Fy, w * 0.18, 15, 9, 11, { shutters: sh }); windowOn(ctx, Fx, d * 0.35, 15, 9, 11, { shutters: sh }); }
  if (o.extra) o.extra(ctx, P, { x0, x1, y0, y1, h, rh });
}

// Open-fronted barn: big gable, dark opening full of crates.
export function barn(ctx, r, o = {}) {
  const w = o.w ?? 70, d = o.d ?? 56, h = o.h ?? 36;
  const mir = !!o.mir;
  house(ctx, r, {
    w, d, h, rh: o.rh ?? 34, ov: 7, mir, roof: o.roof ?? PAL.roofRed, wall: '#efe0c0', chimney: false,
    timber: PAL.woodShade, gableWindow: false, doorOn: 'y', doorAt: 2, doorCol: PAL.door, plinth: false,
    extra: (c, P) => {
      // big opening on +x gable face
      const F = faceX(P, w / 2, d / 2);
      const op = poly([F(d * 0.18, 0), F(d * 0.82, 0), F(d * 0.82, h * 0.85), F(d * 0.18, h * 0.85)]);
      ink(c, op, '#3b2a20');
      within(c, op, () => {
        for (let i = 0; i < 3; i++) {
          const u = d * 0.22 + i * d * 0.2;
          const q = poly([F(u, 0), F(u + d * 0.17, 0), F(u + d * 0.17, 11), F(u, 11)]);
          ink(c, q, PAL.woodLight, INK_W2);
          for (let k = 0; k < 3; k++) { const p = F(u + 3 + k * 4.5, 12); if (o.goods === 'apple') apple(c, p[0], p[1], 2.6); }
        }
      });
      strokeOnly(c, op, INK_W);
      // post beams around the opening
      c.lineWidth = 3.6; c.strokeStyle = PAL.woodShade;
      [[d * 0.18, 0, d * 0.18, h * 0.85], [d * 0.82, 0, d * 0.82, h * 0.85], [d * 0.12, h * 0.88, d * 0.88, h * 0.88]].forEach(([a, b, e, f]) => { c.beginPath(); c.moveTo(...F(a, b)); c.lineTo(...F(e, f)); c.stroke(); });
    },
  });
}

// Open shed on posts (shearing shed / drying shed).
export function shed(ctx, r, o = {}) {
  const w = o.w ?? 70, d = o.d ?? 44, h = o.h ?? 30, rh = o.rh ?? 20, ov = 5;
  const mir = !!o.mir; const P = iso(0, 0, 1, mir);
  const roof = o.roof ?? PAL.roofSlate;
  const x0 = -w / 2, x1 = w / 2, y0 = -d / 2, y1 = d / 2;
  groundShadow(ctx, 0, 4, (w + d) * 0.6, (w + d) * 0.24, 0.22);
  // floor
  ink(ctx, poly([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)]), '#d9c08d', INK_W2);
  // back posts
  for (const [x, y] of [[x0 + 3, y0 + 3], [x1 - 3, y0 + 3]]) box(ctx, P, mir, x - 2, y - 2, 0, 4, 4, h, PAL.wood, { lw: 2 });
  if (o.contents) o.contents(ctx, P);
  for (const [x, y] of [[x0 + 3, y1 - 3], [x1 - 3, y1 - 3], [0, y1 - 3]]) box(ctx, P, mir, x - 2, y - 2, 0, 4, 4, h, PAL.wood, { lw: 2 });
  const k = rh / (d / 2), eaveZ = h - ov * k;
  const A = P(x0 - ov, y1 + ov, eaveZ), B = P(x1 + ov, y1 + ov, eaveZ), C = P(x1 + ov, 0, h + rh), D = P(x0 - ov, 0, h + rh);
  ink(ctx, poly([C, P(x1 + ov, y0 - ov, eaveZ), P(x1 + ov, y0 - ov, eaveZ - 4), [C[0], C[1] + 4]]), tone(roof, 0.65));
  // gable underside (dark)
  ink(ctx, poly([P(x1, y1, h), P(x1, 0, h + rh - 2), P(x1, y0, h)]), tone(roof, 0.45), INK_W2);
  const slope = poly([A, B, C, D]);
  fillOnly(ctx, slope, mir ? tone(roof, 0.86) : roof);
  within(ctx, slope, () => tileLines(ctx, A, B, C, D, 4, tone(roof, 0.62), true));
  strokeOnly(ctx, slope);
  ink(ctx, poly([B, C, [C[0], C[1] + 4], [B[0], B[1] + 4]]), tone(roof, 0.7));
}

// Market stall with striped awning.
export function stall(ctx, r, o = {}) {
  const w = o.w ?? 40, d = o.d ?? 22, h = o.h ?? 30;
  const mir = !!o.mir; const P = iso(0, 0, 1, mir);
  const x0 = -w / 2, x1 = w / 2, y0 = -d / 2, y1 = d / 2;
  const c1 = o.c1 ?? '#d8372f', c2 = o.c2 ?? '#fbf3e3';
  groundShadow(ctx, 0, 4, w * 0.9, d * 0.7, 0.2);
  for (const [x, y] of [[x0 + 2, y0 + 2], [x1 - 2, y0 + 2]]) box(ctx, P, mir, x - 1.5, y - 1.5, 0, 3, 3, h + 6, PAL.woodShade, { lw: 1.8 });
  // counter
  box(ctx, P, mir, x0 + 2, y0 + 4, 0, w - 4, d * 0.55, 13, PAL.wood, { top: PAL.woodLight });
  if (o.goods) o.goods(ctx, P, { x0, x1, y0, y1 });
  for (const [x, y] of [[x0 + 2, y1 - 2], [x1 - 2, y1 - 2]]) box(ctx, P, mir, x - 1.5, y - 1.5, 0, 3, 3, h, PAL.woodShade, { lw: 1.8 });
  // awning: sloped plane from back-high to front-low with striped fill and scalloped valance
  const n = 6;
  for (let i = 0; i < n; i++) {
    const xa = x0 - 3 + ((w + 6) * i) / n, xb = x0 - 3 + ((w + 6) * (i + 1)) / n;
    const q = poly([P(xa, y0 - 2, h + 12), P(xb, y0 - 2, h + 12), P(xb, y1 + 4, h), P(xa, y1 + 4, h)]);
    ink(ctx, q, i % 2 ? c2 : c1, 1.2);
    const va = P(xa, y1 + 4, h), vb = P(xb, y1 + 4, h);
    ink(ctx, (c) => { c.moveTo(...va); c.lineTo(...vb); c.lineTo(vb[0], vb[1] + 5); c.quadraticCurveTo((va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2 + 10, va[0], va[1] + 5); c.closePath(); }, i % 2 ? tone(c2, 0.88) : tone(c1, 0.82), 1.2);
  }
  strokeOnly(ctx, poly([P(x0 - 3, y0 - 2, h + 12), P(x1 + 3, y0 - 2, h + 12), P(x1 + 3, y1 + 4, h), P(x0 - 3, y1 + 4, h)]), INK_W);
}

export function lighthouse(ctx, r) {
  groundShadow(ctx, 6, 2, 30, 9, 0.22);
  // stone base
  ink(ctx, (c) => { c.ellipse(0, -4, 24, 9, 0, 0, Math.PI); c.lineTo(-24, -14); c.ellipse(0, -14, 24, 9, 0, Math.PI, 0, true); c.closePath(); }, PAL.stone);
  ink(ctx, ellipse(0, -14, 24, 9), '#cfcbc1');
  const body = (c) => { c.moveTo(-17, -16); c.lineTo(-12, -128); c.lineTo(12, -128); c.lineTo(17, -16); c.ellipse(0, -16, 17, 6, 0, 0, Math.PI); c.closePath(); };
  fillOnly(ctx, body, '#f3ead6');
  within(ctx, body, () => {
    fillOnly(ctx, poly([[6, -130], [14, -130], [19, -10], [7, -10]]), '#d6c7a6');
    fillOnly(ctx, poly([[-20, -78], [20, -78], [20, -66], [-20, -66]]), '#d8473a');
    fillOnly(ctx, poly([[7, -78], [20, -78], [20, -66], [7, -66]]), '#a9362c');
  });
  strokeOnly(ctx, body);
  strokeOnly(ctx, poly([[-15.5, -78], [15.5, -78]], false), INK_W2); strokeOnly(ctx, poly([[-15, -66], [15, -66]], false), INK_W2);
  ink(ctx, poly([[-5, -36], [3, -36], [3, -48], [-5, -48]]), PAL.glass, INK_W2);
  ink(ctx, poly([[-4, -95], [3, -95], [3, -106], [-4, -106]]), PAL.glass, INK_W2);
  // gallery
  ink(ctx, ellipse(0, -130, 19, 6), '#5a4a3e');
  ink(ctx, poly([[-11, -132], [-11, -150], [11, -150], [11, -132]]), '#fde58a');
  within(ctx, poly([[-11, -132], [-11, -150], [11, -150], [11, -132]]), () => fillOnly(ctx, poly([[4, -132], [11, -132], [11, -150], [4, -150]]), '#f2c94c'));
  strokeOnly(ctx, poly([[-11, -132], [-11, -150], [11, -150], [11, -132]]));
  strokeOnly(ctx, poly([[0, -132], [0, -150]], false), 1.4);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; for (let x = -16; x <= 16; x += 5) { ctx.beginPath(); ctx.moveTo(x, -129); ctx.lineTo(x, -137); ctx.stroke(); }
  strokeOnly(ctx, (c) => c.ellipse(0, -137, 18, 5, 0, 0, Math.PI), INK_W2);
  // roof cone
  ink(ctx, (c) => { c.moveTo(-15, -150); c.lineTo(0, -172); c.lineTo(15, -150); c.quadraticCurveTo(0, -145, -15, -150); }, '#d8473a');
  fillOnly(ctx, poly([[0, -171], [14, -150], [5, -148]]), '#a9362c');
  strokeOnly(ctx, (c) => { c.moveTo(-15, -150); c.lineTo(0, -172); c.lineTo(15, -150); c.quadraticCurveTo(0, -145, -15, -150); });
  ink(ctx, circle(0, -175, 3), '#d8473a', INK_W2);
}

export function crate(ctx, r, o = {}) {
  const mir = !!o.mir; const P = iso(0, 0, 1, mir);
  const s = o.size ?? 1, w = 22 * s, d = 16 * s, h = 12 * s;
  groundShadow(ctx, 0, 3, w * 0.9, d * 0.5, 0.2);
  const b = box(ctx, P, mir, -w / 2, -d / 2, 0, w, d, h, PAL.woodLight, { shade: PAL.wood, top: '#5a3a22' });
  ctx.strokeStyle = tone(PAL.wood, 0.7); ctx.lineWidth = 1.2;
  for (const t of [0.35, 0.68]) { ctx.beginPath(); ctx.moveTo(...P(-w / 2, d / 2, h * t)); ctx.lineTo(...P(w / 2, d / 2, h * t)); ctx.lineTo(...P(w / 2, -d / 2, h * t)); ctx.stroke(); }
  const g = o.goods;
  if (g) {
    const pts = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) pts.push(P(-w / 2 + 4 + i * (w - 8) / 2, -d / 2 + 4 + j * (d - 8), h + 1));
    if (g === 'apple') pts.forEach((p) => apple(ctx, p[0], p[1] - 1.5, 3.4 * s));
    else if (g === 'fish') { for (let i = 0; i < 3; i++) { const a = P(-w / 2 + 3, -d / 2 + 3 + i * 4.2, h + 1), b2 = P(w / 2 - 3, -d / 2 + 3 + i * 4.2, h + 1); fishShape(ctx, (a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2 - 1, 8 * s, 2.8 * s, mir ? 0.52 : -0.52 + Math.PI * 0 + 0.52 * 2 - 0.52); } }
    else if (g === 'chili') pts.forEach((p) => ink(ctx, ellipse(p[0], p[1] - 1, 4 * s, 2 * s, 0.4), '#d9261c', 1.1));
    else if (g === 'wool') pts.forEach((p) => ink(ctx, circle(p[0], p[1] - 2, 3.4 * s), '#f4ecd8', 1.1));
  }
}

export function fishShape(ctx, x, y, l, h, rot = 0, col = '#9fb8cf') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ink(ctx, (c) => { c.moveTo(-l, 0); c.quadraticCurveTo(-l * 0.2, -h * 1.4, l * 0.6, 0); c.lineTo(l, -h * 0.8); c.lineTo(l, h * 0.8); c.lineTo(l * 0.6, 0); c.quadraticCurveTo(-l * 0.2, h * 1.4, -l, 0); }, col, 1.1);
  ctx.restore();
}

export function barrel(ctx, r, o = {}) {
  const s = o.size ?? 1;
  groundShadow(ctx, 2, 1, 11 * s, 4 * s, 0.2);
  const b = (c) => { c.moveTo(-8 * s, 0); c.quadraticCurveTo(-11 * s, -10 * s, -8 * s, -20 * s); c.lineTo(8 * s, -20 * s); c.quadraticCurveTo(11 * s, -10 * s, 8 * s, 0); c.ellipse(0, 0, 8 * s, 3 * s, 0, 0, Math.PI); c.closePath(); };
  fillOnly(ctx, b, PAL.woodLight);
  within(ctx, b, () => { fillOnly(ctx, poly([[3 * s, -22 * s], [12 * s, -22 * s], [12 * s, 4], [3 * s, 4]]), PAL.wood); });
  strokeOnly(ctx, b);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  for (const y of [-5, -15]) { ctx.beginPath(); ctx.ellipse(0, y * s, 9.6 * s, 3 * s, 0, 0, Math.PI); ctx.stroke(); }
  ink(ctx, ellipse(0, -20 * s, 8 * s, 3 * s), '#6f4724', INK_W2);
}

// Fence along iso x (or y) axis: posts + 2 rails. len in iso units.
export function fence(ctx, r, o = {}) {
  const len = o.len ?? 60, axis = o.axis ?? 'x', h = 13;
  const P = iso(0, 0, 1, axis === 'y');
  const n = Math.max(2, Math.round(len / 14));
  for (const z of [h * 0.45, h * 0.85]) {
    const a = P(-len / 2, 0, z), b = P(len / 2, 0, z);
    ink(ctx, poly([[a[0], a[1] - 1.6], [b[0], b[1] - 1.6], [b[0], b[1] + 1.6], [a[0], a[1] + 1.6]]), PAL.wood, 1.4);
  }
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n;
    const p = P(x, 0, 0), q = P(x, 0, h + 3);
    ink(ctx, poly([[p[0] - 2, p[1]], [q[0] - 2, q[1]], [q[0], q[1] - 1.5], [q[0] + 2, q[1]], [p[0] + 2, p[1]]]), PAL.woodLight, 1.5);
  }
}

// Dry-stone wall along iso axis.
export function stoneWall(ctx, r, o = {}) {
  const len = o.len ?? 80, axis = o.axis ?? 'x', h = 14, t = 9;
  const mir = axis === 'y';
  const P = iso(0, 0, 1, mir);
  const x0 = -len / 2, x1 = len / 2;
  const front = poly([P(x0, t / 2, 0), P(x1, t / 2, 0), P(x1, t / 2, h), P(x0, t / 2, h)]);
  const end = poly([P(x1, t / 2, 0), P(x1, -t / 2, 0), P(x1, -t / 2, h), P(x1, t / 2, h)]);
  const top = poly([P(x0, -t / 2, h), P(x1, -t / 2, h), P(x1, t / 2, h), P(x0, t / 2, h)]);
  fillOnly(ctx, front, mir ? '#8f8b84' : '#a9a59c');
  within(ctx, front, () => {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3; const rr = r;
    for (let row = 0; row < 2; row++) {
      let x = x0 + (row ? -4 : 0);
      while (x < x1) {
        const sw = 9 + rr() * 6; const z = row * 7 + 0.5;
        const pts = [P(x + 1, t / 2, z + 1), P(x + sw - 1, t / 2, z + 1), P(x + sw - 1, t / 2, z + 6.5), P(x + 1, t / 2, z + 6.5)];
        ctx.beginPath(); ctx.moveTo(...pts[0]); pts.forEach((p) => ctx.lineTo(...p)); ctx.closePath();
        ctx.fillStyle = tone(mir ? '#8f8b84' : '#a9a59c', 1 + (rr() - 0.5) * 0.2); ctx.fill(); ctx.stroke();
        x += sw;
      }
    }
  });
  strokeOnly(ctx, front, INK_W);
  ink(ctx, end, mir ? '#a9a59c' : '#8f8b84');
  ink(ctx, top, '#c8c4bb');
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
  for (let x = x0 + 6; x < x1; x += 10) { const a = P(x, -t / 2, h), b = P(x + 2, t / 2, h); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
}

export function sheep(ctx, r, o = {}) {
  const s = o.size ?? 1, f = o.flip ? -1 : 1;
  ctx.save(); ctx.scale(f, 1);
  groundShadow(ctx, 0, 1, 14 * s, 4 * s, 0.22);
  for (const x of [-7, -2, 5, 9]) ink(ctx, poly([[x * s - 1.4, 0], [x * s - 1.4, -8 * s], [x * s + 1.4, -8 * s], [x * s + 1.4, 0]]), '#2d2622', 1);
  blobCluster(ctx, [scallop(0, -13 * s, 13 * s, 8 * s, 10, 2.2 * s, r)], '#f6f0e2', { lw: 2, sx: 2, sy: 2.5, shade: '#d9cfbb' });
  ink(ctx, ellipse(13 * s, -14 * s, 4.6 * s, 3.6 * s, 0.4), '#2d2622', 1.4);
  ink(ctx, ellipse(10.5 * s, -17 * s, 2.4 * s, 1.4 * s, -0.4), '#2d2622', 1);
  fillOnly(ctx, circle(14.6 * s, -15 * s, 0.9 * s), '#fff');
  ctx.restore();
}

export function dock(ctx, r, o = {}) {
  // L-shaped pier on posts, origin at the landward end.
  const P = iso(0, 0, 1, false);
  const z = 9;
  const planks = [[-10, -10, 90, 22], [50, -50, 22, 60]];
  // posts underneath first, with water rings
  const postAt = [];
  for (const [x, y, w, d] of planks) for (let i = 0; i <= w; i += 18) postAt.push([x + i, y + d], [x + i, y]);
  postAt.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  for (const [x, y] of postAt) {
    const g = P(x, y, -2);
    ctx.save(); ctx.strokeStyle = '#e9f8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(g[0], g[1], 7, 2.6, 0, 0.15, Math.PI - 0.15); ctx.stroke(); ctx.restore();
    box(ctx, P, false, x - 2, y - 2, -3, 4, 4, z + 3, PAL.wood, { lw: 1.8 });
  }
  for (const [x, y, w, d] of planks) {
    const top = poly([P(x, y, z), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z)]);
    ink(ctx, poly([P(x, y + d, z - 3), P(x + w, y + d, z - 3), P(x + w, y + d, z), P(x, y + d, z)]), PAL.wood, INK_W2);
    ink(ctx, poly([P(x + w, y + d, z - 3), P(x + w, y, z - 3), P(x + w, y, z), P(x + w, y + d, z)]), PAL.woodShade, INK_W2);
    fillOnly(ctx, top, PAL.woodLight);
    within(ctx, top, () => {
      ctx.strokeStyle = tone(PAL.wood, 0.75); ctx.lineWidth = 1.2;
      if (w > d) for (let i = 4; i < w; i += 5) { ctx.beginPath(); ctx.moveTo(...P(x + i, y, z)); ctx.lineTo(...P(x + i, y + d, z)); ctx.stroke(); }
      else for (let i = 4; i < d; i += 5) { ctx.beginPath(); ctx.moveTo(...P(x, y + i, z)); ctx.lineTo(...P(x + w, y + i, z)); ctx.stroke(); }
    });
    strokeOnly(ctx, top);
  }
  // mooring posts sticking up
  for (const [x, y] of [[78, -10], [78, 12], [50, -48], [72, -48]]) box(ctx, P, false, x - 2.5, y - 2.5, z, 5, 5, 9, PAL.wood, { lw: 1.6 });
}

// A-frame drying rack with hanging fish and a net.
export function fishRack(ctx, r, o = {}) {
  const mir = !!o.mir; const P = iso(0, 0, 1, mir);
  const L = o.len ?? 46, H = 46;
  groundShadow(ctx, 0, 2, 30, 8, 0.18);
  const leg = (x, y0, y1) => {
    const a = P(x, y0, 0), b = P(x, y1, 0), t = P(x, 0, H);
    ink(ctx, poly([[a[0] - 1.6, a[1]], [t[0] - 1.6, t[1]], [t[0] + 1.6, t[1]], [a[0] + 1.6, a[1]]]), PAL.wood, 1.5);
    ink(ctx, poly([[b[0] - 1.6, b[1]], [t[0] - 1.6, t[1]], [t[0] + 1.6, t[1]], [b[0] + 1.6, b[1]]]), PAL.wood, 1.5);
  };
  leg(-L / 2, -9, 9);
  // net on left half
  const n0 = P(-L / 2 + 3, 0, H - 2), n1 = P(-2, 0, H - 2), n2 = P(-L / 4, 0, 10);
  ink(ctx, (c) => { c.moveTo(...n0); c.lineTo(...n1); c.quadraticCurveTo(n1[0], n2[1] + 6, n2[0], n2[1]); c.quadraticCurveTo(n0[0], n2[1], ...n0); }, 'rgba(240,230,200,0.35)', 1.4);
  within(ctx, (c) => { c.moveTo(...n0); c.lineTo(...n1); c.quadraticCurveTo(n1[0], n2[1] + 6, n2[0], n2[1]); c.quadraticCurveTo(n0[0], n2[1], ...n0); }, () => {
    ctx.strokeStyle = '#5b4a35'; ctx.lineWidth = 0.9;
    for (let i = -40; i < 40; i += 4) { ctx.beginPath(); ctx.moveTo(n0[0] + i, n0[1] - 10); ctx.lineTo(n0[0] + i + 30, n0[1] + 40); ctx.stroke(); ctx.beginPath(); ctx.moveTo(n0[0] + i + 30, n0[1] - 10); ctx.lineTo(n0[0] + i, n0[1] + 40); ctx.stroke(); }
  });
  // fish hanging on right half
  for (let i = 0; i < 4; i++) {
    const p = P(2 + i * ((L / 2 - 6) / 3), 0, H - 3);
    strokeOnly(ctx, poly([p, [p[0], p[1] + 4]], false), 1);
    fishShape(ctx, p[0], p[1] + 14, 10, 3.2, Math.PI / 2, '#8fb0cc');
  }
  const a = P(-L / 2 - 4, 0, H), b = P(L / 2 + 4, 0, H);
  ink(ctx, poly([[a[0], a[1] - 2], [b[0], b[1] - 2], [b[0], b[1] + 2], [a[0], a[1] + 2]]), PAL.woodLight, 1.5);
  leg(L / 2, -9, 9);
}

// Big shallow basket of chillies (spice drying shed contents).
export function chiliBasket(ctx, r, o = {}) {
  const s = o.size ?? 1;
  ink(ctx, ellipse(0, -4 * s, 15 * s, 6 * s), '#c58b45');
  ink(ctx, ellipse(0, -6 * s, 12 * s, 4.2 * s), '#d4352a', INK_W2);
  within(ctx, ellipse(0, -6 * s, 12 * s, 4.2 * s), () => { for (let i = 0; i < 10; i++) ink(ctx, ellipse((r() - 0.5) * 20 * s, -6 * s + (r() - 0.5) * 6 * s, 3 * s, 1.3 * s, r() * 3), '#e8473a', 0.9); });
}

export function woolBales(ctx, r) {
  for (const [x, y] of [[-10, 0], [10, 2], [0, -8]]) {
    ctx.save(); ctx.translate(x, y);
    blobCluster(ctx, [scallop(0, -9, 11, 8, 9, 2, r)], '#f4ecd8', { lw: 2, sx: 2, sy: 2, shade: '#d8ccb2' });
    strokeOnly(ctx, poly([[0, -17], [0, -1]], false), 2.2, '#3f5f9e');
    ctx.restore();
  }
}

export function canvasAwning(ctx, r, o = {}) {
  // White cloth canopy on 4 poles (spice t2)
  const P = iso(0, 0, 1, !!o.mir), w = 44, d = 30, h = 30;
  groundShadow(ctx, 0, 4, 34, 12, 0.18);
  for (const [x, y] of [[-w / 2, -d / 2], [w / 2, -d / 2]]) box(ctx, P, false, x - 1.5, y - 1.5, 0, 3, 3, h + 4, PAL.woodShade, { lw: 1.6 });
  box(ctx, P, false, -w / 2 + 4, -d / 2 + 4, 0, w - 8, 12, 12, PAL.wood, { top: PAL.woodLight });
  for (let i = 0; i < 3; i++) { const p = P(-w / 2 + 10 + i * 12, -d / 2 + 10, 12); ctx.save(); ctx.translate(p[0], p[1] + 4); chiliBasket(ctx, r, { size: 0.45 }); ctx.restore(); }
  for (const [x, y] of [[-w / 2, d / 2], [w / 2, d / 2]]) box(ctx, P, false, x - 1.5, y - 1.5, 0, 3, 3, h, PAL.woodShade, { lw: 1.6 });
  const A = P(-w / 2 - 3, d / 2 + 3, h), B = P(w / 2 + 3, d / 2 + 3, h), C = P(w / 2 + 3, -d / 2 - 3, h + 8), D = P(-w / 2 - 3, -d / 2 - 3, h + 8);
  ink(ctx, (c) => { c.moveTo(...D); c.lineTo(...C); c.lineTo(...B); c.quadraticCurveTo((A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + 3, ...A); c.closePath(); }, '#f6f1e6');
  fillOnly(ctx, poly([lerp2(B, C, 0.1), C, lerp2(C, D, 0.15), lerp2(B, A, 0.15)]), '#e2dccd');
  strokeOnly(ctx, poly([D, C, B], false));
}

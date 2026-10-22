// Built things, all in the tile's iso projection (util.iso) so sizes, angles
// and light agree: dock, house, crates, barrels, market stall, fence and the
// fish-drying rack. Light comes from the upper left: tops lightest, the
// v-face (facing down-left) lit, the u-face (facing down-right) in shade.
import { INK, IW, IW2, rng, f, P, poly, path, line, ellipse, circle, mix, shade, id, bboxOf, iso, boxFaces, lgrad, rgrad, scallop, rounded } from './util.js';

export const WOOD = { light: '#d39c5c', base: '#b97f45', alt: '#a9713d', dark: '#7d4d27', deep: '#59331a' };
const outline = (a, w = IW) => poly(a, 'none', `stroke="${INK}" stroke-width="${f(w)}" stroke-linejoin="round"`);
const filled = (a, c, w = IW) => poly(a, c, `stroke="${INK}" stroke-width="${f(w)}" stroke-linejoin="round"`);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// vertical post / pile: a cylinder from z0 up to z1 at (u, v)
function post(p, u, v, z0, z1, r, { wet = 0, cap = true, pal = WOOD } = {}) {
  const b = p(u, v, z0), t = p(u, v, z1);
  const ry = r * 0.42;
  const body = `M${f(t[0] - r)},${f(t[1])}L${f(b[0] - r)},${f(b[1])}A${f(r)},${f(ry)} 0 0 0 ${f(b[0] + r)},${f(b[1])}L${f(t[0] + r)},${f(t[1])}Z`;
  const c = id('po');
  let s = `<clipPath id="${c}"><path d="${body}"/></clipPath>`;
  // round wood: light on the left, through the base colour into shade
  const [gd, gf] = lgrad([[0, pal.base], [0.22, pal.light], [0.45, pal.base], [0.75, pal.dark], [1, pal.deep]], t[0] - r, 0, t[0] + r, 0, 'userSpaceOnUse');
  s += gd + path(body, gf, `stroke="${INK}" stroke-width="${f(IW)}" stroke-linejoin="round"`);
  s += `<g clip-path="url(#${c})">`;
  const len = b[1] - t[1];
  const R = rng(Math.round(u * 13 + v * 7 + z0));
  // bark grain: long split lines and a knot
  for (let k = 0; k < 2; k++) {
    const gx = t[0] + r * (k ? 0.35 : -0.2);
    const y0 = t[1] + R.range(2, len * 0.3), y1 = y0 + R.range(len * 0.25, len * 0.55);
    s += `<path d="M${f(gx)},${f(y0)}q${f(R.range(-1, 1))},${f((y1 - y0) / 2)} ${f(R.range(-0.5, 0.5))},${f(y1 - y0)}" stroke="${pal.deep}" stroke-width="0.7" fill="none" opacity="0.6"/>`;
  }
  if (len > 14) s += ellipse([t[0] + r * 0.1, t[1] + len * R.range(0.3, 0.6)], r * 0.22, r * 0.32, pal.deep, 'opacity="0.55"');
  if (wet) {
    const [wd, wf] = lgrad([[0, '#3f5b3c', 0], [0.35, '#3f5b3c', 0.75], [1, '#26383a', 0.85]], 0, 0, 0, 1);
    s += wd + `<rect x="${f(b[0] - r - 2)}" y="${f(b[1] - wet - 3)}" width="${f(2 * r + 4)}" height="${f(wet + ry + 5)}" fill="${wf}"/>`;
    s += line([[b[0] - r * 0.8, b[1] - wet + 1], [b[0] + r * 0.1, b[1] - wet + 1.8]], 0.9, '#9cc06a', 'opacity="0.7"');
  }
  s += '</g>';
  if (cap) {
    s += ellipse(t, r, ry, '#e2b47a', `stroke="${INK}" stroke-width="${f(IW)}"`);
    s += ellipse(t, r * 0.68, ry * 0.62, 'none', `stroke="${pal.base}" stroke-width="0.7"`);
    s += ellipse(t, r * 0.34, ry * 0.3, 'none', `stroke="${pal.base}" stroke-width="0.7"`);
    s += line([[t[0] - r * 0.1, t[1]], [t[0] + r * 0.5, t[1] + ry * 0.3]], 0.6, pal.dark);
  }
  return s;
}

// ------------------------------------------------------------------ dock
// origin: screen point of the deck's front-left top corner; len along u,
// depth along v; height: deck top above the water
export function dock({ origin, len = 270, depth = 54, height = 40, thick = 7, plank = 9, gap = 46, postUp = 11, postR = 5.6, seed = 3, proj }) {
  const R = rng(seed);
  const { at } = iso(proj?.au, proj?.av);
  const p = at(origin);
  const out = [];
  const stands = [];
  // shadow on the water, offset away from the light
  const sh = [p(0, 0, -height), p(len, 0, -height), p(len, depth, -height), p(0, depth, -height)].map(([x, y]) => [x + 9, y + 4]);
  out.push(poly(sh, 'rgba(6,52,96,0.28)'));
  // piles: along the front edge, the back edge and the far end
  const n = Math.max(2, Math.round((len - 12) / gap) + 1);
  const us = Array.from({ length: n }, (_, i) => 6 + ((len - 12) * i) / (n - 1));
  for (const u of us) { out.push(post(p, u, depth - 4, -height, -thick, postR * 0.92, { wet: 9, cap: false })); stands.push([...p(u, depth - 4, -height), postR]); }
  out.push(post(p, len - 4, depth / 2, -height, -thick, postR * 0.92, { wet: 9, cap: false }));
  // under-deck beam along the back, seen between the front piles
  out.push(filled([p(0, depth - 6, -thick), p(len, depth - 6, -thick), p(len, depth - 6, -thick - 6), p(0, depth - 6, -thick - 6)], WOOD.deep, IW2));
  // deck: planks run across (along v), side by side along u
  const top = [];
  let u = 0, i = 0;
  while (u < len - 0.5) {
    const w = Math.min(plank * R.range(0.92, 1.1), len - u);
    const c = mix([WOOD.base, WOOD.alt, '#c38a4c', '#b07842'][Math.floor(R() * 4)], '#8a6a4a', R.range(0, 0.18));
    const q = [p(u, 0, 0), p(u + w, 0, 0), p(u + w, depth, 0), p(u, depth, 0)];
    // sun-bleached towards the front edge, darker under the back
    const [pd, pf] = lgrad([[0, shade(c, 0.12)], [0.6, c], [1, shade(c, -0.12)]], q[0][0], q[0][1], q[3][0], q[3][1], 'userSpaceOnUse');
    top.push(pd + poly(q, pf));
    // grain: wavy lines along the board, sometimes around a knot
    for (let g = 0; g < 2; g++) {
      const t = 0.3 + g * 0.4;
      const g0 = lerp(q[0], q[1], t), g1 = lerp(q[3], q[2], t);
      const a = lerp(g0, g1, R.range(0.05, 0.3)), b = lerp(g0, g1, R.range(0.55, 0.95));
      top.push(`<path d="M${P(a)}Q${f((a[0] + b[0]) / 2 + R.range(-1, 1))},${f((a[1] + b[1]) / 2 + R.range(-0.6, 0.6))} ${P(b)}" stroke="${WOOD.deep}" stroke-width="0.6" fill="none" opacity="0.45"/>`);
    }
    if (R() < 0.25) { const k = lerp(lerp(q[0], q[1], 0.5), lerp(q[3], q[2], 0.5), R.range(0.3, 0.7)); top.push(ellipse(k, 1.6, 0.9, WOOD.deep, 'opacity="0.6"') + ellipse(k, 2.8, 1.5, 'none', `stroke="${WOOD.deep}" stroke-width="0.5" opacity="0.4"`)); }
    for (const t of [0.1, 0.9]) {
      const a = lerp(lerp(q[0], q[3], t), lerp(q[1], q[2], t), 0.3), b = lerp(lerp(q[0], q[3], t), lerp(q[1], q[2], t), 0.7);
      top.push(circle(a, 0.7, '#3b2a20') + circle(b, 0.7, '#3b2a20'));
    }
    // worn light edge on each board, dark gap between boards
    top.push(line([lerp(q[0], q[3], 0.02), lerp(q[0], q[3], 0.98)], 0.8, shade(c, 0.3), 'opacity="0.7"'));
    if (u > 0) top.push(line([p(u, 0, 0), p(u, depth, 0)], i % 5 === 0 ? 1.6 : 1, i % 5 === 0 ? INK : WOOD.deep));
    u += w; i++;
  }
  const front = [p(0, 0, 0), p(len, 0, 0), p(len, 0, -thick), p(0, 0, -thick)];
  const end = [p(len, 0, 0), p(len, depth, 0), p(len, depth, -thick), p(len, 0, -thick)];
  const [fd, ff] = lgrad([[0, mix(WOOD.base, WOOD.dark, 0.4)], [1, WOOD.deep]], 0, 0, 0, 1);
  out.push(fd + poly(front, ff), poly(end, mix(WOOD.dark, WOOD.deep, 0.6)));
  out.push(...top);
  // plank ends along the front fascia and a light edge where the deck turns
  let uu = 0;
  const R2 = rng(seed);
  while (uu < len - 0.5) { const w = Math.min(plank * R2.range(0.92, 1.1), len - uu); if (uu > 0) out.push(line([p(uu, 0, 0), p(uu, 0, -thick)], 0.8, WOOD.deep)); uu += w; R2(); R2(); R2(); }
  out.push(line([p(0, 0, 0), p(len, 0, 0)], 1.1, WOOD.light, 'opacity="0.8"'));
  out.push(outline([p(0, 0, 0), p(len, 0, 0), p(len, depth, 0), p(0, depth, 0)]));
  out.push(outline(front), outline(end));
  // front piles stand proud of the deck as mooring posts
  for (const u of us) { out.push(post(p, u, -1.5, -height, postUp, postR, { wet: 9 })); stands.push([...p(u, -1.5, -height), postR + 1]); }
  out.push(post(p, len + 1.5, depth - 6, -height, postUp, postR, { wet: 9 }));
  stands.push([...p(len + 1.5, depth - 6, -height), postR + 1]);
  const ext = [p(0, 0, postUp + 6), p(len + 4, 0, postUp + 6), p(len + 4, depth, postUp), p(0, depth, 0), p(0, 0, -height - 4), p(len + 4, 0, -height - 4), ...sh];
  return { svg: out.join(''), box: bboxOf(ext, 8), foot: p(len / 2, 0, 0), stands, deck: { p, len, depth } };
}

// ----------------------------------------------------------------- house
// corner: screen point of the near bottom corner (u = w, v = 0)
export const HOUSE = { wall: '#f4eee2', wallSide: '#d9cfbf', stone: '#b9b1a6', stoneDark: '#8f877e', roof: '#e2593a', roofLight: '#f37d55', roofDark: '#a63a22', roofLine: '#7d2614', door: '#a8692f', frame: '#7b4b24', pane: '#3b3f4a' };
export function house({ corner, w = 74, d = 50, h = 44, rise = 30, over = 5, seed = 5, proj, pal = HOUSE, chimney = 0.22, door = 0.72, windows = [0.16, 0.38], gableWindow = true }) {
  const R = rng(seed);
  const { U, at } = iso(proj?.au, proj?.av);
  const p = at([corner[0] - w * U[0], corner[1] - w * U[1]]);
  const out = [];
  const half = d / 2, top = h + rise;
  const slope = rise / half;
  const ze = h - over * slope;
  // ground shadow on the shaded side
  out.push(poly([p(w, 0, 0), p(w + 16, 6, 0), p(w + 16, d + 6, 0), p(w, d, 0)], 'rgba(30,40,10,0.22)'));
  const roofParts = {
    back: [p(-over, half, top), p(w + over, half, top), p(w + over, d + over, ze), p(-over, d + over, ze)],
    front: [p(-over, -over, ze), p(w + over, -over, ze), p(w + over, half, top), p(-over, half, top)],
  };
  out.push(filled(roofParts.back, pal.roofDark));
  // walls
  const F = boxFaces(p, 0, w, 0, d, 0, h);
  const sidePoly = [...F.side.slice(0, 3), p(w, half, top), F.side[3]];
  const [sg, sf] = lgrad([[0, pal.wallSide], [1, mix(pal.wallSide, '#8f8270', 0.35)]], 0, 0, 1, 0.6);
  const [fg, ff] = lgrad([[0, '#fbf7ee'], [0.7, pal.wall], [1, mix(pal.wall, '#b9ab94', 0.4)]], 0, 0, 0.3, 1);
  out.push(sg + filled(sidePoly, sf));
  out.push(fg + filled(F.front, ff));
  // plaster life: damp stains, a patch where the plaster fell off and shows
  // stone, shadow under the eaves and at the foot of the wall
  const plaster = (face, q) => {
    const c = id('wl');
    let t = `<clipPath id="${c}">${poly(face, '#000')}</clipPath><g clip-path="url(#${c})">`;
    for (let k = 0; k < 4; k++) {
      const a = q(R.range(0.05, 0.95), R.range(0.1, 0.9));
      t += ellipse(a, R.range(4, 9), R.range(2.5, 5), '#a08a68', 'opacity="0.12"');
    }
    const sp = q(R.range(0.15, 0.4), R.range(0.45, 0.7));
    for (let k = 0; k < 5; k++) {
      const c2 = [sp[0] + (k % 3) * 4.6 + (Math.floor(k / 3) ? 2.3 : 0), sp[1] + Math.floor(k / 3) * 3.6];
      t += path(rounded([[c2[0] - 2, c2[1] - 1.5], [c2[0] + 2, c2[1] - 1.2], [c2[0] + 2.1, c2[1] + 1.5], [c2[0] - 1.9, c2[1] + 1.4]], 0.8), pal.stone, `stroke="#7d7468" stroke-width="0.6"`);
    }
    const [eg, ef] = lgrad([[0, '#3a2b1e', 0.42], [1, '#3a2b1e', 0]], 0, 0, 0, 1);
    const top = q(0, 1), topR = q(1, 1);
    t += eg + `<polygon points="${[top, topR, [topR[0], topR[1] + 9], [top[0], top[1] + 9]].map(P).join(' ')}" fill="${ef}"/>`;
    const [ag, af] = lgrad([[0, '#3a2b1e', 0], [1, '#3a2b1e', 0.3]], 0, 0, 0, 1);
    const b0 = q(0, 0), b1 = q(1, 0);
    t += ag + `<polygon points="${[[b0[0], b0[1] - 14], [b1[0], b1[1] - 14], b1, b0].map(P).join(' ')}" fill="${af}"/>`;
    return t + '</g>';
  };
  out.push(plaster(F.front, (a, b) => p(w * a, 0, h * b)));
  out.push(plaster(sidePoly, (a, b) => p(w, d * a, h * b)));
  // stone footing and corner stones
  const foot = 7;
  out.push(filled([p(0, 0, 0), p(w, 0, 0), p(w, 0, foot), p(0, 0, foot)], pal.stone, IW2));
  out.push(filled([p(w, 0, 0), p(w, d, 0), p(w, d, foot), p(w, 0, foot)], pal.stoneDark, IW2));
  for (let s = 4; s < w - 2; s += R.range(8, 12)) out.push(line([p(s, 0, 0.5), p(s, 0, foot - 0.5)], 0.8, pal.stoneDark));
  for (let s = 6; s < d - 2; s += R.range(8, 12)) out.push(line([p(w, s, 0.5), p(w, s, foot - 0.5)], 0.8, mix(pal.stoneDark, '#000', 0.25)));
  out.push(line([p(0, 0, foot / 2), p(w, 0, foot / 2)], 0.6, pal.stoneDark, 'opacity="0.6"'));
  for (let z = foot; z < h - 6; z += 9) {
    const a = (z / 9) % 2 ? 0 : 1;
    out.push(filled([p(w - 7 + a * 2, 0, z), p(w, 0, z), p(w, 0, z + 8), p(w - 7 + a * 2, 0, z + 8)], mix(pal.wall, pal.stone, 0.55), 0.8));
    out.push(filled([p(w, 0, z), p(w, 6 - a * 2, z), p(w, 6 - a * 2, z + 8), p(w, 0, z + 8)], mix(pal.wallSide, pal.stoneDark, 0.45), 0.8));
  }
  // plaster cracks
  out.push(line([p(w * 0.06, 0, h - 8), p(w * 0.1, 0, h - 13), p(w * 0.08, 0, h - 17)], 0.8, '#a69a88'));
  out.push(line([p(w, d * 0.8, 14), p(w, d * 0.84, 18), p(w, d * 0.82, 22)], 0.8, '#9a8e7c'));
  // windows on the front: frame, panes, sill
  const win = (uc, z0, ww, hh, face = 'front') => {
    const q = face === 'front' ? (s, z) => p(uc + s, 0, z) : (s, z) => p(w, uc + s, z);
    const o = [q(-ww / 2 - 1.6, z0 - 1.6), q(ww / 2 + 1.6, z0 - 1.6), q(ww / 2 + 1.6, z0 + hh + 1.6), q(-ww / 2 - 1.6, z0 + hh + 1.6)];
    let s = filled(o, pal.frame, IW2 * 1.2);
    s += poly([q(-ww / 2, z0), q(ww / 2, z0), q(ww / 2, z0 + hh), q(-ww / 2, z0 + hh)], pal.pane);
    s += poly([q(-ww / 2, z0 + hh * 0.55), q(-ww / 2 + ww * 0.45, z0 + hh), q(-ww / 2 + ww * 0.15, z0 + hh), q(-ww / 2, z0 + hh * 0.8)], '#6f7f95');
    s += line([q(0, z0), q(0, z0 + hh)], 1.2, pal.frame) + line([q(-ww / 2, z0 + hh / 2), q(ww / 2, z0 + hh / 2)], 1.2, pal.frame);
    s += filled([q(-ww / 2 - 3, z0 - 1.6), q(ww / 2 + 3, z0 - 1.6), q(ww / 2 + 3, z0 - 4), q(-ww / 2 - 3, z0 - 4)], pal.stone, IW2);
    return s;
  };
  for (const t of windows) out.push(win(w * t, 19, 10, 14));
  // a flower box under the first window
  {
    const u0 = w * windows[0] - 7, u1 = w * windows[0] + 7, z = 13.5;
    out.push(filled([p(u0, -3, z), p(u1, -3, z), p(u1, -3, z + 3.5), p(u0, -3, z + 3.5)], WOOD.dark, IW2));
    for (let k = 0; k < 6; k++) {
      const c = p(u0 + 1.5 + k * 2.3, -3.5, z + 4.5 + R.range(0, 2));
      out.push(circle(c, 1.9, k % 2 ? '#3f8f2e' : '#2f7a26', `stroke="${INK}" stroke-width="0.5"`));
    }
    for (let k = 0; k < 4; k++) out.push(circle(p(u0 + 2.5 + k * 3.2, -4, z + 6.2 + R.range(0, 1.5)), 1.2, ['#e8455a', '#f6d24a', '#e8455a', '#f08bb0'][k], `stroke="${INK}" stroke-width="0.4"`));
  }
  // arched door
  const du = w * door, dw = 13, dh = 27;
  const arc = [];
  for (let k = 0; k <= 10; k++) { const a = Math.PI * (k / 10); arc.push(p(du + Math.cos(a) * dw / 2, 0, dh - dw / 2 + Math.sin(a) * dw / 2)); }
  const doorPoly = [p(du + dw / 2, 0, 0), ...arc, p(du - dw / 2, 0, 0)];
  const doorFrame = [p(du + dw / 2 + 2, 0, 0), ...arc.map((_, k) => { const a = Math.PI * (k / 10); return p(du + Math.cos(a) * (dw / 2 + 2), 0, dh - dw / 2 + Math.sin(a) * (dw / 2 + 2)); }), p(du - dw / 2 - 2, 0, 0)];
  out.push(filled(doorFrame, pal.stone, IW2));
  out.push(filled(doorPoly, pal.door));
  for (let k = 1; k < 4; k++) out.push(line([p(du - dw / 2 + (dw * k) / 4, 0, 0.5), p(du - dw / 2 + (dw * k) / 4, 0, dh - 2 - Math.abs(k - 2) * 2)], 0.8, pal.frame));
  out.push(circle(p(du + dw * 0.28, 0, 12), 1.1, '#e8c060', `stroke="${INK}" stroke-width="0.5"`));
  for (const z of [6, 19]) out.push(line([p(du - dw / 2 + 0.5, 0, z), p(du - dw / 2 + dw * 0.45, 0, z)], 1.4, '#3b3530'));
  out.push(filled([p(du - dw / 2 - 4, -3, 0), p(du + dw / 2 + 4, -3, 0), p(du + dw / 2 + 4, 0, 0), p(du - dw / 2 - 4, 0, 0)], pal.stone, IW2));
  if (gableWindow) out.push(win(d * 0.5, 16, 8, 11, 'side'));
  // gable vent
  out.push(filled([p(w, half - 2.5, h + rise * 0.45), p(w, half + 2.5, h + rise * 0.45), p(w, half + 2.5, h + rise * 0.45 + 5), p(w, half - 2.5, h + rise * 0.45 + 5)], pal.pane, IW2));
  // roof: tiles in rows on the front slope, lower rows overlapping the ones above
  const rows = 5;
  const S = (s, t) => p(s, -over + (half + over) * t, ze + (top - ze) * t);   // point on the front slope
  out.push(poly(roofParts.front, pal.roof));
  for (let r = rows - 1; r >= 0; r--) {
    const t0 = r / rows, t1 = (r + 1) / rows;
    const tw = 12;
    const off = r % 2 ? tw / 2 : 0;
    for (let s = -over - off; s < w + over; s += tw) {
      const a = Math.max(-over, s), b = Math.min(w + over, s + tw);
      if (b - a < 1) continue;
      const tone = R() < 0.2 ? pal.roofDark : R() < 0.35 ? pal.roofLight : pal.roof;
      const bl = S(a, t0), br = S(b, t0), tr = S(b, t1 + 0.04), tl = S(a, t1 + 0.04);
      const mid = S((a + b) / 2, t0 - 0.07);
      const d2 = `M${P(tl)}L${P(bl)}Q${P(mid)} ${P(br)}L${P(tr)}Z`;
      const [tg, tf] = lgrad([[0, shade(tone, 0.18)], [0.55, tone], [1, shade(tone, -0.22)]], 0, 0, 0.6, 1);
      out.push(tg + path(d2, tf, `stroke="${pal.roofLine}" stroke-width="1" stroke-linejoin="round"`));
      out.push(line([lerp(bl, tl, 0.25), lerp(bl, tl, 0.7)], 1, shade(tone, 0.35), 'opacity="0.75"'));
      if (R() < 0.06) out.push(path(scallop(mid[0], mid[1] - 2.5, 2.2, R, 5, 0.4), '#7c9a3a', 'opacity="0.85"'));
    }
  }
  out.push(outline(roofParts.front));
  // eave board and the gable's barge boards
  out.push(filled([p(-over, -over, ze), p(w + over, -over, ze), p(w + over, -over, ze - 3), p(-over, -over, ze - 3)], pal.roofDark));
  out.push(filled([p(w + over, -over, ze), p(w + over, half, top), p(w + over, half, top - 3.5), p(w + over, -over, ze - 3.5)], pal.roofDark));
  out.push(filled([p(w + over, half, top), p(w + over, d + over, ze), p(w + over, d + over, ze - 3.5), p(w + over, half, top - 3.5)], mix(pal.roofDark, '#000', 0.2)));
  // ridge cap
  out.push(filled([p(-over - 1, half - 2, top + 1.5), p(w + over + 1, half - 2, top + 1.5), p(w + over + 1, half + 1, top - 0.5), p(-over - 1, half + 1, top - 0.5)], pal.roofDark, IW2));
  // chimney on the front slope, rising above the ridge
  if (chimney) {
    const cu = w * chimney, cv = half * 0.35, cw = 11, cd = 10;
    const zr = (v) => ze + (top - ze) * ((v + over) / (half + over));
    const ztop = top + 13;
    const cf = [p(cu, cv, zr(cv)), p(cu + cw, cv, zr(cv)), p(cu + cw, cv, ztop), p(cu, cv, ztop)];
    const cs = [p(cu + cw, cv, zr(cv)), p(cu + cw, cv + cd, zr(cv + cd)), p(cu + cw, cv + cd, ztop), p(cu + cw, cv, ztop)];
    out.push(filled(cf, '#ebe5d8'), filled(cs, '#cfc6b5'));
    for (let z = zr(cv) + 4; z < ztop - 3; z += 4.5) out.push(line([p(cu + 1, cv, z), p(cu + cw - 1, cv, z)], 0.6, '#b9ae9c'));
    const capF = [p(cu - 1.5, cv - 1.5, ztop), p(cu + cw + 1.5, cv - 1.5, ztop), p(cu + cw + 1.5, cv - 1.5, ztop + 3), p(cu - 1.5, cv - 1.5, ztop + 3)];
    const capS = [p(cu + cw + 1.5, cv - 1.5, ztop), p(cu + cw + 1.5, cv + cd + 1.5, ztop), p(cu + cw + 1.5, cv + cd + 1.5, ztop + 3), p(cu + cw + 1.5, cv - 1.5, ztop + 3)];
    const capT = [p(cu - 1.5, cv - 1.5, ztop + 3), p(cu + cw + 1.5, cv - 1.5, ztop + 3), p(cu + cw + 1.5, cv + cd + 1.5, ztop + 3), p(cu - 1.5, cv + cd + 1.5, ztop + 3)];
    out.push(filled(capF, '#b3a999'), filled(capS, '#8f8678'), filled(capT, '#d7cfc0'));
    out.push(poly([p(cu + 2, cv + 2, ztop + 3), p(cu + cw - 2, cv + 2, ztop + 3), p(cu + cw - 2, cv + cd - 2, ztop + 3), p(cu + 2, cv + cd - 2, ztop + 3)], '#2b2522'));
  }
  const ext = [...roofParts.front, ...roofParts.back, p(0, 0, 0), p(w, 0, 0), p(w + 16, d + 6, 0), p(w * chimney, half * 0.35, top + 18)];
  return { svg: out.join(''), box: bboxOf(ext, 6), foot: corner };
}

// ----------------------------------------------------------------- crate
// corner: screen point of the near bottom corner; fill: 'fish' | 'lid' | 'empty'
export function crate({ corner, w = 40, d = 26, h = 18, fill = 'fish', seed = 7, proj }) {
  const R = rng(seed);
  const { U, at } = iso(proj?.au, proj?.av);
  const p = at([corner[0] - w * U[0], corner[1] - w * U[1]]);
  const out = [];
  out.push(poly([p(w, 0, 0), p(w + 7, 3, 0), p(w + 7, d + 3, 0), p(w, d, 0)], 'rgba(30,30,10,0.22)'));
  const F = boxFaces(p, 0, w, 0, d, 0, h);
  const t = 2.2;                                         // board thickness
  if (fill === 'lid') {
    out.push(filled(F.top, WOOD.light));
    for (let s = 7; s < w - 2; s += 7) out.push(line([p(s, 0, h), p(s, d, h)], 0.8, WOOD.dark));
  } else {
    // inside: the far walls' inner faces, then the contents
    out.push(filled(F.top, WOOD.deep));
    out.push(poly([p(t, d - t, h), p(w - t, d - t, h), p(w - t, d - t, 3), p(t, d - t, 3)], WOOD.dark));
    out.push(poly([p(t, t, h), p(t, d - t, h), p(t, d - t, 3), p(t, t, 3)], mix(WOOD.dark, WOOD.base, 0.4)));
    if (fill === 'fish') {
      const lvl = h - 3;
      out.push(poly([p(t, t, lvl), p(w - t, t, lvl), p(w - t, d - t, lvl), p(t, d - t, lvl)], '#b8dcea'));
      for (let k = 0; k < Math.round(w * d / 25); k++) {
        const c = p(R.range(t + 1, w - t - 1), R.range(t + 1, d - t - 1), lvl);
        out.push(path(rounded([[c[0] - 1.4, c[1] - 0.8], [c[0] + 1.3, c[1] - 1], [c[0] + 1.5, c[1] + 0.9], [c[0] - 1.2, c[1] + 1]], 0.5), R() < 0.5 ? '#e8f7fc' : '#9fc8da', 'stroke="#6f9cb0" stroke-width="0.4"'));
      }
      // a few big fish laid head to tail, not a carpet of sprats
      const L = Math.max(10, Math.min(19, (w - 2 * t) * 0.42));
      const rows = Math.max(2, Math.round((d - 2 * t) / (L * 0.42)));
      for (let r = rows - 1; r >= 0; r--) {
        const v = t + L * 0.2 + ((d - 2 * t - L * 0.4) * r) / Math.max(1, rows - 1);
        for (let s = t + 1 + (r % 2) * L * 0.35; s < w - t - L * 0.85; s += L * R.range(0.95, 1.08)) out.push(fishFlat(p, s, v, lvl + 0.6, R, L));
      }
    }
  }
  const [cg, cf] = lgrad([[0, WOOD.light], [1, WOOD.base]], 0, 0, 0.2, 1);
  const [sg2, sf2] = lgrad([[0, WOOD.dark], [1, WOOD.deep]], 0, 0, 0.3, 1);
  out.push(cg + filled(F.front, cf), sg2 + filled(F.side, sf2));
  // grain on the boards
  for (let k = 0; k < 3; k++) {
    const z = h * (k + 0.5) / 3;
    out.push(line([p(w * R.range(0.1, 0.3), 0, z + R.range(-1, 1)), p(w * R.range(0.5, 0.8), 0, z + R.range(-1, 1))], 0.6, WOOD.dark, 'opacity="0.5"'));
  }
  // boards and corner battens
  for (const z of [h / 3, (2 * h) / 3]) {
    out.push(line([p(0, 0, z), p(w, 0, z)], 0.8, WOOD.deep));
    out.push(line([p(w, 0, z), p(w, d, z)], 0.8, WOOD.deep));
  }
  out.push(filled([p(0, 0, 0), p(3, 0, 0), p(3, 0, h), p(0, 0, h)], WOOD.alt, IW2));
  out.push(filled([p(w - 3, 0, 0), p(w, 0, 0), p(w, 0, h), p(w - 3, 0, h)], WOOD.alt, IW2));
  out.push(filled([p(w, d - 3, 0), p(w, d, 0), p(w, d, h), p(w, d - 3, h)], WOOD.deep, IW2));
  out.push(line([p(0.5, 0, h - 0.6), p(w, 0, h - 0.6)], 1, WOOD.light));
  for (const z of [h * 0.2, h * 0.8]) out.push(circle(p(1.5, 0, z), 0.6, '#3b2a20'), circle(p(w - 1.5, 0, z), 0.6, '#3b2a20'));
  out.push(outline([p(0, 0, 0), p(w, 0, 0), p(w, d, 0), p(w, d, h), p(0, d, h), p(0, 0, h)]));
  return { svg: out.join(''), box: bboxOf([...F.top, ...F.front, ...F.side, p(w + 7, d + 3, 0)], 5), foot: corner };
}

// a fish lying along u on a surface at height z
const [fishDef, fishGrad] = lgrad([[0, '#7c98b6'], [0.45, '#c9d6e2'], [1, '#f3f6f8']], 0, 0, 0, 1);
export const DEFS = fishDef;
function fishFlat(p, s, v, z, R, size) {
  const L = size ? size * R.range(0.9, 1.05) : R.range(8, 10.5), W = L * 0.24;
  const a = p(s, v, z), b = p(s + L, v, z);
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  return `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${f(ang)})">` +
    `<path d="M${f(-L / 2)},0Q${f(-L / 4)},${f(-W)} ${f(L / 4)},${f(-W * 0.6)}L${f(L / 2)},${f(-W)}L${f(L / 2 - 1)},0L${f(L / 2)},${f(W)}L${f(L / 4)},${f(W * 0.6)}Q${f(-L / 4)},${f(W)} ${f(-L / 2)},0Z" fill="${fishGrad}" stroke="${INK}" stroke-width="0.75" stroke-linejoin="round"/>` +
    `<path d="M${f(-L / 2 + 1)},${f(-0.6)}Q${f(0)},${f(-W * 0.95)} ${f(L / 4)},${f(-W * 0.55)}" stroke="#46658a" stroke-width="${f(W * 0.35)}" fill="none" stroke-linecap="round"/>` +
    `<path d="M${f(-L / 2 + 2)},${f(W * 0.25)}Q${f(-L / 8)},${f(W * 0.55)} ${f(L / 5)},${f(W * 0.3)}" stroke="#ffffff" stroke-width="0.8" fill="none" opacity="0.85"/>` +
    `<path d="M${f(-L / 6)},${f(-W * 0.75)}l${f(L * 0.12)},${f(-W * 0.45)}l${f(L * 0.05)},${f(W * 0.4)}" fill="#7f9bb8" stroke="${INK}" stroke-width="0.5"/>` +
    line([[-L / 2 + L * 0.18, -W * 0.55], [-L / 2 + L * 0.2, W * 0.5]], 0.5, '#52708f') +
    circle([-L / 2 + L * 0.1, -0.3], Math.max(0.5, W * 0.18), '#fff', `stroke="${INK}" stroke-width="0.4"`) + circle([-L / 2 + L * 0.1, -0.3], Math.max(0.25, W * 0.08), INK) + '</g>';
}

// ---------------------------------------------------------------- barrel
// foot: screen point at the middle of the base
export function barrel({ x, y, r = 9, h = 20, seed = 9, lid = true }) {
  const R = rng(seed);
  const ry = r * 0.42, bulge = r * 0.12;
  const yt = y - h;
  const body = `M${f(x - r)},${f(yt)}Q${f(x - r - bulge * 2)},${f(y - h / 2)} ${f(x - r)},${f(y)}A${f(r)},${f(ry)} 0 0 0 ${f(x + r)},${f(y)}Q${f(x + r + bulge * 2)},${f(y - h / 2)} ${f(x + r)},${f(yt)}Z`;
  const c = id('br');
  let s = ellipse([x + r * 0.5, y + 1], r * 1.3, ry * 1.2, 'rgba(30,30,10,0.22)');
  s += `<clipPath id="${c}"><path d="${body}"/></clipPath>`;
  const [bg, bf] = lgrad([[0, WOOD.base], [0.25, WOOD.light], [0.5, WOOD.base], [0.8, WOOD.dark], [1, WOOD.deep]], x - r, 0, x + r, 0, 'userSpaceOnUse');
  s += bg + path(body, bf, `stroke="${INK}" stroke-width="${f(IW)}" stroke-linejoin="round"`);
  s += `<g clip-path="url(#${c})">`;

  for (const k of [-0.5, 0, 0.5]) s += `<path d="M${f(x + k * r)},${f(yt + ry)}Q${f(x + k * r * 1.25)},${f(y - h / 2)} ${f(x + k * r)},${f(y + ry)}" stroke="${WOOD.deep}" stroke-width="0.7" fill="none" opacity="0.7"/>`;
  for (const t of [0.22, 0.78]) {
    const yy = yt + h * t, rr = r + bulge * (1 - Math.abs(t - 0.5) * 2) * 1.6;
    s += `<path d="M${f(x - rr - 1)},${f(yy)}A${f(rr + 1)},${f(ry)} 0 0 0 ${f(x + rr + 1)},${f(yy)}" stroke="#4b4642" stroke-width="2.4" fill="none"/>`;
    s += `<path d="M${f(x - rr)},${f(yy - 1.1)}A${f(rr)},${f(ry)} 0 0 0 ${f(x - rr * 0.2)},${f(yy + ry * 0.9)}" stroke="#8d8781" stroke-width="0.8" fill="none"/>`;
  }
  s += '</g>';
  s += ellipse([x, yt], r, ry, lid ? WOOD.light : WOOD.deep, `stroke="${INK}" stroke-width="${f(IW)}"`);
  if (lid) {
    s += ellipse([x, yt], r * 0.78, ry * 0.75, 'none', `stroke="${WOOD.dark}" stroke-width="0.8"`);
    s += line([[x - r * 0.6, yt - ry * 0.2], [x + r * 0.6, yt - ry * 0.2]], 0.7, WOOD.dark) + line([[x - r * 0.6, yt + ry * 0.25], [x + r * 0.6, yt + ry * 0.25]], 0.7, WOOD.dark);
  }
  void R;
  return { svg: s, box: [x - r - bulge * 2 - 3, yt - ry - 3, 2 * r + bulge * 4 + 6 + r * 0.8, h + 2 * ry + 6], foot: [x, y] };
}

// ---------------------------------------------------------- market stall
export const STRIPES = ['#f7efdc', '#c86f3c'];
export function stall({ corner, w = 44, d = 22, h = 13, seed = 11, proj, stripes = STRIPES }) {
  const R = rng(seed);
  const { U, at } = iso(proj?.au, proj?.av);
  const p = at([corner[0] - w * U[0], corner[1] - w * U[1]]);
  const out = [];
  out.push(poly([p(-2, -6, 0), p(w + 12, -2, 0), p(w + 12, d + 4, 0), p(-2, d, 0)], 'rgba(30,30,10,0.18)'));
  const postH = 33;
  out.push(post(p, 1.5, d - 1.5, 0, postH + 4, 1.6, { cap: false }), post(p, w - 1.5, d - 1.5, 0, postH + 4, 1.6, { cap: false }));
  const F = boxFaces(p, 0, w, 0, d, 0, h);
  out.push(filled(F.top, WOOD.light), filled(F.front, WOOD.base), filled(F.side, WOOD.dark));
  for (let s = 6; s < w; s += 6) out.push(line([p(s, 0, 0.5), p(s, 0, h - 0.5)], 0.8, WOOD.dark));
  // goods: a row of fish and a basket
  for (let s = 3; s < w * 0.55; s += 8.5) out.push(fishFlat(p, s, d * 0.35 + R.range(-2, 2), h + 0.3, R));
  const bc = p(w * 0.78, d * 0.5, h);
  out.push(ellipse([bc[0], bc[1] - 3], 6.5, 3, '#c79b5a', `stroke="${INK}" stroke-width="${f(IW2)}"`));
  out.push(path(`M${f(bc[0] - 6.5)},${f(bc[1] - 3)}L${f(bc[0] - 5)},${f(bc[1] + 2)}A6,2.6 0 0 0 ${f(bc[0] + 5)},${f(bc[1] + 2)}L${f(bc[0] + 6.5)},${f(bc[1] - 3)}A6.5,3 0 0 1 ${f(bc[0] - 6.5)},${f(bc[1] - 3)}Z`, '#b8874a', `stroke="${INK}" stroke-width="${f(IW2)}"`));
  for (let k = 0; k < 3; k++) out.push(circle([bc[0] - 3 + k * 3, bc[1] - 4 + (k % 2)], 1.8, ['#e04a2f', '#f0b43c', '#e04a2f'][k], `stroke="${INK}" stroke-width="0.6"`));
  // front posts and the awning
  out.push(post(p, 1.5, -2, 0, postH, 1.6, { cap: false }), post(p, w - 1.5, -2, 0, postH, 1.6, { cap: false }));
  const za = postH, zb = postH + 7, ov = 4;
  const A = (s, t) => p(s, -ov - 2 + (d + ov + 2) * t, za + (zb - za) * t);
  const n = 7;
  for (let k = 0; k < n; k++) {
    const s0 = -3 + ((w + 6) * k) / n, s1 = -3 + ((w + 6) * (k + 1)) / n;
    out.push(poly([A(s0, 0), A(s1, 0), A(s1, 1), A(s0, 1)], stripes[k % 2]));
    // scalloped valance along the front edge
    const a = A(s0, 0), b = A(s1, 0), m = lerp(a, b, 0.5);
    out.push(path(`M${P(a)}L${P(b)}L${f(b[0])},${f(b[1] + 3)}Q${f(m[0])},${f(m[1] + 8)} ${f(a[0])},${f(a[1] + 3)}Z`, stripes[k % 2], `stroke="${INK}" stroke-width="${f(IW2)}" stroke-linejoin="round"`));
  }
  // the awning's side edge, in shade
  out.push(filled([A(w + 3, 0), A(w + 3, 1), [A(w + 3, 1)[0], A(w + 3, 1)[1] + 2.5], [A(w + 3, 0)[0], A(w + 3, 0)[1] + 3]], '#8f7c66', IW2));
  out.push(outline([A(-3, 0), A(w + 3, 0), A(w + 3, 1), A(-3, 1)]));
  const ext = [A(-3, 0), A(w + 3, 0), A(w + 3, 1), A(-3, 1), p(0, 0, 0), p(w, 0, 0), p(w + 12, d + 4, 0), [A(-3, 0)[0], A(-3, 0)[1] + 10]];
  return { svg: out.join(''), box: bboxOf(ext, 5), foot: corner };
}

// ----------------------------------------------------------------- fence
// a run of posts from start along u or v, with two rails
export function fence({ start, len = 40, dir = 'v', posts = 4, h = 17, seed = 13, proj }) {
  const R = rng(seed);
  const { at } = iso(proj?.au, proj?.av);
  const p = at(start);
  const q = dir === 'v' ? (s, z) => p(0, s, z) : (s, z) => p(s, 0, z);
  const out = [];
  out.push(poly([q(0, 0), q(len, 0), [q(len, 0)[0] + 8, q(len, 0)[1] + 3], [q(0, 0)[0] + 8, q(0, 0)[1] + 3]], 'rgba(30,40,10,0.2)'));
  const ss = Array.from({ length: posts }, (_, i) => (len * i) / (posts - 1));
  const rail = (z) => {
    const a = q(-2, z), b = q(len + 2, z);
    return filled([a, b, [b[0], b[1] + 3.4], [a[0], a[1] + 3.4]], WOOD.base, IW2 * 1.4) + line([[a[0] + 1, a[1] + 0.9], [b[0] - 1, b[1] + 0.9]], 0.8, WOOD.light);
  };
  // back rail first (behind posts), then posts, then the front rail
  for (const s of ss) {
    const b = q(s, 0), t = q(s, h + R.range(-1, 1.5));
    out.push(filled([[b[0] - 2.8, b[1]], [b[0] + 2.8, b[1]], [t[0] + 2.8, t[1]], [t[0] - 2.8, t[1]]], WOOD.base, IW2 * 1.5));
    out.push(poly([[b[0] + 0.6, b[1] - 0.6], [b[0] + 1.6, b[1] - 0.6], [t[0] + 1.6, t[1] + 0.6], [t[0] + 0.6, t[1] + 0.6]], WOOD.dark));
    out.push(ellipse(t, 2.9, 1.2, WOOD.light, `stroke="${INK}" stroke-width="0.9"`));
  }
  out.push(rail(h * 0.72), rail(h * 0.32));
  return { svg: out.join(''), box: bboxOf([q(-3, 0), q(len + 3, 0), q(-3, h + 4), q(len + 3, h + 4), [q(len, 0)[0] + 10, q(len, 0)[1] + 4]], 5), foot: q(len / 2, 0) };
}

// ------------------------------------------------------------ drying rack
// two A-frames along v joined by a beam; nets drape from the beam and the
// catch hangs in front of them. Sized against the house: the beam sits about
// at the eaves, well under the ridge.
export function rack({ start, len = 96, spread = 13, h = 68, fish = 6, net = true, seed = 15, proj }) {
  const R = rng(seed);
  const { at } = iso(proj?.au, proj?.av);
  const p = at(start);
  const out = [];
  const pole = (a, b, r = 2.7) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = (-dy / L) * r, ny = (dx / L) * r;
    return filled([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], WOOD.base, IW * 0.95) +
      line([[a[0] + nx * 0.45, a[1] + ny * 0.45], [b[0] + nx * 0.45, b[1] + ny * 0.45]], 1, WOOD.light) +
      line([[a[0] - nx * 0.5, a[1] - ny * 0.5], [b[0] - nx * 0.5, b[1] - ny * 0.5]], 1, WOOD.dark, 'opacity="0.8"');
  };
  // shadow of the frames and the catch, cast down-right
  out.push(poly([p(-spread, -2, 0), p(spread, -2, 0), p(spread + 20, len + 2, 0), p(-spread + 20, len + 2, 0)].map(([x, y]) => [x + 10, y + 3]), 'rgba(30,40,10,0.16)'));
  const apex = (v) => p(0, v, h);
  const frame = (v) => pole(p(-spread, v, 0), apex(v)) + pole(p(spread, v, 0), apex(v)) +
    pole(p(-spread * 0.6, v, h * 0.4), p(spread * 0.6, v, h * 0.4), 1.9) +
    // lashing where the legs cross the beam
    ellipse(apex(v), 3.2, 2.2, WOOD.deep, `stroke="${INK}" stroke-width="0.8"`);
  out.push(frame(len));
  out.push(pole(p(0, -6, h - 2), p(0, len + 6, h - 2), 3));
  // nets: bags hanging from two points on the beam, sagging towards the ground
  const nets = net ? [[0.08, 0.42, '#efe5c4', '#9b8558'], [0.5, 0.86, '#d9cf6a', '#7f7a2c']] : [];
  for (const [t0, t1, col, dark] of nets) {
    const a = p(0, len * t0, h - 3), b = p(0, len * t1, h - 3);
    const m = lerp(a, b, 0.5);
    const low = h * R.range(0.55, 0.68);
    const bottom = [m[0] + 2, m[1] + low];
    const shape = `M${P(a)}Q${f(a[0] - 4)},${f(a[1] + low * 0.6)} ${P(bottom)}Q${f(b[0] + 3)},${f(b[1] + low * 0.6)} ${P(b)}Z`;
    const c = id('nt');
    out.push(`<clipPath id="${c}"><path d="${shape}"/></clipPath>`);
    out.push(path(shape, col, 'opacity="0.28"'));
    let mesh = '';
    for (let k = -14; k < 20; k++) {
      const x0 = a[0] - 40 + k * 3.6;
      mesh += `M${f(x0)},${f(a[1] - 6)}q${f(18)},${f(30)} ${f(34)},${f(70)}M${f(x0 + 34)},${f(a[1] - 6)}q${f(-18)},${f(30)} ${f(-34)},${f(70)}`;
    }
    out.push(`<g clip-path="url(#${c})"><path d="${mesh}" stroke="${col}" stroke-width="1.1" fill="none"/><path d="${mesh}" stroke="${dark}" stroke-width="0.35" fill="none" opacity="0.8"/></g>`);
    out.push(path(shape, 'none', `stroke="${dark}" stroke-width="1.1" stroke-linejoin="round"`));
    out.push(circle(bottom, 1.7, '#d9a441', `stroke="${INK}" stroke-width="0.6"`));
  }
  for (let k = 0; k < fish; k++) {
    const v = len * (0.16 + (0.7 * k) / Math.max(1, fish - 1));
    const t = p(0, v, h - 4);
    const drop = R.range(3, 6);
    out.push(line([t, [t[0], t[1] + drop]], 0.9, '#5a4a36'));
    out.push(hangingFish(t[0], t[1] + drop, R.range(18, 21), R));
  }
  out.push(frame(0));
  const ext = [p(-spread - 3, 0, 0), p(spread + 3, 0, 0), p(-spread, len, 0), p(spread + 3, len, 0), p(0, -8, h + 5), p(0, len + 8, h + 5), p(spread + 30, len + 2, 0)];
  return { svg: out.join(''), box: bboxOf(ext, 8), foot: p(0, 0, 0) };
}

function hangingFish(x, y, L, R) {
  const W = L * 0.24;
  const body = `M${f(x)},${f(y)}l${f(-W * 0.55)},${f(-1.5)}l${f(W * 0.55)},${f(3.5)}l${f(W * 0.55)},${f(-3.5)}Z` +
    `M${f(x)},${f(y + 1.5)}Q${f(x - W)},${f(y + L * 0.35)} ${f(x - W * 0.2)},${f(y + L * 0.85)}L${f(x)},${f(y + L)}L${f(x + W * 0.2)},${f(y + L * 0.85)}Q${f(x + W)},${f(y + L * 0.35)} ${f(x)},${f(y + 1.5)}Z`;
  return path(body, '#c8d6e4', `stroke="${INK}" stroke-width="${f(IW2)}" stroke-linejoin="round"`) +
    path(`M${f(x + W * 0.15)},${f(y + 3)}Q${f(x + W * 0.75)},${f(y + L * 0.4)} ${f(x + W * 0.1)},${f(y + L * 0.82)}`, 'none', `stroke="#5f7f9e" stroke-width="${f(W * 0.35)}" stroke-linecap="round"`) +
    path(`M${f(x - W * 0.35)},${f(y + L * 0.25)}Q${f(x - W * 0.55)},${f(y + L * 0.45)} ${f(x - W * 0.3)},${f(y + L * 0.62)}`, 'none', 'stroke="#f4f8fb" stroke-width="1" stroke-linecap="round"') +
    circle([x - W * 0.12, y + L * 0.86], 0.8, INK) + `<!--${R ? '' : ''}-->`;
}

// ---------------------------------------------------------------- flowers
export function flowers({ x, y, n = 4, r = 9, seed = 17 }) {
  const R = rng(seed);
  let s = '';
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, d = R() * r;
    const c = [x + Math.cos(a) * d, y + Math.sin(a) * d * 0.5];
    pts.push(c);
  }
  pts.sort((a, b) => a[1] - b[1]);
  for (const c of pts) {
    s += line([[c[0], c[1] + 1], [c[0] - 0.5, c[1] + 4]], 0.9, '#4f8a1e');
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; s += ellipse([c[0] + Math.cos(a) * 1.6, c[1] + Math.sin(a) * 1.0], 1.3, 0.9, '#ffffff', `stroke="#9fb08a" stroke-width="0.35"`); }
    s += circle(c, 0.9, '#f2c230');
  }
  return { svg: s, box: [x - r - 4, y - r * 0.5 - 4, 2 * r + 8, r + 10], foot: [x, y] };
}

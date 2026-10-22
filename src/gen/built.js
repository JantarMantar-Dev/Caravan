// Built things, all in the tile's iso projection (util.iso) so sizes, angles
// and light agree: dock, house, crates, barrels, market stall, fence and the
// fish-drying rack. Light comes from the upper left: tops lightest, the
// v-face (facing down-left) lit, the u-face (facing down-right) in shade.
import { INK, IW, IW2, rng, f, P, poly, path, line, ellipse, circle, mix, shade, id, bboxOf, iso, boxFaces } from './util.js';

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
  s += path(body, pal.base, `stroke="${INK}" stroke-width="${f(IW)}" stroke-linejoin="round"`);
  s += `<g clip-path="url(#${c})">`;
  s += poly([[t[0] + r * 0.3, t[1] - 2], [t[0] + r + 2, t[1] - 2], [b[0] + r + 2, b[1] + ry + 2], [b[0] + r * 0.3, b[1] + ry + 2]], pal.dark);
  s += poly([[t[0] - r * 0.55, t[1] - 2], [t[0] - r * 0.15, t[1] - 2], [b[0] - r * 0.15, b[1] + ry], [b[0] - r * 0.55, b[1] + ry]], pal.light);
  const len = b[1] - t[1];
  for (let k = 1; k < len / 9; k++) s += line([[t[0] + r * 0.05, t[1] + k * 9 - 3], [t[0] + r * 0.05, t[1] + k * 9 + 1.5]], 0.8, pal.deep, 'opacity="0.6"');
  if (wet) s += poly([[b[0] - r - 2, b[1] - wet], [b[0] + r + 2, b[1] - wet], [b[0] + r + 2, b[1] + ry + 2], [b[0] - r - 2, b[1] + ry + 2]], '#3d4f4a', 'opacity="0.55"');
  s += '</g>';
  if (cap) {
    s += ellipse(t, r, ry, pal.light, `stroke="${INK}" stroke-width="${f(IW)}"`);
    s += ellipse(t, r * 0.55, ry * 0.5, 'none', `stroke="${pal.dark}" stroke-width="0.8"`);
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
    const c = [WOOD.base, WOOD.alt, mix(WOOD.base, WOOD.light, 0.25)][i % 3 === 2 ? 2 : i % 2];
    const q = [p(u, 0, 0), p(u + w, 0, 0), p(u + w, depth, 0), p(u, depth, 0)];
    top.push(poly(q, c));
    // grain and nails
    const g0 = lerp(q[0], q[1], 0.5), g1 = lerp(q[3], q[2], 0.5);
    top.push(line([lerp(g0, g1, R.range(0.15, 0.3)), lerp(g0, g1, R.range(0.45, 0.6))], 0.7, WOOD.dark, 'opacity="0.55"'));
    for (const t of [0.12, 0.88]) {
      const a = lerp(lerp(q[0], q[3], t), lerp(q[1], q[2], t), 0.5);
      top.push(circle(a, 0.75, WOOD.deep));
    }
    if (u > 0) top.push(line([p(u, 0, 0), p(u, depth, 0)], 0.9, WOOD.deep));
    u += w; i++;
  }
  const front = [p(0, 0, 0), p(len, 0, 0), p(len, 0, -thick), p(0, 0, -thick)];
  const end = [p(len, 0, 0), p(len, depth, 0), p(len, depth, -thick), p(len, 0, -thick)];
  out.push(poly(front, WOOD.dark), poly(end, mix(WOOD.dark, WOOD.deep, 0.5)));
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
  out.push(filled([...F.side.slice(0, 3), p(w, half, top), F.side[3]], pal.wallSide));
  out.push(filled(F.front, pal.wall));
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
  for (const t of windows) out.push(win(w * t, 17, 9, 12));
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
  out.push(filled([p(du - dw / 2 - 4, -3, 0), p(du + dw / 2 + 4, -3, 0), p(du + dw / 2 + 4, 0, 0), p(du - dw / 2 - 4, 0, 0)], pal.stone, IW2));
  if (gableWindow) out.push(win(d * 0.5, 16, 8, 11, 'side'));
  // gable vent
  out.push(filled([p(w, half - 2.5, h + rise * 0.45), p(w, half + 2.5, h + rise * 0.45), p(w, half + 2.5, h + rise * 0.45 + 5), p(w, half - 2.5, h + rise * 0.45 + 5)], pal.pane, IW2));
  // roof: tiles in rows on the front slope, lower rows overlapping the ones above
  const rows = 6;
  const S = (s, t) => p(s, -over + (half + over) * t, ze + (top - ze) * t);   // point on the front slope
  out.push(poly(roofParts.front, pal.roof));
  for (let r = rows - 1; r >= 0; r--) {
    const t0 = r / rows, t1 = (r + 1) / rows;
    const tw = 9;
    const off = r % 2 ? tw / 2 : 0;
    for (let s = -over - off; s < w + over; s += tw) {
      const a = Math.max(-over, s), b = Math.min(w + over, s + tw);
      if (b - a < 1) continue;
      const tone = R() < 0.2 ? pal.roofDark : R() < 0.35 ? pal.roofLight : pal.roof;
      const bl = S(a, t0), br = S(b, t0), tr = S(b, t1 + 0.04), tl = S(a, t1 + 0.04);
      const mid = S((a + b) / 2, t0 - 0.07);
      const d2 = `M${P(tl)}L${P(bl)}Q${P(mid)} ${P(br)}L${P(tr)}Z`;
      out.push(path(d2, tone, `stroke="${pal.roofLine}" stroke-width="0.9" stroke-linejoin="round"`));
      out.push(line([lerp(bl, tl, 0.3), lerp(bl, tl, 0.75)], 0.9, shade(tone, 0.25), 'opacity="0.7"'));
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
      out.push(poly([p(t, t, lvl), p(w - t, t, lvl), p(w - t, d - t, lvl), p(t, d - t, lvl)], '#7f9bb1'));
      const rows = Math.max(2, Math.round((d - 2 * t) / 6));
      for (let r = rows - 1; r >= 0; r--) {
        const v = t + 2.5 + ((d - 2 * t - 5) * r) / Math.max(1, rows - 1);
        for (let s = t + 2 + (r % 2) * 4; s < w - t - 9; s += R.range(9, 12)) out.push(fishFlat(p, s, v, lvl + 0.6, R));
      }
    }
  }
  out.push(filled(F.front, WOOD.base), filled(F.side, WOOD.dark));
  // boards and corner battens
  for (const z of [h / 3, (2 * h) / 3]) {
    out.push(line([p(0, 0, z), p(w, 0, z)], 0.8, WOOD.deep));
    out.push(line([p(w, 0, z), p(w, d, z)], 0.8, WOOD.deep));
  }
  out.push(filled([p(0, 0, 0), p(3, 0, 0), p(3, 0, h), p(0, 0, h)], WOOD.alt, IW2));
  out.push(filled([p(w - 3, 0, 0), p(w, 0, 0), p(w, 0, h), p(w - 3, 0, h)], WOOD.alt, IW2));
  out.push(filled([p(w, d - 3, 0), p(w, d, 0), p(w, d, h), p(w, d - 3, h)], WOOD.deep, IW2));
  out.push(line([p(0.5, 0, h - 0.6), p(w, 0, h - 0.6)], 1, WOOD.light));
  out.push(outline([p(0, 0, 0), p(w, 0, 0), p(w, d, 0), p(w, d, h), p(0, d, h), p(0, 0, h)]));
  return { svg: out.join(''), box: bboxOf([...F.top, ...F.front, ...F.side, p(w + 7, d + 3, 0)], 5), foot: corner };
}

// a fish lying along u on a surface at height z
function fishFlat(p, s, v, z, R) {
  const L = R.range(8, 10.5), W = 2.4;
  const a = p(s, v, z), b = p(s + L, v, z);
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  return `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${f(ang)})">` +
    `<path d="M${f(-L / 2)},0Q${f(-L / 4)},${f(-W)} ${f(L / 4)},${f(-W * 0.6)}L${f(L / 2)},${f(-W)}L${f(L / 2 - 1)},0L${f(L / 2)},${f(W)}L${f(L / 4)},${f(W * 0.6)}Q${f(-L / 4)},${f(W)} ${f(-L / 2)},0Z" fill="#c9d6e2" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>` +
    `<path d="M${f(-L / 2 + 1)},${f(-0.5)}Q${f(0)},${f(-W * 0.9)} ${f(L / 4)},${f(-W * 0.5)}" stroke="#5f7d99" stroke-width="1" fill="none"/>` +
    circle([-L / 2 + 1.6, -0.3], 0.45, INK) + '</g>';
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
  s += path(body, WOOD.base, `stroke="${INK}" stroke-width="${f(IW)}" stroke-linejoin="round"`);
  s += `<g clip-path="url(#${c})">`;
  s += path(`M${f(x + r * 0.35)},${f(yt - 5)}Q${f(x + r * 0.55)},${f(y - h / 2)} ${f(x + r * 0.35)},${f(y + 6)}L${f(x + r * 2)},${f(y + 6)}L${f(x + r * 2)},${f(yt - 5)}Z`, WOOD.dark);
  s += path(`M${f(x - r * 0.7)},${f(yt - 5)}Q${f(x - r * 0.85)},${f(y - h / 2)} ${f(x - r * 0.7)},${f(y + 6)}L${f(x - r * 0.35)},${f(y + 6)}Q${f(x - r * 0.45)},${f(y - h / 2)} ${f(x - r * 0.35)},${f(yt - 5)}Z`, WOOD.light);
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
export const STRIPES = ['#f5ecd8', '#b5533a'];
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
    return filled([a, b, [b[0], b[1] + 2.6], [a[0], a[1] + 2.6]], WOOD.base, IW2 * 1.3);
  };
  // back rail first (behind posts), then posts, then the front rail
  for (const s of ss) {
    const b = q(s, 0), t = q(s, h + R.range(-1, 1.5));
    out.push(filled([[b[0] - 2, b[1]], [b[0] + 2, b[1]], [t[0] + 2, t[1]], [t[0] - 2, t[1]]], WOOD.base, IW2 * 1.3));
    out.push(poly([[b[0] + 0.6, b[1] - 0.6], [b[0] + 1.6, b[1] - 0.6], [t[0] + 1.6, t[1] + 0.6], [t[0] + 0.6, t[1] + 0.6]], WOOD.dark));
    out.push(ellipse(t, 2.1, 0.9, WOOD.light, `stroke="${INK}" stroke-width="0.8"`));
  }
  out.push(rail(h * 0.72), rail(h * 0.32));
  return { svg: out.join(''), box: bboxOf([q(-3, 0), q(len + 3, 0), q(-3, h + 4), q(len + 3, h + 4), [q(len, 0)[0] + 10, q(len, 0)[1] + 4]], 5), foot: q(len / 2, 0) };
}

// ------------------------------------------------------------ drying rack
// two A-frames along v joined by a beam, fish hanging from it, a net below
export function rack({ start, len = 120, spread = 16, h = 108, fish = 7, net = true, seed = 15, proj }) {
  const R = rng(seed);
  const { at } = iso(proj?.au, proj?.av);
  const p = at(start);
  const out = [];
  const pole = (a, b, r = 2.6) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = (-dy / L) * r, ny = (dx / L) * r;
    return filled([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], WOOD.base, IW * 0.9) +
      line([[a[0] + nx * 0.4, a[1] + ny * 0.4], [b[0] + nx * 0.4, b[1] + ny * 0.4]], 0.9, WOOD.light);
  };
  out.push(poly([p(-spread, 0, 0), p(spread, 0, 0), p(spread + 30, len, 0), p(-spread + 30, len, 0)].map(([x, y]) => [x + 6, y + 2]), 'rgba(30,40,10,0.14)'));
  const apex = (v) => p(0, v, h);
  // the far frame first, then beam, fish, net, then the near frame
  const frame = (v) => pole(p(-spread, v, 0), apex(v)) + pole(p(spread, v, 0), apex(v)) + pole(p(-spread * 0.55, v, h * 0.45), p(spread * 0.55, v, h * 0.45), 1.8);
  out.push(frame(len));
  out.push(pole(p(0, -4, h - 3), p(0, len + 6, h - 3), 2.8));
  // net draped between the near frame's legs and the first fish
  if (net) {
    const a = p(-spread * 0.5, 4, h * 0.55), b = p(spread * 0.2, len * 0.32, h * 0.62);
    const sag = 26;
    const top = [a, lerp(a, b, 0.5), b];
    const bottom = [[a[0] + 2, a[1] + 14], [lerp(a, b, 0.5)[0], lerp(a, b, 0.5)[1] + sag], [b[0] - 2, b[1] + 12]];
    const shape = `M${P(top[0])}Q${P([top[1][0], top[1][1] + 6])} ${P(top[2])}L${P(bottom[2])}Q${P([bottom[1][0], bottom[1][1] + 6])} ${P(bottom[0])}Z`;
    const c = id('nt');
    out.push(`<clipPath id="${c}"><path d="${shape}"/></clipPath>`);
    out.push(path(shape, 'rgba(236,224,190,0.35)'));
    let mesh = '';
    for (let k = -8; k < 16; k++) {
      const x0 = a[0] - 30 + k * 4.2;
      mesh += `M${f(x0)},${f(a[1] - 10)}l${f(40)},${f(60)}M${f(x0 + 40)},${f(a[1] - 10)}l${f(-40)},${f(60)}`;
    }
    out.push(`<g clip-path="url(#${c})"><path d="${mesh}" stroke="#e8dcb8" stroke-width="0.9" fill="none"/><path d="${mesh}" stroke="#8a7650" stroke-width="0.35" fill="none"/></g>`);
    out.push(path(shape, 'none', `stroke="#6e5a36" stroke-width="1.1"`));
    for (const t of [0.15, 0.5, 0.85]) {
      const q = lerp(bottom[0], bottom[2], t);
      out.push(circle([q[0], q[1] + (t === 0.5 ? sag * 0.2 : 2)], 1.6, '#d9a441', `stroke="${INK}" stroke-width="0.6"`));
    }
  }
  for (let k = 0; k < fish; k++) {
    const v = len * (0.36 + (0.58 * k) / Math.max(1, fish - 1));
    const t = p(0, v, h - 5);
    const drop = R.range(5, 9);
    out.push(line([t, [t[0], t[1] + drop]], 0.8, '#5a4a36'));
    out.push(hangingFish(t[0], t[1] + drop, R.range(15, 19), R));
  }
  out.push(frame(0));
  const ext = [p(-spread - 3, 0, 0), p(spread + 3, 0, 0), p(-spread, len, 0), p(spread + 3, len, 0), apex(-6), apex(len + 8), p(0, len, h + 6), p(0, 0, h + 6)];
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

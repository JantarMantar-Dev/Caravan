// Rocks as broken stone chunks, in layers:
//
//   1 silhouette    irregular and angular: unequal corners, a slanted peak
//                   off to one side, a broad base
//   2 base colour   medium grey, a touch warm
//   3 shadow planes one or two darker, cooler faces that explain the volume
//   4 lit plane     one broad flat pale face towards the upper-left light
//   5 details       a crack or two running along the faces
//   6 contact       a compact shadow on land; in water a darker wet foot,
//                   and the water shader breaks white foam around it
//
// Groups are asymmetric: one dominant stone, a few smaller ones beside it,
// their bases sunk into the ground.
import { INK, IW, IW2, IW3, rng, f, P, ellipse, id, bboxOf, line, mix } from './util.js';

export const STONE = { lit: '#d2ccc4', base: '#a39d96', shade: '#7b7d89', deep: '#5d5f6f', wet: '#55707e' };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const polyD = (a) => 'M' + a.map(P).join('L') + 'Z';

// one stone. foot (px, py): middle of its base; bw, bh: width and height
function boulder(R, px, py, bw, bh, peak, wet, pal, buried) {
  const s = R() < 0.62 ? 1 : -1;                         // which way the peak leans (mostly right)
  const sink = buried ? bh * R.range(0.1, 0.22) : 0;     // base hidden in the ground
  const BL = [px - bw * R.range(0.46, 0.52), py + bh * 0.02];
  const BR = [px + bw * R.range(0.46, 0.52), py + bh * 0.05];
  const P0 = [px + s * bw * R.range(0.0, 0.14), py - bh];
  // shoulders at unequal heights; a second top vertex makes the peak slant
  const LS = [px - bw * R.range(0.32, 0.42), py - bh * R.range(0.6, 0.85)];
  const RS = [px + bw * R.range(0.3, 0.4), py - bh * R.range(0.52, 0.78)];
  const slantTo = s > 0 ? LS : RS;
  const T2 = [P0[0] + (slantTo[0] - P0[0]) * R.range(0.45, 0.7), P0[1] + bh * R.range(0.06, 0.16) * (0.6 + peak)];
  const top = s > 0 ? [LS, T2, P0, RS] : [LS, P0, T2, RS];
  // a notch somewhere on the lower flanks keeps it from looking cut out
  const notchL = [lerp(BL, LS, 0.45)[0] - bw * R.range(0.03, 0.08), lerp(BL, LS, 0.45)[1]];
  const sil = [BL, notchL, ...top, BR];
  const d = polyD(sil);
  // inner vertices: the ridge from the peak down to the base, and the break
  // between the lit plane and the plain front
  const M = [P0[0] + bw * R.range(-0.02, 0.06), py - bh * R.range(0.4, 0.52)];
  const B = [px + bw * R.range(0.02, 0.12), py + bh * 0.04];
  const K = [px - bw * R.range(0.3, 0.42), py - bh * R.range(0.12, 0.26)];
  const out = [];
  const clip = id('rk');
  out.push(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
  out.push(`<path d="${d}" fill="${pal.base}" stroke="${INK}" stroke-width="${f(IW)}" stroke-linejoin="round"/>`);
  out.push(`<g clip-path="url(#${clip})">`);
  const big = bw * 2;
  // 4. lit plane: the upper-left face, from the left shoulder up over the peak
  const lit = [top[0], ...top.slice(1, top.indexOf(P0) + 1), M, K];
  out.push(`<path d="${polyD(lit)}" fill="${pal.lit}"/>`);
  // 3. shadow planes: the right face, and a darker one low on it
  const right = [P0, ...top.slice(top.indexOf(P0) + 1), [RS[0] + big, RS[1]], [BR[0] + big, BR[1] + big], [B[0], B[1] + big], B, M];
  out.push(`<path d="${polyD(right)}" fill="${pal.shade}"/>`);
  const lowF = [lerp(M, B, 0.45), lerp(RS, BR, 0.35), [BR[0] + big, BR[1] - bh * 0.1], [BR[0] + big, BR[1] + big], [B[0], B[1] + big], B];
  if (bw > 20) out.push(`<path d="${polyD(lowF)}" fill="${pal.deep}"/>`);
  // 6. the foot: wet and dark in the water, sunk and shaded on land
  if (wet) out.push(`<path d="M${f(px - big)},${f(py - bh * 0.1)}L${f(px + big)},${f(py - bh * 0.06)}L${f(px + big)},${f(py + big)}L${f(px - big)},${f(py + big)}Z" fill="${pal.wet}" opacity="0.8"/>`);
  else if (sink) out.push(`<path d="M${f(px - big)},${f(py - sink * 0.4)}L${f(px + big)},${f(py - sink * 0.2)}L${f(px + big)},${f(py + big)}L${f(px - big)},${f(py + big)}Z" fill="${pal.deep}" opacity="0.35"/>`);
  out.push('</g>');
  // plane edges: the ridge as a structural line, the lit-plane break lighter
  out.push(line([P0, M, B], IW2));
  out.push(line([K, M], IW3, INK, 'opacity="0.7"'));
  // 5. a crack following the lit face, and one on the shadow face if large
  if (bw > 16) {
    const c0 = lerp(top[0], P0, R.range(0.3, 0.6));
    const c1 = lerp(c0, K, R.range(0.35, 0.55));
    out.push(line([c0, c1, [c1[0] + bw * 0.04, c1[1] + bh * 0.06]], IW3));
  }
  if (bw > 34) {
    const c0 = lerp(M, RS, R.range(0.3, 0.5));
    out.push(line([c0, lerp(c0, B, 0.35)], IW3));
  }
  const ys = sil.map((p) => p[1]);
  return { svg: out.join(''), ext: [[px - bw * 0.56 - IW, Math.min(...ys) - IW], [px + bw * 0.56 + IW, py + bh * 0.08 + IW]] };
}

// one rock or a cluster. foot (x, y): the middle of its base; w, h: the
// cluster's size; n: stones; peak 0 (rounded) .. 1 (crag); wet: in water
export function rock({ x, y, w = 40, h = 30, n = 1, seed = 1, peak = 0.3, wet = false, pal = STONE }) {
  const R = rng(seed);
  const parts = [];
  if (n === 1) parts.push([x, y, w, h, false]);
  else {
    // one dominant stone off-centre, smaller ones to one side and in front,
    // sunk lower into the ground
    const side = R() < 0.5 ? 1 : -1;
    parts.push([x - side * w * 0.12, y - h * 0.08, w * 0.6, h * 0.82, false]);
    const slots = [[0.3, 0.04, 0.42], [-0.34, 0.08, 0.32], [0.1, 0.16, 0.26], [0.48, 0.14, 0.22], [-0.12, 0.2, 0.18]];
    for (let i = 1; i < n; i++) {
      const [dx, dy, s] = slots[(i - 1) % slots.length];
      parts.push([x + side * dx * w + R.range(-2, 2), y + dy * h, w * s * R.range(0.9, 1.1), h * s * R.range(0.95, 1.3), true]);
    }
  }
  parts.sort((a, b) => a[1] - b[1]);
  const out = [];
  if (!wet) out.push(ellipse([x + w * 0.1, y + 0.5], w * 0.5, h * 0.11, 'rgba(30,40,10,0.24)'));
  const ext = [], stands = [];
  for (const [px, py, bw, bh, buried] of parts) {
    const b = boulder(R, px, py, bw, bh, peak, wet, pal, buried);
    out.push(b.svg); ext.push(...b.ext);
    if (wet) stands.push([px, py - bh * 0.06, bw * 0.47, bw * 0.16]);
  }
  return { svg: out.join(''), box: bboxOf([...ext, [x - w * 0.6, y + h * 0.2], [x + w * 0.75, y + h * 0.2]]), foot: [x, y], stands };
}

export { mix };

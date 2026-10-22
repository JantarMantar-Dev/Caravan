// Rocks: one asset per rock or cluster, whole boulders with a lit face, a
// shaded face, a cracked edge or two and a full ink outline. A rock standing
// in water gets a wet band at its foot; the water shader draws the foam
// around it, so the rock itself never carries painted foam.
import { INK, IW, IW2, rng, f, path, rounded, ellipse, circle, id, bboxOf, line, mix, lgrad, scallop } from './util.js';

export const STONE = { hi: '#f5f1ea', light: '#d8cfc4', mid: '#9d9894', dark: '#77737a', deep: '#545160', wet: '#4e6b78' };

function boulder(R, px, py, bw, bh, peak, wet, pal) {
  // silhouette: base corners plus 4-6 vertices over the top; a crag pulls its
  // top vertex up into a point and pinches the shoulders
  const k = 6 + Math.floor(R() * 2) + (bw > 50 ? 1 : 0);
  const apex = R.range(0.38, 0.62);                    // where the top sits, 0 right .. 1 left
  const up = [];
  for (let i = 0; i <= k; i++) {
    const t = i / k;
    const ang = Math.PI * t;
    const near = 1 - Math.min(1, Math.abs(t - apex) / 0.5);
    const round = Math.pow(Math.sin(ang), 0.55);
    const crag = Math.pow(near, 1.6);
    const lift = (1 - peak) * round + peak * crag;
    const jx = i === 0 || i === k ? 1 : R.range(0.84, 1.02);
    up.push([px + Math.cos(ang) * bw * 0.5 * jx, py - bh * Math.max(0.08, lift) * (i === 0 || i === k ? 0.5 : R.range(0.86, 1.0))]);
  }
  const pts = [...up, [px - bw * 0.42, py + bh * 0.04], [px + bw * 0.38, py + bh * 0.05]];
  let ti = 1;
  for (let i = 1; i < k; i++) if (up[i][1] < up[ti][1]) ti = i;
  const T = up[ti];
  // ridge from the top down to the base, a little right of centre
  const B = [px + bw * R.range(0.06, 0.2), py + bh * 0.04];
  const M = [T[0] + (B[0] - T[0]) * 0.5 + bw * R.range(0.04, 0.1), T[1] + (B[1] - T[1]) * 0.45];
  const d = rounded(pts, Math.min(bw, bh) * 0.12);
  const clip = id('rk');
  const out = [];
  out.push(path(d, INK, `stroke="${INK}" stroke-width="${f(IW * 2)}" stroke-linejoin="round"`));
  out.push(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
  const [g1, f1] = lgrad([[0, pal.hi], [0.45, pal.light], [1, mix(pal.light, pal.mid, 0.6)]], 0.2, 0, 0.5, 1);
  out.push(g1 + path(d, f1));
  out.push(`<g clip-path="url(#${clip})">`);
  const big = bw * 2;
  // shaded face: right of the ridge, cooler and darker towards the foot
  const [g2, f2] = lgrad([[0, pal.mid], [0.6, pal.dark], [1, pal.deep]], 0, 0, 0.3, 1, 'objectBoundingBox');
  out.push(g2 + path(`M${f(T[0])},${f(T[1] - 1)}L${f(M[0])},${f(M[1])}L${f(B[0])},${f(py + bh * 0.2)}L${f(px + bw * 0.6)},${f(py + bh * 0.2)}L${f(px + bw * 0.6)},${f(T[1] - 1)}Z`, f2));
  // second facet on the shaded face, darker, from a shoulder vertex down
  const sh = up[Math.max(0, ti - Math.max(1, Math.round(ti * 0.6)))];
  const S2 = [sh[0] - bw * 0.06, sh[1] + bh * 0.08];
  out.push(path(`M${f(S2[0])},${f(S2[1])}L${f(px + bw * R.range(0.28, 0.36))},${f(py + 3)}L${f(px + big)},${f(py + big)}L${f(px + big)},${f(S2[1] - big)}Z`, pal.deep, 'opacity="0.55"'));
  // top facet catching the light, left of the ridge
  const lt = up[Math.min(k, ti + 1)];
  out.push(path(`M${f(T[0])},${f(T[1])}L${f(lt[0])},${f(lt[1])}L${f(lt[0] + bw * 0.06)},${f(lt[1] + bh * 0.22)}L${f(M[0] - bw * 0.1)},${f(M[1] - bh * 0.05)}Z`, pal.hi));
  // the foot of the rock in its own shadow
  out.push(path(`M${f(px - big)},${f(py - bh * 0.1)}Q${f(px)},${f(py - bh * 0.2)} ${f(px + big)},${f(py - bh * 0.3)}L${f(px + big)},${f(py + big)}L${f(px - big)},${f(py + big)}Z`, pal.deep, 'opacity="0.35"'));
  // stone grain: pits and flecks
  for (let k = 0; k < Math.round(bw * bh / 140); k++) {
    const sx = px + R.range(-0.45, 0.45) * bw, sy = py - R.range(0.05, 0.9) * bh;
    out.push(circle([sx, sy], R.range(0.3, 0.6), R() < 0.6 ? pal.deep : pal.hi, `opacity="${f(R.range(0.25, 0.5))}"`));
  }
  if (wet) {
    // wet and darker at the waterline, weed in the splash zone, a bright sheen above
    const [g3, f3] = lgrad([[0, pal.wet, 0], [0.5, pal.wet, 0.5], [1, '#2a4650', 0.85]], 0, 0, 0, 1);
    out.push(g3 + `<path d="M${f(px - bw)},${f(py - bh * 0.13)}Q${f(px)},${f(py - bh * 0.2)} ${f(px + bw)},${f(py - bh * 0.12)}L${f(px + bw)},${f(py + bh * 0.2)}L${f(px - bw)},${f(py + bh * 0.2)}Z" fill="${f3}"/>`);
    out.push(line([[px - bw * 0.4, py - bh * 0.17], [px - bw * 0.05, py - bh * 0.21], [px + bw * 0.2, py - bh * 0.18]], 0.9, '#f2fbff', 'opacity="0.7"'));
  } else {
    // moss on the lit shoulders of a dry rock
    for (let k = 0; k < 1 + Math.round(bw / 30); k++) {
      const q = up[Math.min(k + ti + 1, up.length - 1)];
      out.push(`<path d="${scallop(q[0] + bw * 0.04, q[1] + bh * 0.06, Math.max(2.2, bw * R.range(0.06, 0.1)), R, 5, 0.35)}" fill="#7fae33" stroke="#3f6216" stroke-width="0.6"/>`);
    }
  }
  // ridge, facet edge and a crack or two
  out.push(line([[T[0] - 1.6, T[1] + 3], [M[0] - 1.8, M[1]], [B[0] - 2.6, py - bh * 0.18]], 1.1, '#ffffff', 'opacity="0.75"'));
  out.push(line([T, M, [B[0] - 1, py - bh * 0.1]], IW2, INK));
  out.push(line([S2, [S2[0] + bw * 0.05, S2[1] + bh * 0.25]], IW2 * 0.9, INK, 'opacity="0.8"'));
  for (let c = 0; c < 1 + (bw > 40 ? 1 : 0); c++) {
    const e = up[1 + Math.floor(R() * (k - 1))];
    const ix = e[0] + (px - e[0]) * R.range(0.15, 0.3), iy = e[1] + (py - bh * 0.5 - e[1]) * R.range(0.15, 0.3);
    out.push(line([e, [ix, iy], [ix + R.range(-3, 3), iy + R.range(2, 4)]], IW2 * 0.95));
  }
  out.push('</g>');
  return { svg: out.join(''), ext: [[px - bw * 0.55 - IW, Math.min(...up.map((p) => p[1])) - IW], [px + bw * 0.55 + IW, py + bh * 0.08 + IW]] };
}

// one rock or a cluster. foot (x, y): the middle of its base; w, h: the
// cluster's size; n: boulders; peak 0 (rounded) .. 1 (crag); wet: stands in water
export function rock({ x, y, w = 40, h = 30, n = 1, seed = 1, peak = 0.3, wet = false, pal = STONE }) {
  const R = rng(seed);
  const parts = [];
  if (n === 1) parts.push([x, y, w, h]);
  else if (n <= 3) {
    // the biggest boulder at the back, the rest in front and to the sides
    parts.push([x + w * R.range(-0.08, 0.08), y - h * 0.18, w * 0.62, h]);
    for (let i = 1; i < n; i++) {
      const side = i % 2 ? -1 : 1;
      const s = R.range(0.45, 0.62) * 0.85;
      parts.push([x + side * w * 0.38 + R.range(-2, 2), y + h * 0.06, w * s, h * s * R.range(0.85, 1.05)]);
    }
  } else {
    // a crag: a back row of tall peaks, a front row of lower boulders
    const back = Math.ceil(n / 2), front = n - back;
    for (let i = 0; i < back; i++) {
      const t = back === 1 ? 0.5 : i / (back - 1);
      parts.push([x + (t - 0.5) * w * 0.6 + R.range(-3, 3), y - h * 0.2 + R.range(-3, 3), w * R.range(0.44, 0.52), h * R.range(0.72, 0.86) * (t === 0.5 ? 1 : 0.88)]);
    }
    for (let i = 0; i < front; i++) {
      const t = front === 1 ? 0.5 : i / (front - 1);
      parts.push([x + (t - 0.5) * w * 0.78 + R.range(-3, 3), y + R.range(-2, 3), w * R.range(0.34, 0.42), h * R.range(0.4, 0.52)]);
    }
  }
  parts.sort((a, b) => a[1] - b[1]);
  const out = [];
  if (!wet) out.push(ellipse([x + w * 0.12, y + 1], w * 0.58, h * 0.16, 'rgba(30,40,10,0.22)'));
  const ext = [], stands = [];
  for (const [px, py, bw, bh] of parts) {
    const b = boulder(R, px, py, bw, bh, peak, wet, pal);
    out.push(b.svg); ext.push(...b.ext);
    // where the water meets this boulder: an ellipse a little inside its foot
    if (wet) stands.push([px, py - bh * 0.06, bw * 0.47, bw * 0.16]);
  }
  return { svg: out.join(''), box: bboxOf([...ext, [x - w * 0.6, y + h * 0.2], [x + w * 0.75, y + h * 0.2]]), foot: [x, y], stands };
}

export { mix };

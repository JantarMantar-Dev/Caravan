// Rocks: one asset per rock or cluster, one main angular mass plus smaller
// stones, each in flat planes (lit face, cool shadow face, one small
// highlight) with a full ink outline and a crack only where it reads. A rock standing
// in water gets a wet band at its foot; the water shader draws the foam
// around it, so the rock itself never carries painted foam.
import { INK, IW, IW2, IW3, rng, f, path, rounded, ellipse, id, bboxOf, line, mix, scallop } from './util.js';

export const STONE = { hi: '#ece8e1', light: '#cdc8c1', mid: '#a7a5a6', dark: '#7f8291', deep: '#636677', wet: '#55707e' };

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
  // flat planes: the lit face, a cool shadow face right of the ridge, a
  // darker facet low on the shadow side; one small highlight on top
  out.push(path(d, pal.light));
  out.push(`<g clip-path="url(#${clip})">`);
  const big = bw * 2;
  out.push(path(`M${f(T[0])},${f(T[1] - 1)}L${f(M[0])},${f(M[1])}L${f(B[0])},${f(py + bh * 0.2)}L${f(px + bw * 0.6)},${f(py + bh * 0.2)}L${f(px + bw * 0.6)},${f(T[1] - 1)}Z`, pal.dark));
  const sh = up[Math.max(0, ti - Math.max(1, Math.round(ti * 0.6)))];
  const S2 = [sh[0] - bw * 0.06, sh[1] + bh * 0.1];
  out.push(path(`M${f(S2[0])},${f(S2[1])}L${f(px + bw * R.range(0.28, 0.36))},${f(py + 3)}L${f(px + big)},${f(py + big)}L${f(px + big)},${f(S2[1] - big)}Z`, pal.deep));
  if (bw > 26) {
    const lt = up[Math.min(k, ti + 1)];
    out.push(path(`M${f(T[0])},${f(T[1])}L${f(lt[0])},${f(lt[1])}L${f(lt[0] + bw * 0.05)},${f(lt[1] + bh * 0.16)}L${f(M[0] - bw * 0.12)},${f(M[1] - bh * 0.12)}Z`, pal.hi));
  }
  // the foot sits in the ground (or the water): a flat dark band
  if (wet) out.push(`<path d="M${f(px - bw)},${f(py - bh * 0.09)}Q${f(px)},${f(py - bh * 0.13)} ${f(px + bw)},${f(py - bh * 0.07)}L${f(px + bw)},${f(py + bh)}L${f(px - bw)},${f(py + bh)}Z" fill="${pal.wet}" opacity="0.75"/>`);
  else {
    out.push(path(`M${f(px - big)},${f(py - bh * 0.08)}Q${f(px)},${f(py - bh * 0.14)} ${f(px + big)},${f(py - bh * 0.2)}L${f(px + big)},${f(py + big)}L${f(px - big)},${f(py + big)}Z`, pal.deep, 'opacity="0.5"'));
  }
  // the ridge, and a crack only on the bigger stones
  out.push(line([T, M, [B[0] - 1, py - bh * 0.1]], IW2, INK));
  if (bw > 34) {
    const e = up[1 + Math.floor(R() * (k - 1))];
    const ix = e[0] + (px - e[0]) * R.range(0.15, 0.25), iy = e[1] + (py - bh * 0.5 - e[1]) * R.range(0.15, 0.25);
    out.push(line([e, [ix, iy], [ix + R.range(-2, 2), iy + R.range(2, 3)]], IW3));
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
  else {
    // one main angular mass, the rest smaller and stepping down to each side
    parts.push([x - w * 0.06, y - h * 0.1, w * 0.56, h]);
    const slots = [[0.34, 0.02, 0.5], [-0.36, 0.06, 0.42], [0.12, 0.16, 0.34], [0.52, 0.12, 0.28], [-0.14, 0.2, 0.26]];
    for (let i = 1; i < n; i++) {
      const [dx, dy, s] = slots[(i - 1) % slots.length];
      parts.push([x + dx * w + R.range(-2, 2), y + dy * h, w * s * R.range(0.92, 1.05), h * s * R.range(1.0, 1.2)]);
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

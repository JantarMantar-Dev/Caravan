// Trees and bushes, modelled on the reference: a crown is a cloud of leaf
// clumps stacked in rows, each clump lit on its own (yellow-green on the
// upper left, mid green, a dark crescent under it), so the separations
// between clumps come from the shading, not from ink. Only the outer
// silhouette is inked; its edge is finely scalloped like leaf clusters.
//
//   broad     tall round crown, the big tree of the tile
//   spread    wider than tall, leaning to one side
//   sapling   small crown on a slim trunk
//   bush      low shrub sitting on the ground
//   pine      fir of lumpy, scalloped tiers
import { INK, IW, rng, f, ellipse, path, smooth, id, bboxOf, scallop } from './util.js';

export const LEAF = { ink: INK, deep: '#1e6a31', dark: '#2c8a3a', mid: '#4dab37', light: '#8fcd3c', hi: '#c8e35a' };
export const PINE = { ink: INK, deep: '#11583a', dark: '#1b7745', mid: '#2f9750', light: '#5cb350', hi: '#93cf58' };
const BARK = { base: '#9a6332', light: '#b97e44', dark: '#64401f' };
const SHADOW = 'rgba(28,70,8,0.26)';

// clump layouts per form: [x, y, r] in crown radii around the crown centre,
// back rows first so the front clumps overlap the ones behind
const FORMS = {
  broad: [
    [0.06, -0.6, 0.46],
    [-0.44, -0.2, 0.46], [0.46, -0.24, 0.46],
    [-0.36, 0.24, 0.44], [0.38, 0.22, 0.44], [0.02, 0.06, 0.5],
  ],
  spread: [
    [-0.2, -0.5, 0.44], [0.38, -0.44, 0.4],
    [-0.7, -0.04, 0.4], [0.72, 0.0, 0.36],
    [-0.36, 0.26, 0.42], [0.3, 0.24, 0.44], [-0.02, -0.06, 0.5],
  ],
  sapling: [
    [0.02, -0.46, 0.5],
    [-0.36, 0.04, 0.46], [0.38, 0.02, 0.46],
  ],
  bush: [
    [-0.1, -0.42, 0.46],
    [-0.52, -0.04, 0.44], [0.48, -0.06, 0.44],
    [0, 0.08, 0.5],
  ],
};

// one clump of leaves: mid green, a dark crescent low on the right, a leafy
// lit patch upper left and a couple of bright dabs where the sun hits hardest
function clump(R, x, y, q, pal, lit, d, low) {
  const n = 5;
  const c = id('cl');
  let s = `<clipPath id="${c}"><path d="${d}"/></clipPath>` + path(d, pal.mid) + `<g clip-path="url(#${c})">`;
  s += path(scallop(x + q * 0.3, y + q * 0.66, q * 0.95, R, n, 0.24), pal.dark);
  if (low) s += path(scallop(x + q * 0.45, y + q * 1.1, q * 0.8, R, n, 0.24), pal.deep);
  // the lit patch spills over the upper-left edge, so light reads as the
  // sunny side of the clump rather than a spot in its middle
  const L = q * (0.55 + 0.3 * lit);
  s += path(scallop(x - q * 0.4, y - q * 0.46, L, R, 5, 0.34), pal.light);
  if (lit > 0.5 && q > 7) {
    for (let k = 0; k < 2; k++) {
      const a = R.range(Math.PI * 1.05, Math.PI * 1.45), r = q * R.range(0.3, 0.5);
      s += path(scallop(x - q * 0.15 + Math.cos(a) * r, y - q * 0.2 + Math.sin(a) * r * 0.8, q * R.range(0.07, 0.11), R, 5, 0.3), pal.hi);
    }
  }
  return s + '</g>';
}

function crown(R, C, pal, cx, r) {
  const out = [];
  // the outer ink silhouette: every clump stroked, then all filled over it
  const shapes = C.map(([x, y, q]) => scallop(x, y, q, R, Math.max(7, Math.round(q * 0.7)), 0.16));
  out.push(`<g fill="${pal.deep}" stroke="${pal.ink}" stroke-width="${f(IW * 2)}" stroke-linejoin="round">${shapes.map((d) => `<path d="${d}"/>`).join('')}</g>`);
  out.push(`<g fill="${pal.deep}">${shapes.map((d) => `<path d="${d}"/>`).join('')}</g>`);
  // clumps on the left and top catch more light than those on the right
  const R2 = rng(Math.round(cx * 7 + r * 13));
  const cyc = C.reduce((a, c) => a + c[1], 0) / C.length;
  C.forEach(([x, y, q], i) => {
    const lit = Math.max(0, Math.min(1, 0.6 - (x - cx) / (r * 1.6) - (y - (C[0][1])) / (r * 3)));
    out.push(clump(R2, x, y, q, pal, lit, shapes[i], y > cyc));
  });
  return out.join('');
}

// trunk: lit left side, shaded right, short flared roots
function trunk(R, x, y, top, w0, w1) {
  const bend = R.range(-0.1, 0.1) * w0;
  const h = y - top;
  const L = [
    [x - w0 * 1.15, y + 0.6], [x - w0 * 0.55, y - h * 0.1], [x - w1 * 0.5 + bend, y - h * 0.55], [x - w1 * 0.55 + bend * 1.4, top],
    [x + w1 * 0.55 + bend * 1.4, top], [x + w1 * 0.5 + bend, y - h * 0.55], [x + w0 * 0.55, y - h * 0.1], [x + w0 * 1.2, y + 0.6],
  ];
  const d = smooth(L, true, 0.6);
  const clip = id('tr');
  return `<clipPath id="${clip}"><path d="${d}"/></clipPath>` +
    path(d, BARK.base, `stroke="${INK}" stroke-width="${f(IW)}" stroke-linejoin="round"`) +
    `<g clip-path="url(#${clip})">` +
    path(`M${f(x - w1 * 0.55 + bend)},${f(top - 2)}L${f(x - w1 * 0.05 + bend)},${f(top - 2)}L${f(x - w0 * 0.1)},${f(y + 2)}L${f(x - w0 * 1.3)},${f(y + 2)}Z`, BARK.light) +
    path(`M${f(x + w1 * 0.2 + bend)},${f(top - 2)}L${f(x + w0 * 0.3)},${f(y + 2)}L${f(x + w0 * 1.4)},${f(y + 2)}L${f(x + w1 + bend * 1.4)},${f(top - 2)}Z`, BARK.dark) +
    // the root split
    path(`M${f(x + w0 * 0.15)},${f(y + 1)}Q${f(x + w0 * 0.1)},${f(y - h * 0.12)} ${f(x - w0 * 0.05)},${f(y - h * 0.2)}`, 'none', `stroke="${INK}" stroke-width="0.8" stroke-linecap="round"`) +
    '</g>';
}

function clumpsFor(form, R, cx, cy, r, flip) {
  return FORMS[form].map(([u, v, q]) => [cx + (flip ? -u : u) * r + R.range(-0.04, 0.04) * r, cy + v * r + R.range(-0.04, 0.04) * r, q * r * R.range(0.94, 1.06)]);
}

// leafy tree. foot: where the trunk meets the ground; r: crown radius
export function tree({ x, y, r = 30, h, form = 'broad', flip = false, seed = 1, pal = LEAF }) {
  const R = rng(seed);
  const tall = { broad: 1.08, spread: 0.94, sapling: 1.12 }[form] ?? 1.08;
  h = h ?? r * tall;
  const off = form === 'sapling' ? r * 0.1 * (flip ? -1 : 1) : form === 'spread' ? r * 0.1 * (flip ? -1 : 1) : 0;
  const cx = x + off, cy = y - h;
  const C = clumpsFor(form, R, cx, cy, r, flip);
  const thick = form === 'sapling' ? [0.24, 0.17] : [0.3, 0.2];
  const svg = ellipse([x + r * 0.4, y - r * 0.04], r * (form === 'sapling' ? 0.65 : 1.0), r * 0.3, SHADOW) +
    trunk(R, x, y, cy + r * 0.2, r * thick[0], r * thick[1]) +
    crown(R, C, pal, cx, r);
  const ext = C.flatMap(([a, b, q]) => [[a - q * 1.2 - IW * 2, b - q * 1.2 - IW * 2], [a + q * 1.2 + IW * 2, b + q * 1.2 + IW * 2]]);
  return { svg, box: bboxOf([...ext, [x - r, y + r * 0.4], [x + r * 1.45, y]]), foot: [x, y] };
}

// low shrub sitting on the ground
export function bush({ x, y, r = 12, seed = 1, pal = LEAF }) {
  const R = rng(seed);
  const cy = y - r * 0.5;
  const C = clumpsFor('bush', R, x, cy, r, R() < 0.5);
  const svg = ellipse([x + r * 0.25, y - 0.5], r * 1.1, r * 0.32, SHADOW) + crown(R, C, pal, x, r);
  const ext = C.flatMap(([a, b, q]) => [[a - q * 1.2 - IW * 2, b - q * 1.2 - IW * 2], [a + q * 1.2 + IW * 2, b + q * 1.2 + IW * 2]]);
  return { svg, box: bboxOf([...ext, [x - r * 0.9, y + r * 0.4], [x + r * 1.4, y]]), foot: [x, y] };
}

// fir: a cone of leaf clumps in rows, wide at the bottom, one pointed clump
// on top; each row's dark hem falls over the lit tops of the row below
export function pine({ x, y, w = 50, h = 84, tiers = 4, seed = 1, pal = PINE }) {
  const R = rng(seed);
  const rows = Math.max(tiers, 4) + 1;
  const base = y - h * 0.12, top = y - h;
  const out = [ellipse([x + w * 0.24, y - 0.5], w * 0.52, w * 0.17, SHADOW)];
  out.push(trunk(R, x, y, base - 6, w * 0.1, w * 0.08));
  const C = [];
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const hw = (w / 2) * (1 - t * 0.88) + 1.5;
    const cyR = base - (base - top) * (0.1 + t * 0.78);
    const n = i === rows - 1 ? 1 : Math.max(1, Math.round((2 * hw) / (w * 0.42)));
    const q = i === rows - 1 ? hw * 1.1 : (hw / n) * 1.3 + 2;
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0 : -hw + q * 0.8 + ((2 * hw - q * 1.6) * k) / (n - 1);
      C.push([x + u + R.range(-1, 1), cyR + Math.abs(u) * -0.15 + R.range(-1, 1), q * R.range(0.95, 1.05)]);
    }
  }
  // rows from the bottom up, so each row overlaps the one below; the clumps
  // are squashed into wide drooping skirts so the rows read as tiers
  const SQ = 0.62;
  const squash = (a, b, inner) => `<g transform="translate(${f(a)} ${f(b)}) scale(1 ${SQ}) translate(${f(-a)} ${f(-b)})">${inner}</g>`;
  const shapes = C.map(([a, b, q], i) => i === C.length - 1 ? tip(a, b, q) : scallop(a, b, q, R, Math.max(7, Math.round(q * 0.7)), 0.16));
  const sq = (i, inner) => i === C.length - 1 ? inner : squash(C[i][0], C[i][1], inner);
  shapes.forEach((d, i) => out.push(sq(i, `<path d="${d}" fill="${pal.deep}" stroke="${pal.ink}" stroke-width="${f(IW * 2)}" stroke-linejoin="round"/>`)));
  shapes.forEach((d, i) => {
    const [a, b, q] = C[i];
    const lit = Math.max(0, Math.min(1, 0.55 - (a - x) / (w * 0.6)));
    if (i === C.length - 1) {
      const c = id('pt');
      out.push(`<clipPath id="${c}"><path d="${d}"/></clipPath>` + path(d, pal.mid) + `<g clip-path="url(#${c})">` +
        path(`M${f(a + q * 0.05)},${f(b - q * 2)}L${f(a + q * 1.5)},${f(b + q * 2)}L${f(a - q * 0.1)},${f(b + q * 2)}Z`, pal.dark) +
        path(scallop(a - q * 0.45, b - q * 0.1, q * 0.55, R, 6, 0.3), pal.light) + '</g>');
    } else out.push(sq(i, clump(R, a, b, q, pal, lit, d, true)));
  });
  const all = C.flatMap(([a, b, q]) => [[a - q * 1.2 - IW * 2, b - q * 1.2 - IW * 2], [a + q * 1.2 + IW * 2, b + q * 1.2 + IW * 2]]);
  all.push([x, top - 4]);
  return { svg: out.join(''), box: bboxOf([...all, [x - w / 2, y + 4], [x + w * 0.8, y]]), foot: [x, y] };
}

// the pointed top of a fir: a leafy drop shape
function tip(x, y, q) {
  return `M${f(x)},${f(y - q * 1.9)}Q${f(x + q * 0.35)},${f(y - q * 0.9)} ${f(x + q * 1.05)},${f(y + q * 0.3)}Q${f(x + q * 0.9)},${f(y + q * 0.95)} ${f(x + q * 0.2)},${f(y + q * 0.8)}Q${f(x - q * 0.3)},${f(y + q * 1.05)} ${f(x - q * 1.0)},${f(y + q * 0.5)}Q${f(x - q * 0.95)},${f(y - q * 0.1)} ${f(x - q * 0.3)},${f(y - q * 0.9)}Q${f(x - q * 0.1)},${f(y - q * 1.3)} ${f(x)},${f(y - q * 1.9)}Z`;
}

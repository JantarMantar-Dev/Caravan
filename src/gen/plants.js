// Trees and bushes, built in layers like the reference:
//
//   1 ground shadow     a restrained flat shape anchoring the tree
//   2 trunk, branches   tapered, one darker side; branches vanish into leaves
//   3 silhouette        one irregular crown: big bulges and small
//                       interruptions, inked once on the outside
//   4 dark mass         the whole crown filled dark: a connected underside
//                       and interior shadow that several lobes share
//   5 main green        a few broad interlocking patches, one per cluster of
//                       lobes, pushed up-left so the shadow stays below
//   6 highlights        two or three flat yellow-green shapes, merged across
//                       lobes and gathered towards the light
//   7 interior lines    a couple of short curves between major clusters
//
//   forms: broad, spread, sapling, bush; pine is its own fir of uneven tiers
import { INK, IW, IW3, rng, f, ellipse, path, smooth, id, bboxOf, scallop } from './util.js';

export const LEAF = { ink: INK, dark: '#24753a', mid: '#4ba636', light: '#9ccf3c' };
export const PINE = { ink: INK, dark: '#155f3d', mid: '#2c8f4c', light: '#68b84e' };
const BARK = { base: '#9a6332', dark: '#62401f' };
const SHADOW = 'rgba(28,70,8,0.24)';

// lobes per form: [x, y, r, cluster] in crown radii around the crown centre.
// Clusters are drawn in order, so later ones overlap earlier ones.
const FORMS = {
  broad: [
    [0.04, -0.58, 0.44, 0], [-0.36, -0.46, 0.3, 0], [0.42, -0.44, 0.32, 0], [0.18, -0.82, 0.18, 0],
    [-0.52, -0.02, 0.4, 1], [-0.24, 0.3, 0.38, 1], [-0.78, 0.22, 0.2, 1], [-0.1, -0.04, 0.42, 1],
    [0.52, -0.06, 0.4, 2], [0.3, 0.32, 0.36, 2], [0.74, 0.24, 0.22, 2],
  ],
  spread: [
    [-0.2, -0.5, 0.42, 0], [0.32, -0.46, 0.36, 0], [-0.56, -0.34, 0.24, 0],
    [-0.72, 0.02, 0.38, 1], [-0.36, 0.26, 0.36, 1], [-0.2, -0.06, 0.4, 1], [-0.98, 0.2, 0.18, 1],
    [0.62, -0.04, 0.36, 2], [0.28, 0.24, 0.38, 2], [0.86, 0.22, 0.2, 2], [0.18, -0.08, 0.36, 2],
  ],
  sapling: [
    [0.02, -0.48, 0.46, 0], [0.32, -0.66, 0.2, 0],
    [-0.34, 0.04, 0.42, 1], [-0.62, 0.18, 0.16, 1],
    [0.36, 0.02, 0.42, 2], [0.06, 0.24, 0.36, 2],
  ],
  bush: [
    [-0.1, -0.38, 0.44, 0], [0.3, -0.32, 0.3, 0],
    [-0.52, 0.0, 0.42, 1], [-0.86, 0.12, 0.2, 1],
    [0.42, -0.02, 0.44, 2], [0.04, 0.1, 0.46, 2],
  ],
};
// highlight patches per cluster: [dx, dy, size] relative to the cluster's
// first lobe, in crown radii; the right-hand cluster gets little or none
const LIGHT = { 0: [[-0.12, -0.08, 0.32], [-0.38, 0.06, 0.14]], 1: [[-0.12, -0.14, 0.24]], 2: [[-0.18, -0.2, 0.1]] };

const lobePath = (R, x, y, q) => scallop(x, y, q, R, Math.max(6, Math.round(q * 0.6)), 0.17);

function crown(R, L, pal, r) {
  const out = [];
  const shapes = L.map(([x, y, q]) => lobePath(R, x, y, q));
  // 3. silhouette, inked once around the whole crown; 4. the dark mass
  out.push(`<g fill="${pal.dark}" stroke="${pal.ink}" stroke-width="${f(IW * 2)}" stroke-linejoin="round">${shapes.map((d) => `<path d="${d}"/>`).join('')}</g>`);
  out.push(`<g fill="${pal.dark}">${shapes.map((d) => `<path d="${d}"/>`).join('')}</g>`);
  const all = id('cw');
  out.push(`<clipPath id="${all}">${shapes.map((d) => `<path d="${d}"/>`).join('')}</clipPath><g clip-path="url(#${all})">`);
  const clusters = [...new Set(L.map((l) => l[3]))];
  for (const c of clusters) {
    const lobes = L.filter((l) => l[3] === c);
    // the cluster's own shadow first, so it reads over the cluster behind
    if (c > 0) out.push(`<g fill="${pal.dark}">${lobes.map(([x, y, q]) => `<path d="${lobePath(R, x, y, q)}"/>`).join('')}</g>`);
    // 5. main green: the cluster's lobes nudged up-left, merged into one patch
    const greens = lobes.map(([x, y, q]) => lobePath(R, x - q * 0.16, y - q * 0.3, q * 0.8));
    const gid = id('cg');
    out.push(`<clipPath id="${gid}">${greens.map((d) => `<path d="${d}"/>`).join('')}</clipPath>`);
    out.push(`<g fill="${pal.mid}">${greens.map((d) => `<path d="${d}"/>`).join('')}</g>`);
    // 6. highlights: a few flat shapes inside the green, towards the light
    const [hx, hy] = lobes[0];
    out.push(`<g clip-path="url(#${gid})" fill="${pal.light}">`);
    for (const [dx, dy, s] of LIGHT[c] ?? []) {
      const q = s * r;
      if (q < 2.5) continue;
      out.push(`<path d="${scallop(hx + dx * r, hy + dy * r, q, R, 5, 0.36)}" transform="rotate(-18 ${f(hx + dx * r)} ${f(hy + dy * r)})"/>`);
    }
    out.push('</g>');
  }
  out.push('</g>');
  // 7. a couple of short curves where the side clusters meet the top one
  for (const c of clusters.slice(1)) {
    const [x, y, q] = L.find((l) => l[3] === c);
    const a0 = Math.PI * 1.15, a1 = Math.PI * 1.42;
    out.push(`<path d="M${f(x + Math.cos(a0) * q)},${f(y + Math.sin(a0) * q)}A${f(q)},${f(q)} 0 0 1 ${f(x + Math.cos(a1) * q)},${f(y + Math.sin(a1) * q)}" fill="none" stroke="${pal.ink}" stroke-width="${f(IW3 * 1.5)}" stroke-linecap="round"/>`);
  }
  return out.join('');
}

// 2. trunk: tapered, a darker right side, root flare, two branches that run
// up into the crown and disappear behind the leaves
function trunk(R, x, y, top, w0, w1, branches = true) {
  const bend = R.range(-0.1, 0.1) * w0;
  const h = y - top;
  const L = [
    [x - w0 * 1.1, y + 0.6], [x - w0 * 0.55, y - h * 0.12], [x - w1 * 0.5 + bend, y - h * 0.6], [x - w1 * 0.45 + bend * 1.4, top],
    [x + w1 * 0.45 + bend * 1.4, top], [x + w1 * 0.5 + bend, y - h * 0.6], [x + w0 * 0.55, y - h * 0.12], [x + w0 * 1.15, y + 0.6],
  ];
  const d = smooth(L, true, 0.6);
  const clip = id('tr');
  let s = '';
  if (branches) {
    const bx = x + bend * 1.4;
    for (const side of [-1, 1]) {
      const ex = bx + side * w0 * R.range(1.6, 2.4), ey = top - h * R.range(0.45, 0.7);
      s += `<path d="M${f(bx)},${f(top + h * 0.1)}Q${f(bx + side * w1 * 0.6)},${f(top - h * 0.2)} ${f(ex)},${f(ey)}" fill="none" stroke="${INK}" stroke-width="${f(w1 * 0.7 + IW * 2)}" stroke-linecap="round"/>`;
      s += `<path d="M${f(bx)},${f(top + h * 0.1)}Q${f(bx + side * w1 * 0.6)},${f(top - h * 0.2)} ${f(ex)},${f(ey)}" fill="none" stroke="${side < 0 ? BARK.base : BARK.dark}" stroke-width="${f(w1 * 0.7)}" stroke-linecap="round"/>`;
    }
  }
  return s + `<clipPath id="${clip}"><path d="${d}"/></clipPath>` +
    path(d, BARK.base, `stroke="${INK}" stroke-width="${f(IW)}" stroke-linejoin="round"`) +
    `<g clip-path="url(#${clip})">` +
    path(`M${f(x + w1 * 0.12 + bend)},${f(top - 2)}L${f(x + w0 * 0.22)},${f(y + 2)}L${f(x + w0 * 1.4)},${f(y + 2)}L${f(x + w1 + bend * 1.4)},${f(top - 2)}Z`, BARK.dark) +
    '</g>';
}

function lobesFor(form, R, cx, cy, r, flip) {
  return FORMS[form].map(([u, v, q, c]) => [cx + (flip ? -u : u) * r + R.range(-0.04, 0.04) * r, cy + v * r + R.range(-0.04, 0.04) * r, q * r * R.range(0.92, 1.08), flip && c ? 3 - c : c])
    .sort((a, b) => a[3] - b[3]);
}

// leafy tree. foot: where the trunk meets the ground; r: crown radius
export function tree({ x, y, r = 30, h, form = 'broad', flip = false, seed = 1, pal = LEAF }) {
  const R = rng(seed);
  const tall = { broad: 1.12, spread: 0.98, sapling: 1.16 }[form] ?? 1.1;
  h = h ?? r * tall;
  const off = form === 'broad' ? 0 : r * 0.1 * (flip ? -1 : 1);
  const cx = x + off, cy = y - h;
  const L = lobesFor(form, R, cx, cy, r, flip);
  const thick = form === 'sapling' ? [0.22, 0.15] : [0.28, 0.18];
  // 1. ground shadow, then trunk, then the crown
  const svg = ellipse([x + r * 0.35, y - r * 0.02], r * (form === 'sapling' ? 0.6 : 0.92), r * 0.26, SHADOW) +
    trunk(R, x, y, cy + r * 0.25, r * thick[0], r * thick[1], form !== 'sapling') +
    crown(R, L, pal, r);
  const ext = L.flatMap(([a, b, q]) => [[a - q * 1.2 - IW * 2, b - q * 1.2 - IW * 2], [a + q * 1.2 + IW * 2, b + q * 1.2 + IW * 2]]);
  return { svg, box: bboxOf([...ext, [x - r, y + r * 0.4], [x + r * 1.4, y]]), foot: [x, y] };
}

// low shrub sitting on the ground
export function bush({ x, y, r = 12, seed = 1, pal = LEAF }) {
  const R = rng(seed);
  const cy = y - r * 0.5;
  const L = lobesFor('bush', R, x, cy, r, R() < 0.5);
  const svg = ellipse([x + r * 0.25, y - 0.5], r * 1.1, r * 0.3, SHADOW) + crown(R, L, pal, r);
  const ext = L.flatMap(([a, b, q]) => [[a - q * 1.2 - IW * 2, b - q * 1.2 - IW * 2], [a + q * 1.2 + IW * 2, b + q * 1.2 + IW * 2]]);
  return { svg, box: bboxOf([...ext, [x - r * 0.9, y + r * 0.4], [x + r * 1.4, y]]), foot: [x, y] };
}

// fir: a pointed silhouette of uneven tiers. Each tier's sides break into a
// couple of branch clusters and its hem droops in lobes of different sizes;
// widths and spacing vary so no two tiers repeat. Shading as for the leafy
// trees: dark mass, a broad green on the lit side, one light shape on the
// upper tiers, and the dark under each tier's hem.
export function pine({ x, y, w = 50, h = 84, tiers = 4, seed = 1, pal = PINE }) {
  const R = rng(seed);
  tiers = w < 25 ? 3 : Math.max(4, tiers + 1);
  const base = y - h * 0.12, top = y - h;
  const out = [ellipse([x + w * 0.24, y - 0.5], w * 0.5, w * 0.15, SHADOW)];
  out.push(trunk(R, x, y, base - 6, w * 0.1, w * 0.08, false));
  // tier hems from the bottom up, uneven gaps
  const gaps = Array.from({ length: tiers }, () => R.range(0.75, 1.3));
  const tot = gaps.reduce((a, b) => a + b, 0);
  const tierShapes = [];
  let acc = 0;
  for (let i = 0; i < tiers; i++) {
    const t = acc / tot;
    acc += gaps[i];
    const by = base - (base - top) * t * 0.86;
    const ay = i === tiers - 1 ? top : base - (base - top) * Math.min(0.97, (acc / tot) * 0.86 + R.range(0.1, 0.16));
    const hw = (w / 2) * (1 - t * 0.9) * R.range(0.82, 1.15) + 2;
    const ax = x + R.range(-1, 1);
    // sides: one or two branch clusters jutting out on each side
    const sideL = [], sideR = [];
    for (const side of [-1, 1]) {
      const arr = side < 0 ? sideL : sideR;
      const n = R() < 0.5 ? 1 : 2;
      for (let k = 1; k <= n; k++) {
        const s = k / (n + 1) + R.range(-0.08, 0.08);
        arr.push([ax + side * hw * s * (1 + R.range(0.06, 0.18)), ay + (by - ay) * s]);
        arr.push([ax + side * hw * (s + 0.06) * 0.9, ay + (by - ay) * (s + 0.1)]);
      }
    }
    // hem: rounded lobes of unequal width, each drooping its own amount
    let hem = '';
    let u = -hw * 1.04;
    while (u < hw * 1.04 - 1) {
      const lw = Math.min(hw * 1.04 - u, hw * R.range(0.55, 0.95));
      const mid = u + lw / 2, droop = R.range(3, 6) + (1 - Math.abs(mid) / hw) * (by - ay) * 0.12;
      hem += `Q${f(ax + mid)},${f(by + droop * 1.8)} ${f(ax + u + lw)},${f(by)}`;
      u += lw;
    }
    const left = smooth([[ax, ay], ...sideL, [ax - hw * 1.04, by]], false, 0.8);
    const right = smooth([[ax + hw * 1.04, by], ...sideR.reverse(), [ax, ay]], false, 0.8).replace(/^M[^C]*/, '');
    const d = left + hem + right + 'Z';
    tierShapes.push({ d, ax, ay, by, hw });
  }
  for (let i = 0; i < tiers; i++) {
    const { d, ax, ay, by, hw } = tierShapes[i];
    const c = id('pn');
    out.push(`<clipPath id="${c}"><path d="${d}"/></clipPath>`);
    out.push(path(d, pal.dark, `stroke="${pal.ink}" stroke-width="${f(IW * 2)}" stroke-linejoin="round"`), path(d, pal.dark));
    out.push(`<g clip-path="url(#${c})">`);
    // broad green on the lit left, its lower edge stopping short of the hem
    const g = `M${f(ax + hw * 0.12)},${f(ay - 3)}Q${f(ax + hw * 0.2)},${f(ay + (by - ay) * 0.5)} ${f(ax + hw * 0.5)},${f(by - (by - ay) * 0.12)}Q${f(ax)},${f(by - (by - ay) * 0.02)} ${f(ax - hw * 1.3)},${f(by - (by - ay) * 0.2)}L${f(ax - hw * 1.3)},${f(ay - 3)}Z`;
    out.push(path(g, pal.mid));
    if (i >= tiers - 3) out.push(path(`M${f(ax - 1)},${f(ay + 3)}Q${f(ax - hw * 0.2)},${f(ay + (by - ay) * 0.45)} ${f(ax - hw * 0.62)},${f(ay + (by - ay) * 0.62)}Q${f(ax - hw * 0.25)},${f(ay + (by - ay) * 0.58)} ${f(ax - 1)},${f(ay + 3)}Z`, pal.light));
    out.push('</g>');
  }
  const ext = tierShapes.flatMap(({ ax, ay, by, hw }) => [[ax - hw * 1.3 - IW - 2, ay - IW - 2], [ax + hw * 1.3 + IW + 2, by + 8]]);
  return { svg: out.join(''), box: bboxOf([...ext, [x - w / 2, y + 4], [x + w * 0.8, y]]), foot: [x, y] };
}

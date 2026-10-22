// Trees and bushes: a small authored family, each with its own silhouette,
// drawn in flat value groups like the reference (no gradients, no highlight
// on every lobe):
//
//   broad     tall round crown, the big tree of the tile
//   spread    asymmetric, wider than tall, leaning to one side
//   sapling   slim trunk, small crown set off-centre
//   bush      low shrub, two or three leaf masses on the ground
//   pine      fir with irregular tiers
//
// Value groups, back to front: one dark crown mass (the consolidated shadow
// and the outline), main green masses pushed up and to the left of each lobe,
// two or three flat light patches where the sun hits, a few ink accents.
import { INK, IW, IW2, IW3, rng, f, ellipse, path, smooth, id, bboxOf, scallop } from './util.js';

export const LEAF = { ink: INK, dark: '#24742e', mid: '#4ea52f', light: '#8fcb3a', hi: '#c4e25a' };
export const PINE = { ink: INK, dark: '#15603c', mid: '#2b8c4a', light: '#58ad4c' };
const BARK = { base: '#a26a37', dark: '#6b4222' };
const SHADOW = 'rgba(28,52,8,0.28)';

// lobe layouts per form: [x, y, r] in units of the crown radius, around the
// crown centre; front lobes last
const FORMS = {
  broad: [[0, -0.42, 0.52], [-0.45, -0.12, 0.5], [0.42, -0.18, 0.5], [0, -0.02, 0.6], [-0.38, 0.3, 0.46], [0.36, 0.3, 0.48], [0, 0.42, 0.46]],
  spread: [[-0.15, -0.38, 0.46], [0.42, -0.22, 0.44], [-0.62, -0.02, 0.42], [0.06, -0.02, 0.56], [0.75, 0.12, 0.38], [-0.38, 0.28, 0.42], [0.36, 0.3, 0.42]],
  sapling: [[0.05, -0.32, 0.5], [-0.32, 0.02, 0.44], [0.34, 0.0, 0.46], [0, 0.26, 0.48]],
  bush: [[-0.5, -0.05, 0.5], [0.42, -0.08, 0.52], [-0.05, -0.38, 0.55], [0, 0.12, 0.5]],
};

function crown(R, L, pal, cx, cy, r) {
  const out = [];
  const clip = id('cr');
  const shapes = L.map(([x, y, q]) => scallop(x, y, q, R, Math.max(5, Math.round(q * 0.45)), 0.18));
  // 1. one dark mass: outline and the consolidated shadow
  out.push(`<g fill="${pal.dark}" stroke="${pal.ink}" stroke-width="${f(IW * 2)}" stroke-linejoin="round">${shapes.map((d) => `<path d="${d}"/>`).join('')}</g>`);
  out.push(`<g fill="${pal.dark}">${shapes.map((d) => `<path d="${d}"/>`).join('')}</g>`);
  out.push(`<clipPath id="${clip}">${shapes.map((d) => `<path d="${d}"/>`).join('')}</clipPath><g clip-path="url(#${clip})">`);
  // 2. main green masses: each lobe's lit part, up and left, leaving the
  //    underside and the crevices between lobes in the dark mass
  L.forEach(([x, y, q]) => {
    out.push(`<path d="${scallop(x - q * 0.14, y - q * 0.2, q * 0.86, R, Math.max(5, Math.round(q * 0.4)), 0.2)}" fill="${pal.mid}"/>`);
  });
  // 3. two or three flat light patches on the sunlit upper-left lobes only
  const lit = [...L].sort((a, b) => (a[0] - cx + a[1] - cy) - (b[0] - cx + b[1] - cy)).slice(0, 2 + (r > 26 ? 1 : 0));
  for (const [x, y, q] of lit) out.push(`<path d="${scallop(x - q * 0.26, y - q * 0.3, q * 0.58, R, 6, 0.28)}" fill="${pal.light}"/>`);
  if (r > 22) { const [x, y, q] = lit[0]; out.push(`<path d="${scallop(x - q * 0.42, y - q * 0.46, q * 0.2, R, 4, 0.35)}" fill="${pal.hi}"/>`); }
  // 4. consolidated underside: the lower lobes sink back into the dark mass,
  //    following their own scallops rather than a straight band
  const low = [...L].sort((a, b) => b[1] - a[1]).slice(0, Math.max(2, Math.round(L.length / 2.5)));
  for (const [x, y, q] of low) out.push(`<path d="${scallop(x + q * 0.12, y + q * 0.62, q * 0.78, R, Math.max(5, Math.round(q * 0.4)), 0.2)}" fill="${pal.dark}"/>`);
  out.push('</g>');
  // 5. a few ink accents where front lobes overlap: structural, not texture
  L.slice(-2).forEach(([x, y, q]) => {
    const a0 = Math.PI * 1.12, a1 = Math.PI * 1.36;
    out.push(`<path d="M${f(x + Math.cos(a0) * q)},${f(y + Math.sin(a0) * q)}A${f(q)},${f(q)} 0 0 1 ${f(x + Math.cos(a1) * q)},${f(y + Math.sin(a1) * q)}" fill="none" stroke="${pal.ink}" stroke-width="${f(IW3 * 1.3)}" stroke-linecap="round"/>`);
  });
  return out.join('');
}

// trunk: base colour and one flat shaded side, a modest root flare
function trunk(R, x, y, top, w0, w1) {
  const bend = R.range(-0.12, 0.12) * w0;
  const h = y - top;
  const L = [
    [x - w0 * 0.9, y + 0.5], [x - w0 * 0.5, y - h * 0.12], [x - w1 * 0.5 + bend, y - h * 0.6], [x - w1 * 0.5 + bend * 1.4, top],
    [x + w1 * 0.5 + bend * 1.4, top], [x + w1 * 0.5 + bend, y - h * 0.6], [x + w0 * 0.5, y - h * 0.12], [x + w0 * 0.95, y + 0.5],
  ];
  const d = smooth(L, true, 0.6);
  const clip = id('tr');
  return `<clipPath id="${clip}"><path d="${d}"/></clipPath>` +
    path(d, BARK.base, `stroke="${INK}" stroke-width="${f(IW)}" stroke-linejoin="round"`) +
    `<g clip-path="url(#${clip})">` +
    path(`M${f(x + w1 * 0.15 + bend)},${f(top - 2)}L${f(x + w0 * 0.25)},${f(y + 2)}L${f(x + w0 * 1.3)},${f(y + 2)}L${f(x + w1 + bend * 1.4)},${f(top - 2)}Z`, BARK.dark) +
    '</g>';
}

function lobesFor(form, R, cx, cy, r, flip) {
  return FORMS[form].map(([u, v, q]) => [cx + (flip ? -u : u) * r + R.range(-0.04, 0.04) * r, cy + v * r + R.range(-0.04, 0.04) * r, q * r * R.range(0.94, 1.06)]);
}

// leafy tree. foot: where the trunk meets the ground; r: crown radius
export function tree({ x, y, r = 30, h, form = 'broad', flip = false, seed = 1, pal = LEAF }) {
  const R = rng(seed);
  const tall = { broad: 1.32, spread: 1.12, sapling: 1.38 }[form] ?? 1.3;
  h = h ?? r * tall;
  const off = form === 'sapling' ? r * 0.18 * (flip ? -1 : 1) : form === 'spread' ? r * 0.12 * (flip ? -1 : 1) : 0;
  const cx = x + off, cy = y - h;
  const L = lobesFor(form, R, cx, cy, r, flip);
  const thick = form === 'sapling' ? [0.22, 0.15] : [0.3, 0.19];
  const svg = ellipse([x + r * 0.35, y - r * 0.06], r * (form === 'sapling' ? 0.6 : 0.95), r * 0.28, SHADOW) +
    trunk(R, x, y, cy + r * 0.25, r * thick[0], r * thick[1]) +
    crown(R, L, pal, cx, cy, r);
  const ext = L.flatMap(([a, b, q]) => [[a - q - IW * 2, b - q - IW * 2], [a + q + IW * 2, b + q + IW * 2]]);
  return { svg, box: bboxOf([...ext, [x - r, y + r * 0.4], [x + r * 1.4, y]]), foot: [x, y] };
}

// low shrub: two or three leaf masses sitting on the ground
export function bush({ x, y, r = 12, seed = 1, pal = LEAF }) {
  const R = rng(seed);
  const cy = y - r * 0.55;
  const L = lobesFor('bush', R, x, cy, r, R() < 0.5);
  const svg = ellipse([x + r * 0.25, y - 0.5], r * 1.1, r * 0.32, SHADOW) + crown(R, L, pal, x, cy, r);
  const ext = L.flatMap(([a, b, q]) => [[a - q - IW * 2, b - q - IW * 2], [a + q + IW * 2, b + q + IW * 2]]);
  return { svg, box: bboxOf([...ext, [x - r * 0.9, y + r * 0.4], [x + r * 1.4, y]]), foot: [x, y] };
}

// fir: tiers of irregular width and spacing, each a dark mass with one flat
// lit plane on the left
export function pine({ x, y, w = 50, h = 84, tiers = 4, seed = 1, pal = PINE }) {
  const R = rng(seed);
  const th = h * 0.12;
  const top = y - h, base = y - th;
  const out = [ellipse([x + w * 0.22, y - 0.5], w * 0.5, w * 0.16, SHADOW)];
  out.push(trunk(R, x, y, base - 4, w * 0.11, w * 0.085));
  const all = [];
  // tier bottoms: uneven spacing, widths that do not shrink evenly
  const stops = [0];
  for (let i = 1; i < tiers; i++) stops.push(stops[i - 1] + R.range(0.75, 1.25));
  const span = stops[tiers - 1] || 1;
  for (let i = 0; i < tiers; i++) {
    const t0 = (stops[i] / span) * 0.78;
    const by = base - (base - top) * t0;
    const ay = i === tiers - 1 ? top : by - (base - top) * R.range(0.38, 0.48);
    const hw = (w / 2) * (1 - t0 * 0.75) * R.range(0.88, 1.12);
    const ax = x + R.range(-1, 1);
    const n = Math.max(2, Math.round(hw / 6));
    const lean = R.range(-0.08, 0.08) * hw;
    // sides with one or two breaks, bottom with a few broad scallops
    const sideL = `Q${f(ax - hw * 0.45 + lean)},${f(ay + (by - ay) * 0.5)} ${f(ax - hw * 0.62)},${f(ay + (by - ay) * 0.62)}L${f(ax - hw * 0.52)},${f(ay + (by - ay) * 0.66)}Q${f(ax - hw * 0.8)},${f(by - 2)} ${f(ax - hw)},${f(by)}`;
    let bottom = '';
    for (let k = 1; k <= n; k++) {
      const px = ax - hw + (2 * hw * k) / n;
      bottom += `Q${f(px - hw / n)},${f(by + (2 * hw / n) * R.range(0.3, 0.45))} ${f(px)},${f(by + R.range(-1, 0.5))}`;
    }
    const sideR = `Q${f(ax + hw * 0.8)},${f(by - 2)} ${f(ax + hw * 0.52)},${f(ay + (by - ay) * 0.66)}L${f(ax + hw * 0.62)},${f(ay + (by - ay) * 0.62)}Q${f(ax + hw * 0.45 + lean)},${f(ay + (by - ay) * 0.5)} ${f(ax)},${f(ay)}`;
    const d = `M${f(ax)},${f(ay)}${sideL}${bottom}${sideR}Z`;
    all.push([ax - hw - IW - 2, ay - IW], [ax + hw + IW + 2, by + 6]);
    const clip = id('pn');
    out.push(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
    out.push(path(d, pal.dark, `stroke="${pal.ink}" stroke-width="${f(IW * 2)}" stroke-linejoin="round"`));
    out.push(path(d, pal.dark));
    out.push(`<g clip-path="url(#${clip})">`);
    out.push(path(`M${f(ax)},${f(ay - 3)}L${f(ax - hw * 1.3)},${f(by + 8)}L${f(ax + hw * 0.08)},${f(by + 8)}Z`, pal.mid));
    if (i >= tiers - 2) out.push(path(`M${f(ax - 0.5)},${f(ay + 3)}L${f(ax - hw * 0.75)},${f(by - (by - ay) * 0.2)}L${f(ax - hw * 0.3)},${f(by - (by - ay) * 0.25)}Z`, pal.light));
    // the tier above casts its shadow on this one's top
    if (i < tiers - 1) out.push(`<path d="M${f(ax - hw)},${f(ay)}Q${f(ax)},${f(ay + (by - ay) * 0.5)} ${f(ax + hw)},${f(ay)}Z" fill="${pal.dark}"/>`);
    out.push('</g>');
  }
  void IW3;
  return { svg: out.join(''), box: bboxOf([...all, [x - w / 2, y + 4], [x + w * 0.75, y]]), foot: [x, y] };
}

// Trees and bushes, whole: every crown is built from lobes (circles) painted
// back to front, each with its own shadow side, lit side and highlight, inside
// one ink outline. Nothing is cut from the reference, so no tree is missing
// the part another tree hid.
import { INK, IW, IW2, rng, f, circle, ellipse, path, smooth, mix, id, bboxOf, rgrad, lgrad, scallop } from './util.js';

export const LEAF = {
  ink: '#133312', deep: '#0e4a22', dark: '#1a612a', mid: '#348f2c', light: '#6db52b', hi: '#b2da45',
};
export const PINE = { ink: '#0f3320', deep: '#0a4429', dark: '#0f5a34', mid: '#25843a', light: '#4fa83f', hi: '#93d05a' };
const BARK = { base: '#a8703c', dark: '#6e4423', light: '#c89058' };
const SHADOW = 'rgba(22,48,6,0.26)';

// crown lobes around (cx, cy), radius r: a big middle, a ring, smaller and
// flatter at the bottom; scaled so the crown spans about 2r x 1.8r
function lobes(R, cx, cy, r, n) {
  const L = [[cx + r * R.range(-0.04, 0.04), cy - r * 0.08, r * 0.6]];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + ((i + R.range(-0.25, 0.25)) / n) * Math.PI * 2;
    const s = Math.sin(a);
    const d = r * R.range(0.42, 0.52);
    const rr = r * R.range(0.46, 0.56) * (s > 0.3 ? 0.82 : 1);
    L.push([cx + Math.cos(a) * d * 1.05, cy + s * d * (s > 0 ? 0.62 : 0.85), rr]);
  }
  // a front row of small lobes gives the crown its lower scallops
  L.push([cx + r * R.range(-0.12, 0.12), cy + r * 0.38, r * R.range(0.4, 0.46)]);
  return L.sort((a, b) => a[1] - b[1]);
}

function crown(R, L, pal, cx, cy, r) {
  const out = [];
  const clip = id('cr');
  // each lobe gets a leafy scalloped edge; the union of them is the crown
  const shapes = L.map(([x, y, q]) => scallop(x, y, q, R, Math.max(6, Math.round(q * 0.8)), 0.2));
  out.push(`<g fill="${pal.ink}" stroke="${pal.ink}" stroke-width="${f(IW * 2)}" stroke-linejoin="round">${shapes.map((d) => `<path d="${d}"/>`).join('')}</g>`);
  out.push(`<clipPath id="${clip}">${shapes.map((d) => `<path d="${d}"/>`).join('')}</clipPath>`);
  out.push(`<g clip-path="url(#${clip})">`);
  out.push(circle([cx, cy], r * 2, pal.dark));
  L.forEach(([x, y, q], i) => {
    const d = shapes[i];
    // the lobe in front darkens the leaves behind it (ambient occlusion)
    if (i > 0) out.push(`<path d="${d}" fill="${mix(pal.dark, '#06200c', 0.45)}" opacity="0.55" transform="translate(${f(q * 0.12)} ${f(q * 0.16)})"/>`);
    const [gd, gf] = rgrad([[0, pal.hi], [0.22, pal.light], [0.5, pal.mid], [0.8, pal.dark], [1, pal.deep]], 0.3, 0.22, 0.95);
    out.push(gd + `<path d="${d}" fill="${gf}"/>`);
    const c = id('lb');
    out.push(`<clipPath id="${c}"><path d="${d}"/></clipPath><g clip-path="url(#${c})">`);
    // leaf clumps: small scalloped arcs in the shade, leaf dabs in the light
    for (let k = 0; k < 2 + Math.round(q / 9); k++) {
      const a = R.range(0.1, Math.PI * 0.85), dd = q * R.range(0.35, 0.75);
      const px = x + Math.cos(a) * dd, py = y + Math.sin(a) * dd * 0.9, s = q * R.range(0.2, 0.3);
      out.push(`<path d="M${f(px - s)},${f(py - s * 0.2)}q${f(s * 0.5)},${f(s * 0.9)} ${f(s)},${f(s * 0.1)}q${f(s * 0.5)},${f(s * 0.8)} ${f(s)},${f(-s * 0.1)}" fill="none" stroke="${pal.ink}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>`);
    }
    // the lit top of the clump: a lighter leafy patch up and to the left
    out.push(`<path d="${scallop(x - q * 0.22, y - q * 0.3, q * 0.5, R, 6, 0.25)}" fill="${pal.light}" opacity="0.85"/>`);
    out.push(`<path d="${scallop(x - q * 0.32, y - q * 0.42, q * 0.26, R, 5, 0.3)}" fill="${pal.hi}" opacity="0.9"/>`);
    for (let k = 0; k < 2 + Math.round(q / 9); k++) {
      const a = R.range(Math.PI * 1.0, Math.PI * 1.75), dd = q * R.range(0.15, 0.75);
      const px = x + Math.cos(a) * dd, py = y + Math.sin(a) * dd;
      const col = R() < 0.35 ? '#e4f07a' : pal.hi;
      out.push(ellipse([px, py], q * R.range(0.07, 0.12), q * 0.045, col, `transform="rotate(${f(R.range(-50, 20))} ${f(px)} ${f(py)})" opacity="0.9"`));
    }
    out.push('</g>');
  });
  // the underside of the crown sits in its own shadow
  const [ud, uf] = lgrad([[0, pal.deep, 0], [0.55, pal.deep, 0.15], [1, '#062b12', 0.75]], 0, 0, 0, 1);
  out.push(ud + `<rect x="${f(cx - r * 1.3)}" y="${f(cy + r * 0.1)}" width="${f(r * 2.6)}" height="${f(r)}" fill="${uf}"/>`);
  out.push('</g>');
  return out.join('');
}

function trunk(R, x, y, top, w0, w1) {
  const bend = R.range(-0.12, 0.12) * w0;
  const h = y - top;
  const L = [
    [x - w0 * 0.95, y + 0.6], [x - w0 * 0.55, y - h * 0.12], [x - w1 * 0.5 + bend, y - h * 0.6], [x - w1 * 0.5 + bend * 1.4, top],
    [x + w1 * 0.5 + bend * 1.4, top], [x + w1 * 0.5 + bend, y - h * 0.6], [x + w0 * 0.55, y - h * 0.12], [x + w0 * 1.05, y + 0.6],
  ];
  const d = smooth(L, true, 0.6);
  const clip = id('tr');
  return `<clipPath id="${clip}"><path d="${d}"/></clipPath>` +
    path(d, BARK.base, `stroke="${INK}" stroke-width="${f(IW)}" stroke-linejoin="round"`) +
    `<g clip-path="url(#${clip})">` +
    path(`M${f(x + w1 * 0.1 + bend)},${f(top)}L${f(x + w0 * 0.3)},${f(y + 2)}L${f(x + w0 * 1.3)},${f(y + 2)}L${f(x + w1 + bend * 1.4)},${f(top)}Z`, BARK.dark) +
    `<path d="M${f(x - w0 * 0.15)},${f(y - h * 0.15)}Q${f(x - w1 * 0.1 + bend)},${f(y - h * 0.45)} ${f(x - w1 * 0.05 + bend * 1.2)},${f(y - h * 0.8)}" fill="none" stroke="${BARK.light}" stroke-width="${f(w1 * 0.22)}" stroke-linecap="round"/>` +
    '</g>' +
    `<path d="M${f(x - w0 * 0.2)},${f(y - 1)}l${f(-w0 * 0.25)},${f(-h * 0.12)}M${f(x + w0 * 0.45)},${f(y - 1)}l${f(w0 * 0.1)},${f(-h * 0.1)}" stroke="${INK}" stroke-width="${f(IW2)}" fill="none" stroke-linecap="round"/>`;
}

// round leafy tree. foot: where the trunk meets the ground; r: crown radius
export function tree({ x, y, r = 30, h, seed = 1, pal = LEAF }) {
  const R = rng(seed);
  h = h ?? r * 1.36;
  const cx = x + R.range(-0.06, 0.06) * r, cy = y - h;
  const L = lobes(R, cx, cy, r, 4 + Math.floor(R() * 2));
  const svg = ellipse([x + r * 0.3, y - r * 0.08], r * 0.85, r * 0.3, SHADOW) +
    trunk(R, x, y, cy + r * 0.2, r * 0.32, r * 0.2) +
    `<path d="M${f(x)},${f(cy + r * 0.45)}q${f(-r * 0.1)},${f(-r * 0.2)} ${f(-r * 0.3)},${f(-r * 0.35)}M${f(x + r * 0.03)},${f(cy + r * 0.5)}q${f(r * 0.12)},${f(-r * 0.2)} ${f(r * 0.32)},${f(-r * 0.3)}" stroke="${INK}" stroke-width="${f(r * 0.12 + 1.6)}" stroke-linecap="round" fill="none"/>` +
    `<path d="M${f(x)},${f(cy + r * 0.45)}q${f(-r * 0.1)},${f(-r * 0.2)} ${f(-r * 0.3)},${f(-r * 0.35)}M${f(x + r * 0.03)},${f(cy + r * 0.5)}q${f(r * 0.12)},${f(-r * 0.2)} ${f(r * 0.32)},${f(-r * 0.3)}" stroke="#9a6534" stroke-width="${f(r * 0.12)}" stroke-linecap="round" fill="none"/>` +
    crown(R, L, pal, cx, cy, r);
  const ext = L.flatMap(([a, b, q]) => [[a - q - IW, b - q - IW], [a + q + IW, b + q + IW]]);
  return { svg, box: bboxOf([...ext, [x - r, y + r * 0.4], [x + r * 1.2, y]]), foot: [x, y] };
}

// low bush: a dome of lobes sitting on the ground
export function bush({ x, y, r = 12, seed = 1, pal = LEAF }) {
  const R = rng(seed);
  const n = 4 + Math.floor(R() * 2);
  const L = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const lx = x + (t - 0.5) * r * 1.5, arch = Math.sin(t * Math.PI);
    L.push([lx + R.range(-1, 1), y - r * 0.42 - arch * r * 0.42, r * (0.42 + arch * 0.2) * R.range(0.9, 1.1)]);
  }
  L.push([x + R.range(-2, 2), y - r * 0.95, r * 0.55]);
  L.sort((a, b) => a[1] - b[1]);
  const svg = ellipse([x + r * 0.2, y - 0.5], r * 1.1, r * 0.34, SHADOW) + crown(R, L, pal, x, y - r * 0.7, r);
  const ext = L.flatMap(([a, b, q]) => [[a - q - IW, b - q - IW], [a + q + IW, b + q + IW]]);
  return { svg, box: bboxOf([...ext, [x - r * 0.9, y + r * 0.4], [x + r * 1.3, y]]), foot: [x, y] };
}

// conifer: stacked tiers with lumpy, needled edges; each tier lit on its left
export function pine({ x, y, w = 50, h = 84, tiers = 4, seed = 1, pal = PINE }) {
  const R = rng(seed);
  const th = h * 0.13;                       // trunk showing below the lowest tier
  const top = y - h, base = y - th;
  const out = [ellipse([x + w * 0.2, y - 0.5], w * 0.5, w * 0.17, SHADOW)];
  out.push(trunk(R, x, y, base - 4, w * 0.11, w * 0.085));
  const all = [];
  const side = (from, to, bumps, dir) => {
    // lumpy edge from `from` to `to`, bulging outwards (dir -1 left, +1 right)
    let d = '';
    for (let k = 1; k <= bumps; k++) {
      const a = [from[0] + (to[0] - from[0]) * ((k - 1) / bumps), from[1] + (to[1] - from[1]) * ((k - 1) / bumps)];
      const b = [from[0] + (to[0] - from[0]) * (k / bumps), from[1] + (to[1] - from[1]) * (k / bumps)];
      const m = [(a[0] + b[0]) / 2 + dir * R.range(1.2, 2.4), (a[1] + b[1]) / 2 + R.range(0.5, 1.5)];
      d += `Q${f(m[0])},${f(m[1])} ${f(b[0])},${f(b[1])}`;
    }
    return d;
  };
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const by = base - (base - top) * t0 * 0.84;
    const ay = i === tiers - 1 ? top : by - (base - top) * 0.44;
    const hw = (w / 2) * (1 - t0 * 0.6) * R.range(0.95, 1.05);
    const ax = x + R.range(-0.8, 0.8);
    const n = Math.max(3, Math.round(hw / 4.5));
    const L = [ax - hw, by - 1], Rt = [ax + hw, by - 1];
    let d = `M${f(ax)},${f(ay)}` + side([ax, ay], L, Math.max(2, Math.round((by - ay) / 9)), -1);
    for (let k = 1; k <= n; k++) {
      const px = ax - hw + (2 * hw * k) / n;
      d += `Q${f(px - hw / n)},${f(by + (2 * hw / n) * R.range(0.38, 0.55))} ${f(px)},${f(by - 1 + R.range(-0.6, 0.6))}`;
    }
    d += side(Rt, [ax, ay], Math.max(2, Math.round((by - ay) / 9)), 1) + 'Z';
    all.push([ax - hw - IW - 3, ay - IW], [ax + hw + IW + 3, by + 6]);
    const clip = id('pn');
    out.push(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
    out.push(path(d, pal.ink, `stroke="${pal.ink}" stroke-width="${f(IW * 2)}" stroke-linejoin="round"`));
    const [gd, gf] = lgrad([[0, pal.light], [0.42, pal.mid], [0.62, pal.dark], [1, pal.deep]], 0, 0, 1, 0.25);
    out.push(gd + path(d, gf));
    out.push(`<g clip-path="url(#${clip})">`);
    // the tier above shades this one's top
    if (i < tiers - 1) out.push(ellipse([ax + hw * 0.1, ay + 2], hw * 0.75, (by - ay) * 0.28, pal.deep, 'opacity="0.55"'));
    // needle tufts: light strokes on the lit side, dark ones in the shade
    for (let k = 0; k < 4 + Math.round(hw / 5); k++) {
      const u = R.range(-0.85, 0.85), v = R.range(0.35, 0.95);
      const px = ax + u * hw * v, py = ay + (by - ay) * v;
      const lit = u < -0.1;
      out.push(`<path d="M${f(px)},${f(py)}q${f(lit ? -1.5 : 1.5)},${f(1.2)} ${f(lit ? -3.2 : 3.2)},${f(1.6)}" stroke="${lit ? pal.hi : pal.ink}" stroke-width="${lit ? 1.1 : 0.85}" fill="none" stroke-linecap="round" opacity="${lit ? 0.85 : 0.5}"/>`);
    }
    out.push('</g>');
  }
  return { svg: out.join(''), box: bboxOf([...all, [x - w / 2, y + 4], [x + w * 0.75, y]]), foot: [x, y] };
}

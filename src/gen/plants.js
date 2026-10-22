// Trees and bushes, whole: every crown is built from lobes (circles) painted
// back to front, each with its own shadow side, lit side and highlight, inside
// one ink outline. Nothing is cut from the reference, so no tree is missing
// the part another tree hid.
import { INK, IW, IW2, rng, f, circle, ellipse, path, smooth, mix, id, bboxOf } from './util.js';

export const LEAF = {
  ink: '#173a14', dark: '#1d6a2a', mid: '#3f9a2e', light: '#77bd31', hi: '#b5dc4c',
};
export const PINE = { ink: '#123b22', dark: '#0f5a34', mid: '#2a8a3c', light: '#52ad42', hi: '#8fd05a' };
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
    const rr = r * R.range(0.4, 0.5) * (s > 0.3 ? 0.85 : 1);
    L.push([cx + Math.cos(a) * d * 1.05, cy + s * d * (s > 0 ? 0.62 : 0.85), rr]);
  }
  // a front row of small lobes gives the crown its lower scallops
  for (let i = 0; i < 2; i++) L.push([cx + r * (i ? 0.22 : -0.26) + R.range(-3, 3), cy + r * 0.36, r * R.range(0.3, 0.36)]);
  return L.sort((a, b) => a[1] - b[1]);
}

function crown(R, L, pal, cx, cy, r) {
  const out = [];
  const clip = id('cr');
  // ink: every lobe grown by the ink width, so the outline is their union
  out.push(`<g fill="${pal.ink}">${L.map(([x, y, q]) => circle([x, y], q + IW)).join('')}</g>`);
  out.push(`<clipPath id="${clip}">${L.map(([x, y, q]) => circle([x, y], q)).join('')}</clipPath>`);
  out.push(`<g clip-path="url(#${clip})">`);
  L.forEach(([x, y, q], i) => {
    const c = id('lb');
    const top = y < cy + r * 0.15;
    out.push(`<clipPath id="${c}">${circle([x, y], q)}</clipPath><g clip-path="url(#${c})">`);
    out.push(circle([x, y], q, pal.dark));
    out.push(circle([x - q * 0.16, y - q * 0.2], q * 0.9, pal.mid));
    out.push(circle([x - q * 0.34, y - q * 0.42], q * 0.58, pal.light));
    // leaf flecks on the lit side
    for (let k = 0; k < 3; k++) {
      const a = R.range(Math.PI * 1.05, Math.PI * 1.6), d = q * R.range(0.25, 0.7);
      out.push(ellipse([x + Math.cos(a) * d, y + Math.sin(a) * d], q * 0.12, q * 0.07, pal.hi, `transform="rotate(${f(R.range(-40, 10))} ${f(x + Math.cos(a) * d)} ${f(y + Math.sin(a) * d)})"`));
    }
    // dark leaf tufts low on the shadow side
    for (let k = 0; k < 2; k++) {
      const a = R.range(0.1, 1.2), d = q * R.range(0.55, 0.85);
      out.push(ellipse([x + Math.cos(a) * d, y + Math.sin(a) * d], q * 0.16, q * 0.08, mix(pal.dark, '#000', 0.25), `transform="rotate(${f(a * 57 - 70)} ${f(x + Math.cos(a) * d)} ${f(y + Math.sin(a) * d)})"`));
    }
    out.push('</g>');
    // seam: the lobe's upper rim where it sits in front of the lobes behind
    if (i > 0 && !top) {
      const a0 = Math.PI * R.range(1.05, 1.2), a1 = Math.PI * R.range(1.75, 1.92);
      const p0 = [x + Math.cos(a0) * q, y + Math.sin(a0) * q], p1 = [x + Math.cos(a1) * q, y + Math.sin(a1) * q];
      out.push(`<path d="M${f(p0[0])},${f(p0[1])}A${f(q)},${f(q)} 0 0 1 ${f(p1[0])},${f(p1[1])}" fill="none" stroke="${pal.ink}" stroke-width="${f(IW2)}" stroke-linecap="round"/>`);
    }
  });
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
  h = h ?? r * 1.3;
  const cx = x + R.range(-0.06, 0.06) * r, cy = y - h;
  const L = lobes(R, cx, cy, r, 5 + Math.floor(R() * 2));
  const svg = ellipse([x + r * 0.3, y - r * 0.08], r * 0.85, r * 0.3, SHADOW) +
    trunk(R, x, y, cy + r * 0.2, r * 0.25, r * 0.17) +
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

// conifer: stacked scalloped tiers, each with a lit left side
export function pine({ x, y, w = 50, h = 84, tiers = 4, seed = 1, pal = PINE }) {
  const R = rng(seed);
  const th = h * 0.13;                       // trunk showing below the lowest tier
  const top = y - h, base = y - th;
  const out = [ellipse([x + w * 0.18, y - 0.5], w * 0.5, w * 0.17, SHADOW)];
  out.push(trunk(R, x, y, base - 4, w * 0.11, w * 0.085));
  const all = [];
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const by = base - (base - top) * t0 * 0.86;             // tier bottom
    const ty = top + (i < tiers - 1 ? (base - top) * 0.02 * i : 0);   // apex
    const apexY = i === tiers - 1 ? top : by - (base - top) * 0.42;
    const hw = (w / 2) * (1 - t0 * 0.62) * R.range(0.95, 1.05);
    const lean = R.range(-1, 1);
    const ax = x + lean, ay = Math.max(top, apexY);
    void ty;
    // outline: apex, left side with a jag, scalloped bottom, right side
    const pts = [[ax, ay]];
    const jag = (s) => [ax + s * hw * 0.55, ay + (by - ay) * 0.52, ax + s * hw * 0.42, ay + (by - ay) * 0.56];
    const jl = jag(-1), jr = jag(1);
    pts.push([jl[0], jl[1]], [jl[2], jl[3]]);
    const n = 3 + (hw > 16 ? 1 : 0);
    const bl = [ax - hw, by - 1.5];
    pts.push(bl);
    for (let k = 1; k < n; k++) pts.push([ax - hw + (2 * hw * k) / n, by + R.range(-1.8, -0.4)]);
    pts.push([ax + hw, by - 1.5]);
    pts.push([jr[2], jr[3]], [jr[0], jr[1]]);
    // build a path with scallop arcs along the bottom edge
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    d += `L${f(pts[1][0])},${f(pts[1][1])}L${f(pts[2][0])},${f(pts[2][1])}L${f(bl[0])},${f(bl[1])}`;
    for (let k = 1; k <= n; k++) {
      const px = ax - hw + (2 * hw * k) / n, py = k === n ? by - 1.5 : pts[3 + k][1];
      const sag = (2 * hw) / n * 0.32;
      d += `Q${f(px - hw / n)},${f(by + sag)} ${f(px)},${f(py)}`;
    }
    d += `L${f(jr[2])},${f(jr[3])}L${f(jr[0])},${f(jr[1])}Z`;
    all.push([ax - hw - IW, ay - IW], [ax + hw + IW, by + 4]);
    const clip = id('pn');
    out.push(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
    out.push(path(d, pal.dark, `stroke="${pal.ink}" stroke-width="${f(IW * 2)}" stroke-linejoin="round"`));
    out.push(path(d, pal.dark));
    out.push(`<g clip-path="url(#${clip})">`);
    out.push(path(`M${f(ax)},${f(ay - 2)}L${f(ax - hw * 1.3)},${f(by + 6)}L${f(ax + hw * 0.15)},${f(by + 6)}Z`, pal.mid));
    out.push(path(`M${f(ax - 1)},${f(ay + 2)}L${f(ax - hw * 0.9)},${f(by + 2)}L${f(ax - hw * 0.35)},${f(by + 2)}Z`, pal.light));
    for (let k = 0; k < 3; k++) {
      const px = ax - hw * R.range(0.1, 0.6), py = ay + (by - ay) * R.range(0.35, 0.85);
      out.push(ellipse([px, py], hw * 0.1, 1.1, pal.hi, `transform="rotate(${f(R.range(30, 50))} ${f(px)} ${f(py)})"`));
    }
    // needle strokes on the shadow side
    for (let k = 0; k < 3; k++) {
      const px = ax + hw * R.range(0.2, 0.7), py = ay + (by - ay) * R.range(0.5, 0.95);
      out.push(`<path d="M${f(px)},${f(py)}l${f(hw * 0.12)},${f(-3)}" stroke="${pal.ink}" stroke-width="${f(IW2)}" stroke-linecap="round" fill="none" opacity="0.7"/>`);
    }
    out.push('</g>');
  }
  return { svg: out.join(''), box: bboxOf([...all, [x - w / 2, y + 4], [x + w * 0.7, y]]), foot: [x, y] };
}

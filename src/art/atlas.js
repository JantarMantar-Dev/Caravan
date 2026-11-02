// Bakes every procedural sprite into one texture atlas.
// Pass 1 runs each sprite's draw code against a bounds-recording context (no pixels,
// no GPU readback), pass 2 shelf-packs the boxes and draws each sprite straight into
// its atlas cell. Anchors are exact, so world placement matches the authored design.
import { rng } from './ink.js';

export const ATLAS_SCALE = 2; // atlas px per design px (crisp at 2x DPR, hex ~490 css px wide)
export const ASSET_SCALE = 1.45; // authored-geometry -> on-tile size, matched to the reference sheets
// Ink stays near-uniform when a sprite is scaled: line widths grow only with scale^0.45.
const inkComp = (s) => Math.pow(s, -0.55);

// Scale every lineWidth assignment on a context by f (keeps contour weight uniform).
function inkScaled(ctx, f) {
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'lineWidth');
  if (!d) { ctx.__ink = f; return ctx; }
  Object.defineProperty(ctx, 'lineWidth', { configurable: true, get() { return d.get.call(ctx) / f; }, set(v) { d.set.call(ctx, v * f); } });
  return ctx;
}
const PAD = 3;

export function bakeAtlas(defs, { width = 4096 } = {}) {
  const items = [];
  for (const def of defs) {
    const sc = def.scale ?? ASSET_SCALE;
    const k = ATLAS_SCALE * sc, ink = def.ink ?? inkComp(sc);
    const rec = new BoundsRecorder(ink);
    rec.setTransform(k, 0, 0, k, 0, 0);
    def.draw(rec, rng(def.seed ?? hash(def.name)));
    const b = rec.bounds();
    if (!b) continue;
    const x0 = Math.floor(b.x0) - PAD, y0 = Math.floor(b.y0) - PAD;
    const w = Math.ceil(b.x1) + PAD - x0, h = Math.ceil(b.y1) + PAD - y0;
    items.push({ def, k, ink, w, h, ax: -x0, ay: -y0 });
  }
  const order = [...items].sort((a, b) => b.h - a.h);
  let x = 0, y = 0, rowH = 0;
  for (const it of order) {
    if (x + it.w > width) { x = 0; y += rowH; rowH = 0; }
    it.x = x; it.y = y; x += it.w; rowH = Math.max(rowH, it.h);
  }
  const height = y + rowH;
  const atlas = document.createElement('canvas');
  atlas.width = width; atlas.height = height;
  const ctx = atlas.getContext('2d');
  const frames = {};
  for (const it of items) {
    ctx.save();
    ctx.beginPath(); ctx.rect(it.x, it.y, it.w, it.h); ctx.clip();
    ctx.setTransform(it.k, 0, 0, it.k, it.x + it.ax, it.y + it.ay);
    inkScaled(ctx, it.ink);
    it.def.draw(ctx, rng(it.def.seed ?? hash(it.def.name)));
    delete ctx.lineWidth;
    ctx.restore();
    frames[it.def.name] = {
      u0: it.x / width, v0: it.y / height, u1: (it.x + it.w) / width, v1: (it.y + it.h) / height,
      // size & anchor in design px (world conversion happens in the sprite layer)
      w: it.w / ATLAS_SCALE, h: it.h / ATLAS_SCALE, ax: it.ax / ATLAS_SCALE, ay: it.ay / ATLAS_SCALE,
    };
  }
  return { canvas: atlas, frames, width, height };
}

// Minimal CanvasRenderingContext2D stand-in that tracks the transformed extent of
// every path point (control points included, so the box is conservative).
class BoundsRecorder {
  constructor(ink = 1) {
    this.ink = ink; this.m = new DOMMatrix(); this.stack = [];
    this.path = []; this.x0 = Infinity; this.y0 = Infinity; this.x1 = -Infinity; this.y1 = -Infinity;
    this.lineWidth = 1; this.fillStyle = ''; this.strokeStyle = ''; this.lineJoin = ''; this.lineCap = '';
  }
  save() { this.stack.push(DOMMatrix.fromMatrix(this.m)); }
  restore() { if (this.stack.length) this.m = this.stack.pop(); }
  setTransform(a, b, c, d, e, f) { this.m = new DOMMatrix([a, b, c, d, e, f]); }
  translate(x, y) { this.m.translateSelf(x, y); }
  scale(x, y) { this.m.scaleSelf(x, y); }
  rotate(a) { this.m.rotateSelf((a * 180) / Math.PI); }
  beginPath() { this.path = []; }
  closePath() {}
  _p(x, y) { const p = this.m.transformPoint({ x, y }); this.path.push(p.x, p.y); }
  moveTo(x, y) { this._p(x, y); }
  lineTo(x, y) { this._p(x, y); }
  quadraticCurveTo(cx, cy, x, y) { this._p(cx, cy); this._p(x, y); }
  bezierCurveTo(a, b, c, d, x, y) { this._p(a, b); this._p(c, d); this._p(x, y); }
  ellipse(x, y, rx, ry, rot = 0) {
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2, ex = Math.cos(t) * rx * 1.02, ey = Math.sin(t) * ry * 1.02;
      this._p(x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot));
    }
  }
  arc(x, y, r) { this.ellipse(x, y, r, r, 0); }
  rect(x, y, w, h) { this._p(x, y); this._p(x + w, y + h); this._p(x + w, y); this._p(x, y + h); }
  roundRect(x, y, w, h) { this.rect(x, y, w, h); }
  _commit(margin) {
    const p = this.path;
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] - margin < this.x0) this.x0 = p[i] - margin; if (p[i] + margin > this.x1) this.x1 = p[i] + margin;
      if (p[i + 1] - margin < this.y0) this.y0 = p[i + 1] - margin; if (p[i + 1] + margin > this.y1) this.y1 = p[i + 1] + margin;
    }
  }
  _scale() { return Math.hypot(this.m.a, this.m.b); }
  fill() { this._commit(1); }
  stroke() { this._commit((this.lineWidth * this.ink * this._scale()) / 2 + 1); }
  clip() {}
  clearRect() {}
  fillRect(x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this.fill(); }
  bounds() { return this.x1 < this.x0 ? null : { x0: this.x0, y0: this.y0, x1: this.x1, y1: this.y1 }; }
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

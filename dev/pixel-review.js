// Pixel review sheet: every sprite of a tile, enlarged with hard pixels.
// Bundle: npx esbuild dev/pixel-review.js --bundle --outfile=dev/out/pixel-review.js
// Open dev/pixel-review.html?ids=a,b&k=6
import { scenes } from '../assets/scenes/index.js';
import { renderPixelScene } from '../src/pixel/index.js';
const q = new URLSearchParams(location.search);
const X = renderPixelScene(scenes[q.get('tile') || 'fish_1']);
const k = +(q.get('k') || 6);
const ids = q.get('ids')?.split(',');
const all = [...X.planes.map((p) => ({ ...p, kind: 'plane' })), ...X.objects];
for (const o of all.filter((o) => !ids || ids.includes(o.id))) {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas');
  c.width = o.canvas.width * k; c.height = o.canvas.height * k;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(o.canvas, 0, 0, c.width, c.height);
  fig.innerHTML = `<figcaption>${o.id} · ${o.canvas.width}×${o.canvas.height}</figcaption>`;
  fig.appendChild(c);
  document.body.appendChild(fig);
}
window.__ready = true;

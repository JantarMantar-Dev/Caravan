// Side-by-side review sheet: reference crop | generated asset, same scale.
// node dev/review-gen.mjs fish_1 dev/out/review.html [ids,comma]  then screenshot it
import { readFileSync, writeFileSync } from 'node:fs';
import { renderScene, wrap } from '../src/gen/index.js';
const [,, tile, out, only] = process.argv;
const S = renderScene(JSON.parse(readFileSync(`assets/scenes/${tile}.json`, 'utf8')));
const k = 3;
const pick = only ? only.split(',') : null;
const cells = S.objects.filter((o) => !pick || pick.includes(o.id)).map((o) => {
  const [x, y, w, h] = o.box;
  const ref = `<div class="ref" style="width:${w * k}px;height:${h * k}px;background-size:${S.w * k}px ${S.h * k}px;background-position:${-x * k}px ${-y * k}px"></div>`;
  return `<figure><figcaption>${o.id}</figcaption><div class="pair">${ref}<div class="gen">${wrap(o.svg, o.box, k)}</div></div></figure>`;
});
writeFileSync(out, `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:10px;font:13px sans-serif;background:#e9e4da;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}
figure{margin:0;background:#fff;padding:6px;border:1px solid #ccc}.pair{display:flex;gap:6px;align-items:flex-end}
.ref{background-image:url(../../assets/hex/${tile}.avif);background-repeat:no-repeat;image-rendering:auto}
.gen svg{display:block;background:#f3dba0}figcaption{font-weight:bold;margin-bottom:4px}</style>${cells.join('')}`);

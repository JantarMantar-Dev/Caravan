// Whole scene as one SVG (water flat), for quick review: node dev/scene-svg.mjs fish_1 out.svg
import { readFileSync, writeFileSync } from 'node:fs';
import { renderScene } from '../src/gen/index.js';
const [,, tile, out] = process.argv;
const s = renderScene(JSON.parse(readFileSync(`assets/scenes/${tile}.json`, 'utf8')));
const hex = `<path d="M${s.hex.map((p) => p.join(',')).join('L')}Z" fill="#16a6e3"/>`;
const body = hex + s.planes.map((p) => p.svg).join('') + s.objects.map((o) => o.svg).join('') + s.frame;
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.w} ${s.h}">${body}</svg>`);

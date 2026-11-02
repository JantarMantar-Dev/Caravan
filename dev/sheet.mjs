// Asset generator test sheet: node dev/sheet.mjs out.svg
import { writeFileSync } from 'node:fs';
import { tree, pine, bush } from '../src/gen/plants.js';
import { rock } from '../src/gen/rocks.js';
const items = [
  tree({ x: 50, y: 110, r: 38, seed: 1 }), tree({ x: 140, y: 110, r: 26, seed: 2 }), tree({ x: 210, y: 110, r: 20, seed: 3 }),
  pine({ x: 280, y: 110, w: 54, h: 86, seed: 4 }), bush({ x: 340, y: 110, r: 13, seed: 5 }),
  rock({ x: 40, y: 200, w: 44, h: 32, seed: 6 }), rock({ x: 110, y: 200, w: 50, h: 36, seed: 7, wet: true }),
  rock({ x: 230, y: 210, w: 150, h: 90, n: 4, peak: 0.8, seed: 8 }), rock({ x: 340, y: 200, w: 40, h: 22, n: 2, seed: 9 }),
];
writeFileSync(process.argv[2], `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">${items.map((i) => i.svg).join('')}</svg>`);

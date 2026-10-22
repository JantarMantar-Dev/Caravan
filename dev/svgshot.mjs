// Rasterise an SVG file with Chromium: node dev/svgshot.mjs in.svg out.png [scale]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [,, inp, out, scale = 3] = process.argv;
const svg = readFileSync(inp, 'utf8');
const [, , , w, h] = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/).slice(0).map(Number);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Math.ceil(w), height: Math.ceil(h) }, deviceScaleFactor: +scale });
await p.setContent(`<html><body style="margin:0;background:#fff">${svg.replace('<svg ', '<svg style="display:block" width="' + w + '" height="' + h + '" ')}</body></html>`);
await p.screenshot({ path: out });
await b.close();

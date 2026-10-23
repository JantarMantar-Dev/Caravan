// Full-page screenshot: node dev/page.mjs url out.png [width]
import { chromium } from 'playwright';
const [,, url, out, w = 1800] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: 800 }, deviceScaleFactor: 1 });
await p.goto(url); await p.waitForTimeout(800);
await p.screenshot({ path: out, fullPage: true });
await b.close();

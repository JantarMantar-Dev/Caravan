// Frames of the live water at fixed times, one browser: node dev/frames.mjs "url-with-?" outPrefix t1,t2,...  (W H via env)
import { chromium } from 'playwright';
const [,, url, out, ts] = process.argv;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +(process.env.W || 900), height: +(process.env.H || 700) }, deviceScaleFactor: +(process.env.DSF || 2) });
p.on('pageerror', (e) => console.log('pageerror:', e.message));
await p.goto(url + '&still');
await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await p.waitForTimeout(800);
for (const t of ts.split(',')) {
  await p.evaluate((t) => { window.__lab.state.time = +t; }, t);
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}_${t}.png`, clip: { x: 0, y: 60, width: +(process.env.W || 900) - 320, height: +(process.env.H || 700) - 60 } });
}
await b.close();

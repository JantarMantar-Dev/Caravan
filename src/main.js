import * as THREE from 'three';
import { bakeAtlas } from './art/atlas.js';
import { SPRITE_DEFS } from './art/sprites.js';
import { HexMap, DIR_NAMES, HEX_R } from './engine/hex.js';
import { TerrainChunk } from './engine/terrain.js';
import { SpriteLayer, atlasTexture } from './engine/spriteLayer.js';
import { FAMILIES, TILES, composeTile } from './tiles.js';
import { buildMapView } from './mapview.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // art is authored in sRGB; pass through untouched
renderer.setClearColor(0xffffff, 1);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);

// ---------- bake art ----------
const tBake = performance.now();
const atlas = bakeAtlas(SPRITE_DEFS);
const bakeMs = performance.now() - tBake;
const tex = atlasTexture(atlas, renderer);
const sprites = new SpriteLayer(atlas, tex, 4096);

// ---------- layout: 4 reference-style sheets in a 2x2 grid ----------
const SHEET_W = 1640, SHEET_H = 1260, TILE_DX = 515;
const terrain = [];
const sheets = [];
FAMILIES.forEach((fam, i) => {
  const sx = (i % 2) * SHEET_W, sy = -Math.floor(i / 2) * SHEET_H;
  sheets.push({ fam, x: sx, y: sy });
  TILES[fam.key].forEach((tile, stage) => {
    const cx = sx + (stage - 1) * TILE_DX, cy = sy + 190;
    // a 3x3 axial mini-map: the tile itself plus the neighbours its coast blends with
    const map = new HexMap(-1, -1, 3, 3);
    for (let r = -1; r <= 1; r++) for (let q = -1; q <= 1; q++) map.set(q, r, { biome: fam.biome, seed: 31 * (i * 3 + stage) + q * 7 + r * 13 });
    const w = tile.water;
    map.set(0, 0, { water: w ? w.own : 0, roads: tile.roads, plaza: tile.plaza });
    if (w) DIR_NAMES.forEach((n, d) => { const D = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]][d]; map.set(D[0], D[1], { water: w[n] ?? 0 }); });
    const chunk = new TerrainChunk(map, { focus: [0, 0] });
    chunk.mesh.position.set(cx, cy, 0);
    scene.add(chunk.mesh);
    terrain.push(chunk);
    for (const s of composeTile(tile)) sprites.add(s.name, cx + s.x, cy - s.y);
  });
  sprites.add(`icon_${fam.key}`, sx - 200, sy - 390);
  sprites.add(`wagonBig_${fam.key}`, sx + 190, sy - 300);
});
sprites.mesh.renderOrder = 1;
scene.add(sprites.mesh);
sprites.commit();

const mapView = buildMapView(scene, atlas, tex, SHEET_W / 2, -SHEET_H * 2 - 1700);

// ---------- camera: pan / zoom / focus ----------
const view = { x: SHEET_W / 2, y: -SHEET_H / 2, h: SHEET_H * 2.1 };
let target = { ...view };
function fitTo(x, y, w, h) {
  const aspect = canvas.clientWidth / canvas.clientHeight;
  target = { x, y, h: Math.max(h, w / aspect) * 1.04 };
}
function applyCamera() {
  const aspect = canvas.clientWidth / canvas.clientHeight;
  camera.left = (-view.h * aspect) / 2; camera.right = (view.h * aspect) / 2;
  camera.top = view.h / 2; camera.bottom = -view.h / 2;
  camera.position.set(view.x, view.y, 5);
  camera.updateProjectionMatrix();
}
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  applyCamera();
}
window.addEventListener('resize', resize);

// one pointer pans, two pointers pinch-zoom (touch), so the preview works on phones
const pointers = new Map();
let drag = null, pinch = null;
const worldAt = (cx, cy) => { const r = canvas.getBoundingClientRect(), k = view.h / canvas.clientHeight; return [view.x + (cx - r.left - r.width / 2) * k, view.y - (cy - r.top - r.height / 2) * k]; };
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), h: view.h }; drag = null; }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, [wx, wy] = worldAt(mx, my);
    const nh = Math.min(6000, Math.max(250, (pinch.h * pinch.d) / Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1]))));
    view.x = wx + (view.x - wx) * (nh / view.h); view.y = wy + (view.y - wy) * (nh / view.h); view.h = nh;
  } else if (drag) {
    const k = view.h / canvas.clientHeight;
    view.x = drag.vx - (e.clientX - drag.x) * k; view.y = drag.vy + (e.clientY - drag.y) * k;
  }
  target = { ...view };
});
const lift = (e) => { pointers.delete(e.pointerId); pinch = null; drag = null; if (pointers.size === 1) { const [p] = pointers.values(); drag = { x: p[0], y: p[1], vx: view.x, vy: view.y }; } };
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const k = view.h / canvas.clientHeight;
  const wx = view.x + (e.clientX - rect.left - rect.width / 2) * k, wy = view.y - (e.clientY - rect.top - rect.height / 2) * k;
  const f = Math.exp(e.deltaY * 0.0015);
  const nh = Math.min(6000, Math.max(250, view.h * f));
  view.x = wx + (view.x - wx) * (nh / view.h); view.y = wy + (view.y - wy) * (nh / view.h); view.h = nh;
  target = { ...view };
}, { passive: false });

// tabs
const tabs = document.getElementById('tabs');
const focusAll = () => fitTo(SHEET_W / 2, -SHEET_H / 2 + 70, SHEET_W * 2 - 80, SHEET_H + 1120);
const mkTab = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { [...tabs.children].forEach((c) => c.classList.remove('on')); b.classList.add('on'); fn(); }; tabs.appendChild(b); return b; };
mkTab('All sets', focusAll).classList.add('on');
sheets.forEach((s) => mkTab(s.fam.good, () => fitTo(s.x, s.y + 70, SHEET_W - 80, 1120)));
const focusMap = () => { const b = mapView.bounds; fitTo(b.x, b.y, b.w, b.h); };
mkTab('Map + caravans', focusMap);

// ---------- stats ----------
const stats = document.getElementById('stats');
let frames = 0, acc = 0, last = performance.now(), cpuAcc = 0, jsAcc = 0;
const params = new URLSearchParams(location.search);
if (params.has('map')) { focusMap(); Object.assign(view, target); }
else if (params.has('set')) { const s = sheets[+params.get('set')]; fitTo(s.x, s.y + 70, SHEET_W - 80, 1120); Object.assign(view, target); }
else { focusAll(); Object.assign(view, target); }
if (params.has('zoom')) { const [x, y, h] = params.get('zoom').split(',').map(Number); Object.assign(view, { x, y, h }); target = { ...view }; }

// perf A/B switches: ?noterrain / ?nosprites
if (params.has('noterrain')) { terrain.forEach((c) => (c.mesh.visible = false)); mapView.chunk.mesh.visible = false; }
if (params.has('nosprites')) { sprites.mesh.visible = false; mapView.layer.mesh.visible = false; }

resize();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t0 = performance.now();
  const k = 1 - Math.exp(-dt * 9);
  view.x += (target.x - view.x) * k; view.y += (target.y - view.y) * k; view.h += (target.h - view.h) * k;
  applyCamera();
  const t = now / 1000;
  terrain.forEach((c) => c.update(t));
  sprites.update(t);
  mapView.update(t, dt);
  jsAcc += performance.now() - t0;
  renderer.render(scene, camera);
  cpuAcc += performance.now() - t0;
  frames++; acc += dt;
  if (acc > 0.5) {
    const info = renderer.info.render;
    stats.textContent = `${Math.round(frames / acc)} fps · js ${(jsAcc / frames).toFixed(2)} ms · cpu+submit ${(cpuAcc / frames).toFixed(2)} ms · ${info.calls} draw calls · ${sprites.geometry.instanceCount + mapView.layer.geometry.instanceCount} sprites · atlas ${atlas.width}×${atlas.height} baked in ${bakeMs.toFixed(0)} ms`;
    window.__info = { fps: frames / acc, js: jsAcc / frames, cpu: cpuAcc / frames, calls: info.calls, sprites: sprites.geometry.instanceCount + mapView.layer.geometry.instanceCount, bakeMs, atlas: [atlas.width, atlas.height] };
    frames = 0; acc = 0; cpuAcc = 0; jsAcc = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

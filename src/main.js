import * as THREE from 'three';
import { bakeAtlas } from './art/atlas.js';
import { SPRITE_DEFS } from './art/sprites.js';
import { HexMap, DIR_NAMES, HEX_R, hexToWorld } from './engine/hex.js';
import { TerrainChunk } from './engine/terrain.js';
import { SpriteLayer, atlasTexture } from './engine/spriteLayer.js';
import { FAMILIES } from './tiles.js';
import { buildMapView } from './mapview.js';
import { dressFiller } from './filler.js';
import { loadRefArt, clipFor } from './engine/refArt.js';

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

// ---------- layout ----------
// Four goods sheets in the reference's own layout (1536 x 1024, 1 unit = 1 ref px,
// assets at their source positions) so preview and reference compare 1:1, plus a
// fifth sheet of the code-drawn filler hexes that join them on the map.
const SHEET_W = 1536, SHEET_H = 1024, GAP = 140, TILE_DX = 515;
const sheets = FAMILIES.map((fam, i) => ({ fam, x: (i % 2) * (SHEET_W + GAP), y: -Math.floor(i / 2) * (SHEET_H + GAP) }));
const terrain = [];

// filler sheet: the code-drawn hexes (one per biome, road and water case) at
// the same size as the reference tiles, two rows of four
const FILL_Y = -2 * (SHEET_H + GAP);
const FILL_W = 4 * TILE_DX;
const FILLER = [
  { biome: 'meadow' }, { biome: 'autumn' }, { biome: 'moor' }, { biome: 'jungle' },
  { biome: 'meadow', roads: [0, 3] }, { biome: 'autumn', roads: [1, 4] }, { biome: 'moor', roads: [0, 2, 4] }, { biome: 'meadow', water: 1 },
];
const fillerPos = (i) => [(SHEET_W * 2 + GAP - FILL_W) / 2 + (i % 4 + 0.5) * TILE_DX, FILL_Y - 330 - Math.floor(i / 4) * 640];
FILLER.forEach((f, i) => {
  const map = new HexMap(0, 0, 1, 1);
  map.set(0, 0, { biome: f.biome, roads: f.roads ?? [], water: f.water ?? 0, seed: 17 + i * 31 });
  const chunk = new TerrainChunk(map);
  const [x, y] = fillerPos(i);
  chunk.mesh.position.set(x, y, 0);
  scene.add(chunk.mesh);
  terrain.push(chunk);
});
// dressed once the reference props are loaded (see below)
const dressFillerSheet = (layer, props) => FILLER.forEach((f, i) => {
  if (f.water) return;
  const [x, y] = fillerPos(i);
  const tile = { water: null, roads: (f.roads ?? []).map((d) => DIR_NAMES[d]) };
  for (const s of dressFiller(props, f.biome, tile, 100 + i * 13, { density: tile.roads.length ? 1.15 : 1.5 })) layer.add(s.name, x + s.x, y - s.y);
});
sprites.mesh.renderOrder = 1;
scene.add(sprites.mesh);
sprites.commit();

const MAP_OX = SHEET_W + GAP / 2, MAP_OY = FILL_Y - 1300 - 1700;
let mapView = null;
let ref = null;
const refGround = [], refOver = [];

// reference art: sheet tiles split into ground + overhang, icons and wagons at their source spots
loadRefArt(renderer).then((r) => {
  ref = r;
  const ground = new SpriteLayer(r.atlas, r.tex, 512), over = new SpriteLayer(r.atlas, r.tex, 512);
  ground.mesh.renderOrder = 0.5; over.mesh.renderOrder = 2;
  scene.add(ground.mesh, over.mesh);
  refGround.push(ground); refOver.push(over);
  for (const s of sheets) {
    for (let st = 0; st < 3; st++) {
      const name = `${s.fam.key}_${st}`, t = r.manifest.tiles[name];
      const v = t.src.verts, cx = v.reduce((a, p) => a + p[0], 0) / 6, cy = v.reduce((a, p) => a + p[1], 0) / 6;
      const rad = v.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0) / 6;
      const sc = rad / (HEX_R + t.ink / 2 / Math.cos(Math.PI / 6));
      const c = clipFor(name, 'sheet');
      ground.add(name, s.x + cx, s.y - cy, { scale: sc, clip: c.ground });
      over.add(name, s.x + cx, s.y - cy, { scale: sc, clip: c.over, z: -1e5 });
    }
    for (const kind of ['icon', 'wagon']) {
      const name = `${s.fam.key}_${kind}`, it = r.manifest.items[name];
      over.add(name, s.x + it.src.x - 2 + it.ax, s.y - (it.src.y - 2 + it.ay));
    }
  }
  const props = new SpriteLayer(r.atlas, r.tex, 512);
  props.mesh.renderOrder = 1;
  scene.add(props.mesh);
  dressFillerSheet(props, r.props);
  refGround.push(props);
  ground.commit(); over.commit(); props.commit();
  mapView = buildMapView(scene, atlas, tex, MAP_OX, MAP_OY, r);
  refGround.push(mapView.refGround); refOver.push(mapView.refOver);
  if (params.has('map')) { focusMap(); Object.assign(view, target); }
  if (params.has('noterrain')) mapView.chunk.mesh.visible = false;
  if (params.has('nosprites')) mapView.layer.mesh.visible = false;
  window.__ready = true;
});

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
const ALL_W = SHEET_W * 2 + GAP, ALL_H = -FILL_Y + 1300;
const focusAll = () => fitTo(ALL_W / 2, -ALL_H / 2 + 20, ALL_W, ALL_H);
const mkTab = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { [...tabs.children].forEach((c) => c.classList.remove('on')); b.classList.add('on'); fn(); }; tabs.appendChild(b); return b; };
mkTab('All sets', focusAll).classList.add('on');
const focusSheet = (s) => fitTo(s.x + SHEET_W / 2, s.y - SHEET_H / 2, SHEET_W, SHEET_H);
sheets.forEach((s) => mkTab(s.fam.good, () => focusSheet(s)));
mkTab('Filler', () => fitTo(ALL_W / 2, FILL_Y - 650, FILL_W + 100, 1300));
const focusMap = () => { if (!mapView) return; const b = mapView.bounds; fitTo(b.x, b.y, b.w, b.h); };
mkTab('Map + caravans', focusMap);

// ---------- stats ----------
const stats = document.getElementById('stats');
let frames = 0, acc = 0, last = performance.now(), cpuAcc = 0, jsAcc = 0;
const params = new URLSearchParams(location.search);
if (params.has('set')) { focusSheet(sheets[+params.get('set')]); Object.assign(view, target); }
// ?score=i : the sheet at exactly 1 css px per unit, top-left at the viewport origin
if (params.has("score")) { const s = sheets[+params.get("score")]; Object.assign(view, { x: s.x + SHEET_W / 2, y: s.y - SHEET_H / 2, h: SHEET_H }); target = { ...view }; document.body.classList.add("bare"); }
else { focusAll(); Object.assign(view, target); }
if (params.has('zoom')) { const [x, y, h] = params.get('zoom').split(',').map(Number); Object.assign(view, { x, y, h }); target = { ...view }; }

// perf A/B switches: ?noterrain / ?nosprites
if (params.has('noterrain')) terrain.forEach((c) => (c.mesh.visible = false));
if (params.has('nosprites')) sprites.mesh.visible = false;

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
  for (const l of refGround) l.update(t);
  for (const l of refOver) l.update(t);
  if (mapView) mapView.update(t, dt);
  jsAcc += performance.now() - t0;
  renderer.render(scene, camera);
  cpuAcc += performance.now() - t0;
  frames++; acc += dt;
  if (acc > 0.5) {
    const info = renderer.info.render;
    const nSpr = sprites.geometry.instanceCount + (mapView ? mapView.layer.geometry.instanceCount : 0) + [...refGround, ...refOver].reduce((a, l) => a + l.geometry.instanceCount, 0);
    stats.textContent = `${Math.round(frames / acc)} fps · js ${(jsAcc / frames).toFixed(2)} ms · cpu+submit ${(cpuAcc / frames).toFixed(2)} ms · ${info.calls} draw calls · ${nSpr} sprites · code atlas ${atlas.width}×${atlas.height} in ${bakeMs.toFixed(0)} ms` + (ref ? ` · ref atlas ${ref.atlas.width}×${ref.atlas.height}` : '');
    window.__info = { fps: frames / acc, js: jsAcc / frames, cpu: cpuAcc / frames, calls: info.calls, sprites: nSpr, bakeMs, atlas: [atlas.width, atlas.height], ready: !!window.__ready };
    frames = 0; acc = 0; cpuAcc = 0; jsAcc = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

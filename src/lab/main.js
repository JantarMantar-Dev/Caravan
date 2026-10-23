// Asset lab: one hex tile as a stack of game layers (tools/layers.py).
//
//   Original  the flat reference tile
//   Layered   ground planes (water, sand, ground, road) + every object and
//             its parts as separate sprites; water is live (water shader)
//   Build     the tile assembles itself: planes settle, then each asset drops
//             in and lands with a squash, a dust puff and its own sound
//   Explode   the stack pulled apart by layer, labelled
//
// The layer list toggles any layer and highlights it on hover.
import * as THREE from 'three';
import { layers as LAYERS, files } from '../../assets/layers.js';
import { loadTexture, layerMaterial, waterMaterial, puffTexture, WAVE_PERIOD, RING_PERIOD } from './materials.js';
import { Sfx } from './sfx.js';
import { scenes as SCENES } from '../../assets/scenes/index.js';
import { renderScene, wrap } from '../gen/index.js';
import { waterField, waterMesh, pixelWaterMesh, SWELL_PERIOD } from './water.js';
import { renderPixelScene, P as PIXEL } from '../pixel/index.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0xffffff, 1);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
const sfx = new Sfx();
const params = new URLSearchParams(location.search);

const PLANE_ORDER = ['water', 'sand', 'ground', 'road'];
const KIND_RANK = { rock: 1, ledge: 1, dock: 2, wall: 3, building: 4, tower: 4, fence: 5, stall: 5, rack: 6, crop: 6,
  prop: 7, crate: 7, barrel: 7, animal: 8, tree: 9, bush: 9, heather: 9, palm: 9, flower: 9 };
const KIND_LABEL = { rock: 'Rocks', ledge: 'Rocks', dock: 'Dock', wall: 'Walls', building: 'Buildings', tower: 'Buildings',
  fence: 'Fences & stalls', stall: 'Fences & stalls', rack: 'Racks & crops', crop: 'Racks & crops', prop: 'Props',
  crate: 'Props', barrel: 'Props', animal: 'Animals', tree: 'Trees & bushes', bush: 'Trees & bushes', flower: 'Trees & bushes',
  heather: 'Trees & bushes', palm: 'Trees & bushes' };
const PLANE_LABEL = { water: 'Water', sand: 'Sand', ground: 'Ground', grass: 'Grass', road: 'Road', frame: 'Hex frame' };
const EXPLODE_GAP = 95;
const FAM_ORDER = ["fish", "apple", "wool", "spice"];
const TILE_NAMES = Object.keys(LAYERS).sort((a, b) => FAM_ORDER.indexOf(a.split("_")[0]) - FAM_ORDER.indexOf(b.split("_")[0]) || a.localeCompare(b));
const FAMS = [...new Set(TILE_NAMES.map((n) => n.split('_')[0]))];

const state = {
  tile: null, version: 3, explode: 0, explodeTo: 0, building: false, buildT: 0, items: [], flat: null,
  sel: null, hover: null, time: 0, lastRing: -1, wetItems: [], waterShare: 0,
};
const cache = new Map();
const group = new THREE.Group();
scene.add(group);
const puffTex = puffTexture();
const puffs = [];

// ---------- loading ----------
async function loadTile(name) {
  if (cache.has(name)) return cache.get(name);
  const L = LAYERS[name];
  const urls = new Set([L.flat, ...L.planes.map((p) => p.file), ...L.objects.flatMap((o) => [o.body.file, ...(o.parts ?? []).map((p) => p.file)])]);
  if (L.water) urls.add(L.water);
  const tex = {};
  await Promise.all([...urls].map(async (u) => { tex[u] = await loadTexture(files[u], renderer); }));
  // the water field on the CPU too: wet landings and the ambient mix
  let field = null;
  if (L.water) {
    const im = tex[L.water].image, cv = document.createElement('canvas');
    cv.width = im.width; cv.height = im.height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    field = g.getImageData(0, 0, im.width, im.height);
  }
  const out = { L, tex, field };
  cache.set(name, out);
  return out;
}

const wetAt = (T, x, y) => {
  if (!T.field) return 0;
  const X = Math.round(x + T.L.ox), Y = Math.round(y + T.L.oy);
  if (X < 0 || Y < 0 || X >= T.field.width || Y >= T.field.height) return 0;
  return T.field.data[(Y * T.field.width + X) * 4 + 2] / 255;
};

// a quad covering (x, y, w, h) in tile px (y down), anchored at (ax, ay)
function quad(r, ax, ay, mat) {
  const g = new THREE.PlaneGeometry(r.w, r.h);
  g.translate(r.x + r.w / 2 - ax, -(r.y + r.h / 2) + ay, 0);
  const m = new THREE.Mesh(g, mat);
  m.position.set(ax, -ay, 0);
  return m;
}

function clearTile() {
  for (const it of state.items) { it.mesh.geometry.dispose(); it.mat.dispose(); }
  if (state.flat) { state.flat.geometry.dispose(); state.flat.material.dispose(); }
  group.clear();
  state.items = [];
}

async function showTile(name) {
  if (state.version === 3 && SCENES[name]) return showGenerated(name);
  if (state.version === 4 && SCENES[name]) return showPixel(name);
  status('loading ' + name + '…');
  const T = await loadTile(name);
  clearTile();
  state.tile = name;
  state.T = T;
  const { L, tex } = T;
  let order = 0;
  // flat original
  state.flat = quad({ x: -L.ox, y: -L.oy, w: L.w, h: L.h }, 0, 0, layerMaterial(tex[L.flat]));
  state.flat.renderOrder = order++;
  group.add(state.flat);
  // planes
  const items = [];
  for (const p of [...L.planes].sort((a, b) => PLANE_ORDER.indexOf(a.id) - PLANE_ORDER.indexOf(b.id))) {
    const mat = p.id === 'water' && L.water
      ? waterMaterial(tex[p.file], tex[L.water], p, { ox: L.ox, oy: L.oy, w: L.w, h: L.h })
      : layerMaterial(tex[p.file]);
    const mesh = quad(p, 0, 0, mat);
    items.push({ id: p.id, label: PLANE_LABEL[p.id], kind: p.id, type: 'plane', mesh, mat, ax: 0, ay: 0,
      level: PLANE_ORDER.indexOf(p.id), band: PLANE_LABEL[p.id] });
  }
  // objects (drawn back to front by foot), parts above their body
  const kinds = [...new Set(L.objects.map((o) => KIND_LABEL[o.kind] ?? 'Props'))]
    .sort((a, b) => rankOfLabel(a) - rankOfLabel(b));
  for (const o of L.objects) {
    const band = KIND_LABEL[o.kind] ?? 'Props';
    const level = PLANE_ORDER.length + kinds.indexOf(band);
    const [fx, fy] = o.foot;
    const body = { id: o.id, label: pretty(o.id) + (o.rebuilt ? ' (rebuilt)' : ''), kind: o.kind, type: 'object', mesh: quad(o.body, fx, fy, layerMaterial(tex[o.body.file])),
      ax: fx, ay: fy, level, band, z: o.z, rank: KIND_RANK[o.kind] ?? 7, wet: wetAt(T, fx, fy - 2) > 0.5 };
    body.mat = body.mesh.material;
    items.push(body);
    const step = Math.min(0.45, 1.6 / Math.max(1, o.parts?.length ?? 1));
    (o.parts ?? []).forEach((p, i) => {
      const ax = p.x + p.w / 2, ay = p.y + p.h;
      const it = { id: o.id + '/' + p.id, label: pretty(p.id), kind: p.id === 'roof' ? 'roof' : o.kind, type: 'part', parent: body,
        mesh: quad(p, ax, ay, layerMaterial(tex[p.file])), ax, ay, level: level + step * (i + 1), band, z: o.z + 0.01 * (i + 1), rank: body.rank };
      it.mat = it.mesh.material;
      items.push(it);
    });
  }
  // render order: planes, then objects by z (parts right after their body)
  const objs = items.filter((i) => i.type !== 'plane').sort((a, b) => a.z - b.z);
  for (const it of [...items.filter((i) => i.type === 'plane'), ...objs]) {
    it.mesh.renderOrder = order++;
    it.on = true; it.alpha = 1; it.dy = 0; it.sx = 1; it.sy = 1; it.flash = 0; it.vis = 1;
    group.add(it.mesh);
  }
  state.items = items;
  state.wetItems = items.filter((i) => i.type === 'object' && i.wet && (i.kind === 'rock' || i.kind === 'dock'));
  state.waterShare = waterShare(T);
  state.period = WAVE_PERIOD;
  buildList();
  summary();
  fit();
  status(`${name}: ${L.planes.length} planes · ${L.objects.length} objects · ${L.objects.reduce((n, o) => n + (o.parts?.length ?? 0), 0)} parts`);
  document.querySelectorAll('#tiles button').forEach((b) => b.classList.toggle('on', b.dataset.tile === name));
}

// ---------- generated tiles (src/gen): every asset drawn as vectors ----------
// Rasterised at RES x tile px, so the art stays sharp when zoomed; the water
// is a shader over a distance field of the land (src/lab/water.js).
const RES = Math.min(4, Math.max(2, Math.ceil((window.devicePixelRatio || 1) * 2)));
async function raster(inner, box) {
  const k = RES;
  const W = Math.ceil(box[2] * k), H = Math.ceil(box[3] * k);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(wrap(inner, box, k));
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.getContext('2d').drawImage(img, 0, 0, W, H);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = true; t.flipY = false;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const genCache = new Map();
async function loadGenerated(name) {
  if (genCache.has(name)) return genCache.get(name);
  const S = renderScene(SCENES[name]);
  const L = LAYERS[name];
  const ox = L?.ox ?? S.w / 2, oy = L?.oy ?? S.h / 2;
  const tex = {};
  await Promise.all([...S.planes, ...S.objects].map(async (o) => { tex[o.id] = await raster(o.svg, o.box); }));
  tex.__frame = await raster(S.frame, [0, 0, S.w, S.h]);
  const flat = L ? await loadTexture(files[L.flat], renderer) : null;
  const field = waterField(S.w, S.h, S.land.sand, S.stands);
  const out = { S, tex, ox, oy, field, flat, L };
  genCache.set(name, out);
  return out;
}
async function showGenerated(name) {
  status('drawing ' + name + '…');
  const G = await loadGenerated(name);
  clearTile();
  state.tile = name;
  state.T = { L: { ...(G.L ?? {}), ox: G.ox, oy: G.oy, w: G.S.w, h: G.S.h, objects: G.S.objects }, gen: G };
  const { S, tex, ox, oy } = G;
  const rel = (b) => ({ x: b[0] - ox, y: b[1] - oy, w: b[2], h: b[3] });
  let order = 0;
  if (G.flat) {
    state.flat = quad({ x: -ox, y: -oy, w: S.w, h: S.h }, 0, 0, layerMaterial(G.flat));
    state.flat.renderOrder = order++;
    group.add(state.flat);
  }
  const items = [];
  const plane = (id, mesh, level) => ({ id, label: PLANE_LABEL[id], kind: id, type: 'plane', mesh, mat: mesh.material, ax: 0, ay: 0, level, band: PLANE_LABEL[id] });
  const water = waterMesh(S.hex, ox, oy, G.field.tex, S.w, S.h);
  const byId = Object.fromEntries(S.planes.map((p) => [p.id, p]));
  items.push(plane('sand', quad(rel(byId.sand.box), 0, 0, layerMaterial(tex.sand)), 1));
  items.push(plane('water', water, 0));
  items.push(plane('grass', quad(rel(byId.grass.box), 0, 0, layerMaterial(tex.grass)), 2));
  items.push(plane('road', quad(rel(byId.road.box), 0, 0, layerMaterial(tex.road)), 3));
  const kinds = [...new Set(S.objects.map((o) => KIND_LABEL[o.kind] ?? 'Props'))].sort((a, b) => rankOfLabel(a) - rankOfLabel(b));
  S.objects.forEach((o, i) => {
    const band = KIND_LABEL[o.kind] ?? 'Props';
    const fx = o.foot[0] - ox, fy = o.foot[1] - oy;
    const mesh = quad(rel(o.box), fx, fy, layerMaterial(tex[o.id]));
    items.push({ id: o.id, label: pretty(o.id), kind: o.kind, type: 'object', mesh, mat: mesh.material, ax: fx, ay: fy,
      level: 4 + kinds.indexOf(band), band, z: i, rank: KIND_RANK[o.kind] ?? 7, wet: !!o.wet });
  });
  const fr = plane('frame', quad({ x: -ox, y: -oy, w: S.w, h: S.h }, 0, 0, layerMaterial(tex.__frame)), 0);
  for (const it of [...items, fr]) {
    it.mesh.renderOrder = order++;
    it.on = true; it.alpha = 1; it.dy = 0; it.sx = 1; it.sy = 1; it.flash = 0; it.vis = 1;
    group.add(it.mesh);
  }
  items.push(fr);
  state.items = items;
  state.wetItems = items.filter((i) => i.type === 'object' && i.wet && (i.kind === 'rock' || i.kind === 'dock'));
  state.waterShare = G.field.share;
  state.period = SWELL_PERIOD;
  buildList();
  summary();
  fit();
  status(`${name}: generated · 4 planes · ${S.objects.length} assets · drawn at ${RES}x`);
  document.querySelectorAll('#tiles button').forEach((b) => b.classList.toggle('on', b.dataset.tile === name));
}

// ---------- pixel-art tiles (src/pixel): the same scene on a coarse grid ----
const pixCache = new Map();
function pixelTexture(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = true; t.flipY = false;
  t.generateMipmaps = false; t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
  return t;
}
async function showPixel(name) {
  status('drawing ' + name + ' as pixel art…');
  const G = await loadGenerated(name);                  // shares the layout, ox/oy and the water field
  if (!pixCache.has(name)) pixCache.set(name, renderPixelScene(SCENES[name]));
  const X = pixCache.get(name);
  clearTile();
  state.tile = name;
  state.T = { L: { ...(G.L ?? {}), ox: G.ox, oy: G.oy, w: G.S.w, h: G.S.h, objects: X.objects }, pixel: X, gen: null };
  const { ox, oy } = G;
  const rel = (b) => ({ x: b[0] - ox, y: b[1] - oy, w: b[2], h: b[3] });
  let order = 0;
  const items = [];
  const plane = (id, mesh, level) => ({ id, label: PLANE_LABEL[id], kind: id, type: 'plane', mesh, mat: mesh.material, ax: 0, ay: 0, level, band: PLANE_LABEL[id] });
  const byId = Object.fromEntries(X.planes.map((p) => [p.id, p]));
  items.push(plane('sand', quad(rel(byId.sand.box), 0, 0, layerMaterial(pixelTexture(byId.sand.canvas))), 1));
  items.push(plane('water', pixelWaterMesh(G.S.hex, ox, oy, G.field.tex, G.S.w, G.S.h, PIXEL), 0));
  items.push(plane('grass', quad(rel(byId.grass.box), 0, 0, layerMaterial(pixelTexture(byId.grass.canvas))), 2));
  items.push(plane('road', quad(rel(byId.road.box), 0, 0, layerMaterial(pixelTexture(byId.road.canvas))), 3));
  const kinds = [...new Set(X.objects.map((o) => KIND_LABEL[o.kind] ?? 'Props'))].sort((a, b) => rankOfLabel(a) - rankOfLabel(b));
  X.objects.forEach((o, i) => {
    const band = KIND_LABEL[o.kind] ?? 'Props';
    const fx = o.foot[0] - ox, fy = o.foot[1] - oy;
    const mesh = quad(rel(o.box), fx, fy, layerMaterial(pixelTexture(o.canvas)));
    items.push({ id: o.id, label: pretty(o.id), kind: o.kind, type: 'object', mesh, mat: mesh.material, ax: fx, ay: fy,
      level: 4 + kinds.indexOf(band), band, z: i, rank: KIND_RANK[o.kind] ?? 7, wet: !!o.wet });
  });
  const fr = plane('frame', quad(rel(X.frame.box), 0, 0, layerMaterial(pixelTexture(X.frame.canvas))), 0);
  for (const it of [...items, fr]) {
    it.mesh.renderOrder = order++;
    it.on = true; it.alpha = 1; it.dy = 0; it.sx = 1; it.sy = 1; it.flash = 0; it.vis = 1;
    group.add(it.mesh);
  }
  items.push(fr);
  state.items = items;
  state.wetItems = items.filter((i) => i.type === 'object' && i.wet && (i.kind === 'rock' || i.kind === 'dock'));
  state.waterShare = G.field.share;
  state.period = SWELL_PERIOD;
  buildList();
  summary();
  fit();
  status(`${name}: pixel art · ${PIXEL} tile px per pixel · ${X.objects.length} sprites`);
  document.querySelectorAll('#tiles button').forEach((b) => b.classList.toggle('on', b.dataset.tile === name));
}

const rankOfLabel = (lab) => Math.min(...Object.entries(KIND_LABEL).filter(([, v]) => v === lab).map(([k]) => KIND_RANK[k] ?? 7));
const pretty = (id) => id.replace(/_/g, ' ').replace(/\b(\w)/, (c) => c.toUpperCase());

function waterShare(T) {
  if (!T.field) return 0;
  let n = 0, w = 0;
  const d = T.field.data;
  for (let i = 0; i < d.length; i += 16) { n++; w += d[i + 2] > 128 ? 1 : 0; }
  return w / n;
}

// ---------- UI ----------
function buildTileChips() {
  const box = $('#tiles');
  for (const f of FAMS) {
    const span = document.createElement('span');
    span.className = 'fam';
    span.innerHTML = `<b>${f}</b>`;
    for (const n of TILE_NAMES.filter((t) => t.startsWith(f + '_'))) {
      const b = document.createElement('button');
      b.className = 'chip'; b.dataset.tile = n; b.textContent = n.split('_')[1];
      b.title = n;
      b.onclick = () => { sfx.click(); stopBuild(); showTile(n); };
      span.appendChild(b);
    }
    box.appendChild(span);
  }
}

function buildList() {
  const ul = $('#layers');
  ul.innerHTML = '';
  const bands = [];
  const key = (i) => { const b = i.parent ?? i; return [Math.floor(b.level), b.z ?? 0, i.parent ? i.level : 0]; };
  const cmp = (a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]; };
  for (const it of [...state.items].sort(cmp)) {
    const band = it.type === 'plane' ? 'Ground planes' : it.band;
    if (bands[bands.length - 1] !== band) {
      bands.push(band);
      const h = document.createElement('li');
      h.className = 'head'; h.textContent = band;
      ul.appendChild(h);
    }
    const li = document.createElement('li');
    if (it.type === 'part') li.className = 'part';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = it.on;
    cb.setAttribute('aria-label', 'Show ' + it.label);
    cb.onclick = (e) => { e.stopPropagation(); it.on = cb.checked; sfx.click(); };
    const span = document.createElement('span');
    span.textContent = it.label;
    const k = document.createElement('span');
    k.className = 'k'; k.textContent = it.type === 'plane' ? '' : it.kind;
    li.append(cb, span, k);
    li.onmouseenter = () => { state.hover = it; };
    li.onmouseleave = () => { state.hover = null; };
    li.onclick = () => { state.sel = state.sel === it ? null : it; ul.querySelectorAll('li').forEach((x) => x.classList.remove('sel')); if (state.sel) li.classList.add('sel'); };
    it.li = li; it.cb = cb;
    ul.appendChild(li);
  }
}

function summary() {
  const L = state.T.L;
  if (state.T.pixel) {
    const kinds = {};
    for (const o of state.T.pixel.objects) kinds[o.kind] = (kinds[o.kind] ?? 0) + 1;
    $('#summary').innerHTML = `<b>${state.tile}</b> · pixel-art version of the same layout<br>` +
      Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(' · ') +
      `<br>Every sprite is drawn on a ${PIXEL} px grid with a small palette and darker edge pixels; the water animates in frames.`;
    return;
  }
  if (state.T.gen) {
    const kinds = {};
    for (const o of state.T.gen.S.objects) kinds[o.kind] = (kinds[o.kind] ?? 0) + 1;
    $('#summary').innerHTML = `<b>${state.tile}</b> · generated from the reference layout<br>` +
      Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(' · ') +
      '<br>Every asset is a vector drawing: whole trees and rocks, one projection for everything built, live water.';
    return;
  }
  const kinds = {};
  for (const o of L.objects) kinds[o.kind] = (kinds[o.kind] ?? 0) + 1;
  $('#summary').innerHTML = `<b>${state.tile}</b> · ${L.w}×${L.h} px<br>` +
    Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(' · ') +
    (L.review ? `<br>Layers re-composite to the original: ${(100 - L.review.recomposite_bad * 100).toFixed(1)}% of pixels exact` : '');
}

function status(s) { $('#status').textContent = s; }

$('#version').onclick = (e) => {
  const v = +e.target.dataset.v;
  if (!v) return;
  sfx.click();
  state.version = v;
  document.querySelectorAll('#version button').forEach((b) => b.classList.toggle('on', +b.dataset.v === v));
  if (v === 1) { stopBuild(); state.explodeTo = 0; $('#explode').classList.remove('on'); }
  else if (state.tile && (v >= 3 || state.T?.gen || state.T?.pixel)) { stopBuild(); showTile(state.tile); }
  $('#build').disabled = $('#explode').disabled = v === 1;
};
$('#explode').onclick = () => {
  sfx.click();
  state.explodeTo = state.explodeTo ? 0 : 1;
  $('#explode').classList.toggle('on', !!state.explodeTo);
};
$('#build').onclick = () => {
  if (!sfx.on) toggleSound(true);
  startBuild();
};
$('#sound').onclick = () => toggleSound(!sfx.on);
function toggleSound(on) {
  if (on) sfx.enable(); else sfx.disable();
  $('#sound').textContent = on ? '🔊 Sound' : '🔇 Sound';
  $('#sound').classList.toggle('on', on);
}

// ---------- build animation ----------
// planes settle first, then assets land in construction order: rocks, dock,
// walls and buildings (body, then roof, chimney, door), fences and stalls,
// racks, props, and the greenery last.
function startBuild() {
  state.building = true;
  state.buildT = -0.2;
  let t = 0;
  const seq = [];
  for (const it of state.items.filter((i) => i.type === 'plane').sort((a, b) => a.level - b.level)) { it.start = t; t += it.id === 'water' ? 0.55 : 0.4; seq.push(it); }
  t += 0.15;
  const objs = state.items.filter((i) => i.type === 'object').sort((a, b) => a.rank - b.rank || a.z - b.z);
  for (const o of objs) {
    o.start = t; seq.push(o);
    t += o.rank >= 9 ? 0.09 : o.rank <= 1 ? 0.12 : 0.16;
    const parts = state.items.filter((i) => i.parent === o);
    const gap = parts.length > 6 ? 0.085 : 0.2;          // piles and planks go down fast
    for (const p of parts) { t += gap; p.start = t; seq.push(p); }
    if (parts.length) t += 0.15;
  }
  for (const it of seq) { it.landed = false; it.dur = it.type === 'plane' ? 0.6 : 0.62; }
  state.buildEnd = t + 0.8;
  state.chimed = false;
}
function stopBuild() {
  state.building = false;
  for (const it of state.items) { it.dy = 0; it.sx = it.sy = 1; it.alpha = 1; it.flash = 0; }
}
const bounce = (p) => {
  const n = 7.5625, d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
};
function stepBuild(dt) {
  state.buildT += dt;
  const T = state.buildT;
  for (const it of state.items) {
    const p = (T - it.start) / it.dur;
    if (p <= 0) { it.alpha = 0; continue; }
    const q = Math.min(p, 1);
    if (it.type === 'plane') {
      const e = 1 - (1 - q) ** 3;
      it.alpha = Math.min(1, q * 2.5);
      it.dy = it.id === 'water' ? 0 : 60 * (1 - e);
      it.sx = it.sy = it.id === 'water' ? 0.9 + 0.1 * e : 1;
      if (!it.landed && q > 0.35) land(it);
    } else {
      const h = it.type === 'part' ? 120 : 240;
      it.dy = h * (1 - bounce(q));
      it.alpha = Math.min(1, q * 6);
      if (!it.landed && q >= 1 / 2.75) land(it);
      const s = it.landed ? 0.2 * Math.exp(-(T - it.landT) * 9) * Math.cos((T - it.landT) * 26) : 0;
      it.sy = 1 - s; it.sx = 1 + s * 0.55;
    }
    it.flash = it.landed ? 0.55 * Math.exp(-(T - it.landT) * 14) : 0;
  }
  if (T > state.buildEnd) {
    if (!state.chimed) { sfx.chime(); state.chimed = true; }
    if (T > state.buildEnd + 0.4) stopBuild();
  }
}
function land(it) {
  it.landed = true;
  it.landT = state.buildT;
  const pan = (it.ax / 260) * 0.8;
  sfx.drop(it.type === 'plane' ? it.id : it.type === 'part' ? (it.kind === 'roof' ? 'roof' : 'part') : it.kind, pan, !!it.wet);
  if (it.type !== 'plane') {
    const n = it.type === 'part' ? 1 : 2 + (it.rank <= 4 ? 1 : 0);
    for (let i = 0; i < n; i++) spawnPuff(it.ax + (i - (n - 1) / 2) * 16, it.ay, (i - (n - 1) / 2) || (Math.random() - 0.5), it.wet);
  }
}
function spawnPuff(x, y, dir, wet) {
  const mat = new THREE.MeshBasicMaterial({ map: puffTex, transparent: true, depthTest: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, color: wet ? 0xd8f1ff : 0xffffff });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), mat);
  m.position.set(x, -y + 6, 0);
  m.renderOrder = 1e4;
  group.add(m);
  puffs.push({ m, t: 0, vx: dir * 38 + (Math.random() - 0.5) * 10, vy: 14 + Math.random() * 10 });
}
function stepPuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.t += dt;
    const k = p.t / 0.55;
    if (k >= 1) { group.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); puffs.splice(i, 1); continue; }
    p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt;
    const s = 0.45 + 0.75 * Math.sqrt(k);
    p.m.scale.set(s, s, 1);
    p.m.material.opacity = 1 - k * k;
  }
}

// ---------- camera ----------
const view = { x: 0, y: 0, h: 700 };
let target = { ...view };
let userCam = false;
function fit() {
  if (!state.T) return;
  const L = state.T.L;
  const top = L.oy + state.explodeTo * (maxLevel() * EXPLODE_GAP);
  const w = L.w + (state.explodeTo ? 220 : 40), h = top + (L.h - L.oy) + 40;
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  target = { x: state.explodeTo ? -60 : 0, y: (top - (L.h - L.oy)) / 2, h: Math.max(h, w / aspect) * 1.04 };
  userCam = false;
}
const maxLevel = () => Math.max(0, ...state.items.map((i) => i.level));
function applyCamera() {
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  camera.left = (-view.h * aspect) / 2; camera.right = (view.h * aspect) / 2;
  camera.top = view.h / 2; camera.bottom = -view.h / 2;
  camera.position.set(view.x, view.y, 5);
  camera.updateProjectionMatrix();
}
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  if (!userCam) fit();
}
new ResizeObserver(resize).observe(canvas);
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const k = view.h / canvas.clientHeight;
  view.x -= (e.clientX - drag.x) * k; view.y += (e.clientY - drag.y) * k;
  target.x = view.x; target.y = view.y;
  drag = { x: e.clientX, y: e.clientY };
  userCam = true;
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  target.h = Math.min(4000, Math.max(120, target.h * Math.exp(e.deltaY * 0.0015)));
  userCam = true;
}, { passive: false });
canvas.addEventListener('dblclick', fit);

// ---------- labels in exploded view ----------
const labelBox = $('#labels');
function drawLabels() {
  if (state.explode < 0.6 || state.version === 1) { labelBox.innerHTML = ''; return; }
  const L = state.T.L;
  const seen = new Map();
  for (const it of state.items) {
    if (it.type === 'part' || !it.on) continue;
    const key = it.type === 'plane' ? it.label : it.band;
    if (!seen.has(key)) seen.set(key, { level: it.level, feet: [] });
    if (it.type === 'object') seen.get(key).feet.push(-it.ay);
  }
  const html = [];
  const x = -L.ox - 10;
  const rows = [];
  for (const [name, { level, feet }] of seen) {
    feet.sort((a, b) => a - b);
    const base = feet.length ? feet[feet.length >> 1] : 0;
    const y = level * EXPLODE_GAP * state.explode + base;
    const v = new THREE.Vector3(x, y, 0).project(camera);
    rows.push({ name, sx: (v.x * 0.5 + 0.5) * canvas.clientWidth, sy: (-v.y * 0.5 + 0.5) * canvas.clientHeight });
  }
  // keep labels apart: walk bottom-up and push each above the one below it
  rows.sort((a, b) => b.sy - a.sy);
  for (let i = 1; i < rows.length; i++) rows[i].sy = Math.min(rows[i].sy, rows[i - 1].sy - 24);
  for (const r of rows)
    html.push(`<div style="left:${r.sx.toFixed(0)}px;top:${r.sy.toFixed(0)}px;opacity:${Math.min(1, (state.explode - 0.6) * 2.5).toFixed(2)}">${r.name}</div>`);
  labelBox.innerHTML = html.join('');
}

// ---------- frame ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.still) state.time += dt;
  if (state.building && !state.freeze) stepBuild(dt);
  stepPuffs(dt);
  const ex = state.explodeTo;
  if (Math.abs(state.explode - ex) > 1e-3) {
    state.explode += (ex - state.explode) * (1 - Math.exp(-dt * 7));
    if (!userCam) fit();
  } else state.explode = ex;
  for (const k of ['x', 'y', 'h']) view[k] += (target[k] - view[k]) * (1 - Math.exp(-dt * 9));
  applyCamera();

  const layered = state.version !== 1;
  if (state.flat) state.flat.material.uniforms.uOpacity.value = layered ? 0 : 1;
  const focus = state.hover ?? state.sel;
  for (const it of state.items) {
    it.vis += ((it.on ? 1 : 0) - it.vis) * (1 - Math.exp(-dt * 12));
    const off = it.level * EXPLODE_GAP * state.explode;
    it.mesh.position.set(it.ax, -it.ay + it.dy + off, 0);
    it.mesh.scale.set(it.sx, it.sy, 1);
    const u = it.mat.uniforms;
    u.uOpacity.value = layered ? it.alpha * it.vis : 0;
    const isFocus = focus && (focus === it || focus === it.parent || it === focus.parent);
    u.uDim.value += ((focus && !isFocus ? 1 : 0) - u.uDim.value) * (1 - Math.exp(-dt * 10));
    u.uFlash.value = it.flash;
    if (u.uTime) u.uTime.value = state.time;
  }
  // ambient: surf follows the shore wave; a rock or post slaps on each ring
  if (layered && state.waterShare > 0) {
    sfx.ambient((state.time / (state.period ?? WAVE_PERIOD)) % 1, Math.min(1, state.waterShare * 2.2));
    const ring = Math.floor(state.time / (RING_PERIOD / 2));
    if (ring !== state.lastRing && state.wetItems.length && !state.building) {
      state.lastRing = ring;
      const r = state.wetItems[Math.floor(Math.random() * state.wetItems.length)];
      if (r.on) sfx.splash((r.ax / 260) * 0.8, 0.45 + Math.random() * 0.3);
    }
  } else sfx.ambient(0, 0);
  renderer.render(scene, camera);
  drawLabels();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
buildTileChips();
const start = params.get('tile') && LAYERS[params.get('tile')] ? params.get('tile') : (LAYERS.fish_1 ? 'fish_1' : TILE_NAMES[0]);
showTile(start).then(() => {
  if (params.has('explode')) { state.explodeTo = 1; state.explode = 1; fit(); Object.assign(view, target); $('#explode').classList.add('on'); }
  if (params.has('v1')) $('#version button[data-v="1"]').click();
  if (params.has('v2')) $('#version button[data-v="2"]').click();
  if (params.has('pixel')) $('#version button[data-v="4"]').click();
  if (params.has('t')) state.time = +params.get('t');
  if (params.has('still')) state.still = true;
  if (params.has('buildAt')) { startBuild(); for (let k = 0; k < +params.get('buildAt') * 60; k++) stepBuild(1 / 60); state.freeze = true; }
  if (params.has('zoom')) { target = { x: +(params.get('cx') ?? 0), y: -(params.get('cy') ?? 0), h: target.h / +params.get('zoom') }; userCam = true; }
  Object.assign(view, target);
  window.__ready = true;
});
window.__lab = { showTile, startBuild, state };
requestAnimationFrame(frame);

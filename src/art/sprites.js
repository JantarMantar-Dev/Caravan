// Sprite registry: every named, baked asset used by the hex tiles.
import * as N from './nature.js';
import * as B from './buildings.js';
import * as G from './goods.js';

const defs = [];
const add = (name, draw, opts = {}) => defs.push({ name, draw, ...opts });
const variants = (base, n, fn, opts) => { for (let i = 0; i < n; i++) add(`${base}${i}`, (c, r) => fn(c, r, i), { seed: 1000 + i * 77 + base.length, ...opts }); };

// --- nature ---
variants('tree', 4, (c, r, i) => N.roundTree(c, r, { size: [1, 0.85, 1.12, 0.92][i], base: ['#5fb63a', '#55aa36', '#67bd3f', '#4fa636'][i] }));
variants('pine', 3, (c, r, i) => N.pine(c, r, { size: [0.85, 0.72, 0.95][i] }));
variants('autumnTree', 3, (c, r, i) => N.autumnTree(c, r, { size: [1.15, 1, 0.9][i] }));
variants('poplar', 2, (c, r, i) => N.poplar(c, r, { size: [0.85, 0.75][i], base: ['#f2a12b', '#f08a24'][i] }));
variants('shrub', 4, (c, r, i) => N.shrub(c, r, { size: [1, 0.8, 0.9, 0.7][i] }));
variants('autumnShrub', 4, (c, r, i) => N.shrub(c, r, { size: [0.9, 0.75, 0.8, 0.65][i], base: ['#ec7f26', '#e9a02c', '#d9632a', '#e88a2a'][i] }));
variants('berryShrub', 2, (c, r, i) => N.shrub(c, r, { size: [0.9, 0.8][i], base: '#6aaa36', berries: ['#e3352a', '#f1b22c'][i] }));
variants('jungleShrub', 3, (c, r, i) => N.shrub(c, r, { size: [1.1, 0.9, 1.25][i], base: '#48ab3a' }));
variants('flowerShrub', 2, (c, r, i) => N.shrub(c, r, { size: 0.8, flowers: ['#ffffff', '#ffe066'][i] }));
variants('heather', 4, (c, r, i) => N.heather(c, r, { size: [1, 0.8, 1.2, 0.65][i] }));
variants('rock', 4, (c, r, i) => N.rock(c, r, { size: [1, 0.7, 0.55, 0.85][i] }));
variants('rockCluster', 2, (c, r, i) => N.rockCluster(c, r, { size: [1.1, 0.9][i] }));
variants('waterRock', 3, (c, r, i) => N.rockCluster(c, r, { size: [1, 0.75, 0.6][i], ripple: true }));
variants('mountain', 1, (c, r) => N.mountain(c, r, { size: 1 }));
variants('palm', 2, (c, r, i) => N.palm(c, r, { size: [1, 0.85][i], lean: [1, -0.6][i] }));
variants('banana', 2, (c, r, i) => N.banana(c, r, { size: [1, 0.8][i] }));
variants('chiliVine', 3, (c, r, i) => N.chiliVine(c, r, { size: [1, 0.9, 0.95][i] }));
variants('flowerBush', 1, (c, r) => N.flowerBush(c, r));
variants('fern', 2, (c, r, i) => N.fern(c, r, { size: [1, 0.8][i] }));
add('terrace', (c, r) => N.terraceWall(c, r, { len: 120 }));

// --- buildings (each with a mirrored twin so towns can face either way) ---
for (const mir of [false, true]) {
  const m = mir ? 'M' : '';
  add('houseRed' + m, (c, r) => B.house(c, r, { mir, roof: B.PAL.roofRed }));
  add('houseRedSmoke' + m, (c, r) => B.house(c, r, { mir, roof: B.PAL.roofRed, smoke: true, w: 52, d: 40 }));
  add('houseRedSmall' + m, (c, r) => B.house(c, r, { mir, roof: B.PAL.roofRed, w: 46, d: 36, h: 30, rh: 26, doorOn: 'x' }));
  add('houseSlate' + m, (c, r) => B.house(c, r, { mir, roof: B.PAL.roofSlate, wall: '#f2ead8', shutters: null }));
  add('houseSlateSmall' + m, (c, r) => B.house(c, r, { mir, roof: B.PAL.roofSlate, w: 46, d: 38, h: 30, rh: 26, doorOn: 'x', smoke: true }));
  add('barn' + m, (c, r) => B.barn(c, r, { mir, goods: 'apple' }));
  add('shedSlate' + m, (c, r) => B.shed(c, r, { mir, roof: B.PAL.roofSlate, contents: (cc) => { cc.save(); cc.translate(0, -2); B.woolBales(cc, r); cc.restore(); } }));
  add('shedRed' + m, (c, r) => B.shed(c, r, { mir, roof: B.PAL.roofRed, w: 64, d: 46, contents: (cc, P) => { for (const [x, y] of [[-16, -8], [0, -8], [16, -8], [-8, 8], [8, 8]]) { const p = P(x, y, 0); cc.save(); cc.translate(p[0], p[1]); B.chiliBasket(cc, r); cc.restore(); } } }));
  add('stallRed' + m, (c, r) => B.stall(c, r, { mir, goods: (cc, P) => { for (let i = 0; i < 3; i++) { const p = P(-12 + i * 12, -4, 13); B.fishShape(cc, p[0], p[1] - 2, 6, 2.2, 0.2); } } }));
  add('stallOrange' + m, (c, r) => B.stall(c, r, { mir, c1: '#ef9a2a', c2: '#fbf3e3', goods: (cc, P) => { for (let i = 0; i < 3; i++) { const p = P(-12 + i * 12, -4, 13); N.apple(cc, p[0], p[1] - 3, 3); } } }));
  add('fishRack' + m, (c, r) => B.fishRack(c, r, { mir }));
  for (const g of ['fish', 'apple', 'chili', 'wool', null]) add(`crate${g ?? 'Empty'}${m}`, (c, r) => B.crate(c, r, { mir, goods: g }));
}
add('lighthouse', (c, r) => B.lighthouse(c, r));
add('dock', (c, r) => B.dock(c, r));
add('barrel', (c, r) => B.barrel(c, r));
add('barrelSmall', (c, r) => B.barrel(c, r, { size: 0.75 }));
add('chiliBasket', (c, r) => B.chiliBasket(c, r));
add('awning', (c, r) => B.canvasAwning(c, r));
for (const len of [40, 60, 80, 100, 130]) for (const axis of ['x', 'y']) {
  add(`fence${len}${axis}`, (c, r) => B.fence(c, r, { len, axis }));
  add(`wall${len}${axis}`, (c, r) => B.stoneWall(c, r, { len, axis }));
}
variants('sheep', 4, (c, r, i) => B.sheep(c, r, { flip: i % 2 === 1, size: [1.35, 1.3, 1.25, 1.35][i] }));
add('woolBales', (c, r) => B.woolBales(c, r));

// --- goods: big presentation icons + wagons (drawn larger: scale applies to the bake) ---
add('icon_fish', (c, r) => G.fishIcon(c, r), { scale: 2.1 });
add('icon_apple', (c, r) => G.appleIcon(c, r), { scale: 2.1 });
add('icon_wool', (c, r) => G.woolIcon(c, r), { scale: 2.1 });
add('icon_spice', (c, r) => G.spiceIcon(c, r), { scale: 2.1 });
for (const g of G.GOODS) {
  add(`wagonBig_${g}`, (c, r) => G.wagon(c, r, { cargo: G.CARGO[g] }), { scale: 3.6 });
  add(`wagon_${g}`, (c, r) => G.wagon(c, r, { cargo: G.CARGO[g] }), { scale: 1.7 });
}
add('wagon_empty', (c, r) => G.wagon(c, r, {}), { scale: 1.7 });

export const SPRITE_DEFS = defs;

// Reference-art layers: the hex tiles, goods icons and wagons cut from the
// reference sheets by tools/ingest.py, packed into one texture atlas at load.
//
// Every tile comes in two forms that share the same anchor (the hex centre):
//   sheet  - with the sheet's heavy ink outline, for the asset preview
//   map    - outline removed where the edge is clean, for joining on the map
// and is drawn as two instances of the same frame, split by the sprite shader
// at the hex boundary: ground (inside) goes under all sprites, overhang
// (trees, roofs and towers poking out) goes over the neighbouring hexes.
import * as THREE from 'three';
import { manifest, files, props } from '../../assets/art.js';

const PAD = 4;

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

export async function loadRefArt(renderer) {
  const entries = [];
  for (const [name, t] of Object.entries(manifest.tiles)) {
    entries.push({ name, file: t.file, ax: t.ox, ay: t.oy });
    entries.push({ name: name + '_m', file: t.map, ax: t.ox, ay: t.oy });
  }
  for (const [name, it] of Object.entries(manifest.items)) entries.push({ name, file: it.file, ax: it.ax, ay: it.ay });
  for (const [name, p] of Object.entries(props.props)) entries.push({ name, file: p.file, ax: p.ax, ay: p.ay });
  await Promise.all(entries.map(async (e) => { e.img = await loadImage(files[e.file]); }));

  // shelf packing, tallest first
  const W = Math.min(4096, renderer.capabilities.maxTextureSize);
  entries.sort((a, b) => b.img.height - a.img.height);
  let x = 0, y = 0, shelf = 0;
  for (const e of entries) {
    const w = e.img.width + PAD * 2, h = e.img.height + PAD * 2;
    if (x + w > W) { x = 0; y += shelf; shelf = 0; }
    e.x = x + PAD; e.y = y + PAD; x += w; shelf = Math.max(shelf, h);
  }
  const H = y + shelf;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const frames = {};
  for (const e of entries) {
    ctx.drawImage(e.img, e.x, e.y);
    const w = e.img.width, h = e.img.height;
    frames[e.name] = { u0: e.x / W, v0: e.y / H, u1: (e.x + w) / W, v1: (e.y + h) / H, w, h, ax: e.ax, ay: e.ay };
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.premultiplyAlpha = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { atlas: { canvas, width: W, height: H, frames, bicubic: true }, tex, manifest, props: props.props };
}

// Clip settings for the two halves of a tile. The sheet outline is centred on
// the hex edge, so in sheet mode the cut sits just outside the ink.
export const clipFor = (tileName, mode) => {
  const half = (manifest.tiles[tileName]?.ink ?? 3) / 2;
  const cut = mode === 'map' ? 0 : -(half + 1.5);
  return { ground: [1, cut], over: [2, cut] };
};

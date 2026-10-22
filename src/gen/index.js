// Scene -> layers. A scene (assets/scenes/<tile>.json, from tools/scene.py)
// lists the ground regions and every asset with its type and parameters; this
// turns each into an SVG fragment in tile px with its bounding box, so the lab
// (or an exporter) can rasterise it at any resolution.
import { tree, pine, bush } from './plants.js';
import { rock } from './rocks.js';
import { dock, house, crate, barrel, stall, fence, rack, flowers } from './built.js';
import { sand, grass, road, frame } from './ground.js';
import { bboxOf } from './util.js';

const GEN = { tree, pine, bush, rock, dock, house, crate, barrel, stall, fence, rack, flowers };
export const KIND = { tree: 'tree', pine: 'tree', bush: 'bush', rock: 'rock', dock: 'dock', house: 'building', crate: 'crate',
  barrel: 'barrel', stall: 'stall', fence: 'fence', rack: 'rack', flowers: 'flower' };

export function renderScene(scene) {
  const proj = scene.proj ?? { au: 20, av: 30 };
  const hexBox = bboxOf(scene.hex, 2);
  const hexD = `M${scene.hex.map((p) => p.join(',')).join('L')}Z`;
  const clip = (id, svg) => `<clipPath id="hx_${id}"><path d="${hexD}"/></clipPath><g clip-path="url(#hx_${id})">${svg}</g>`;
  const planes = [
    { id: 'sand', svg: clip('sand', sand({ rings: scene.land.sand })), box: hexBox },
    { id: 'grass', svg: clip('grass', grass({ rings: scene.land.grass })), box: hexBox },
    { id: 'road', svg: clip('road', road({ rings: scene.land.road })), box: hexBox },
  ];
  const objects = [];
  const stands = [];
  for (const a of scene.assets) {
    const g = GEN[a.type];
    if (!g) { console.warn('no generator for', a.type); continue; }
    const out = g({ ...a, proj });
    if (out.stands) stands.push(...out.stands.map((s) => (s.length === 4 ? s : [s[0], s[1], s[2] * 1.1, s[2] * 0.55])));
    objects.push({ id: a.id, type: a.type, kind: KIND[a.type] ?? 'prop', svg: out.svg, box: out.box, foot: out.foot, z: a.z ?? out.foot[1], wet: !!a.wet || a.type === 'dock' });
  }
  objects.sort((a, b) => a.z - b.z);
  return { planes, objects, stands, hex: scene.hex, frame: frame(scene.hex), land: scene.land, w: scene.w, h: scene.h };
}

export const wrap = (inner, box, scale = 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}" width="${Math.ceil(box[2] * scale)}" height="${Math.ceil(box[3] * scale)}">${inner}</svg>`;

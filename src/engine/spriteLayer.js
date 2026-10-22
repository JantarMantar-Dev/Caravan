// One instanced draw call for every sprite in a layer. Instances are y-sorted
// (painter's order) so premultiplied alpha blending keeps ink edges anti-aliased
// without alpha-test fringes. Per-instance "bounce" drives squash & stretch.
import * as THREE from 'three';

const vert = /* glsl */`
attribute vec3 iPos;      // world x, y, sort key (unused in shader)
attribute vec4 iFrame;    // w, h, ax, ay  (dp)
attribute vec4 iUV;       // u0, v0, u1, v1
attribute vec4 iAnim;     // scale, flipX, bounce phase, bounce amp
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 corner = position.xy;               // (0..1, 0..1), y=0 top
  float sc = iAnim.x;
  float b = iAnim.w * max(0.0, sin(uTime * 9.0 + iAnim.z));
  vec2 squash = vec2(1.0 + b * 0.06, 1.0 - b * 0.05);
  vec2 px = vec2(corner.x * iFrame.x - iFrame.z, corner.y * iFrame.y - iFrame.w); // relative to anchor, y down
  px.x *= iAnim.y;
  px *= squash * sc;
  vec2 world = iPos.xy + vec2(px.x, -px.y) + vec2(0.0, b * 6.0 * sc);
  vUv = vec2(mix(iUV.x, iUV.z, corner.x), 1.0 - mix(iUV.y, iUV.w, corner.y));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
}`;

const frag = /* glsl */`
precision highp float;
uniform sampler2D uAtlas;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uAtlas, vUv); }`;

export function atlasTexture(atlas, renderer) {
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.premultiplyAlpha = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.flipY = true;
  return tex;
}

export class SpriteLayer {
  constructor(atlas, texture, capacity = 4096) {
    this.atlas = atlas; this.capacity = capacity; this.items = [];
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
    this.aPos = mk(3); this.aFrame = mk(4); this.aUV = mk(4); this.aAnim = mk(4);
    [this.aPos, this.aFrame, this.aUV, this.aAnim].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iPos', this.aPos); g.setAttribute('iFrame', this.aFrame); g.setAttribute('iUV', this.aUV); g.setAttribute('iAnim', this.aAnim);
    g.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: { uAtlas: { value: texture }, uTime: { value: 0 } },
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.geometry = g;
  }
  // x,y world (y up). opts: scale, flip, bounce, phase, z (sort bias, + draws later)
  add(name, x, y, opts = {}) {
    const f = this.atlas.frames[name];
    if (!f) { console.warn('missing sprite', name); return null; }
    const it = { name, f, x, y, scale: opts.scale ?? 1, flip: opts.flip ? -1 : 1, bounce: opts.bounce ?? 0, phase: opts.phase ?? 0, z: opts.z ?? 0 };
    this.items.push(it); this.dirty = true; return it;
  }
  clear() { this.items.length = 0; this.dirty = true; }
  commit() {
    if (!this.dirty) return;
    this.dirty = false;
    const items = this.items.slice(0, this.capacity).sort((a, b) => (b.y - b.z) - (a.y - a.z));
    items.forEach((it, i) => {
      const f = it.f;
      this.aPos.setXYZ(i, it.x, it.y, 0);
      this.aFrame.setXYZW(i, f.w, f.h, f.ax, f.ay);
      this.aUV.setXYZW(i, f.u0, f.v0, f.u1, f.v1);
      this.aAnim.setXYZW(i, it.scale, it.flip, it.phase, it.bounce);
    });
    [this.aPos, this.aFrame, this.aUV, this.aAnim].forEach((a) => (a.needsUpdate = true));
    this.geometry.instanceCount = items.length;
  }
  update(time) { this.material.uniforms.uTime.value = time; this.commit(); }
}

// One instanced draw call for every sprite in a layer. Instances are y-sorted
// (painter's order) so premultiplied alpha blending keeps ink edges anti-aliased
// without alpha-test fringes. Per-instance "bounce" drives squash & stretch.
import * as THREE from 'three';
import { HEX_A } from './hex.js';

const vert = /* glsl */`
attribute vec3 iPos;      // world x, y, sort key (unused in shader)
attribute vec4 iFrame;    // w, h, ax, ay  (dp)
attribute vec4 iUV;       // u0, v0, u1, v1
attribute vec4 iAnim;     // scale, flipX, bounce phase, bounce amp
attribute vec2 iClip;     // hex clip: mode (0 none, 1 keep inside, 2 keep outside), cut distance
uniform float uTime;
varying vec2 vUv;
varying vec2 vLocal;      // anchor-relative design px (y down): hex-local for tile art
varying vec2 vClip;
void main() {
  vec2 corner = position.xy;               // (0..1, 0..1), y=0 top
  float sc = iAnim.x;
  float b = iAnim.w * max(0.0, sin(uTime * 9.0 + iAnim.z));
  vec2 squash = vec2(1.0 + b * 0.06, 1.0 - b * 0.05);
  vec2 px = vec2(corner.x * iFrame.x - iFrame.z, corner.y * iFrame.y - iFrame.w); // relative to anchor, y down
  vLocal = px; vClip = iClip;
  px.x *= iAnim.y;
  px *= squash * sc;
  vec2 world = iPos.xy + vec2(px.x, -px.y) + vec2(0.0, b * 6.0 * sc);
  vUv = vec2(mix(iUV.x, iUV.z, corner.x), 1.0 - mix(iUV.y, iUV.w, corner.y));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
}`;

const frag = /* glsl */`
precision highp float;
uniform sampler2D uAtlas;
uniform float uHexA;
uniform float uBicubic;   // 1: Catmull-Rom when a texel covers >= ~1 pixel (painted reference art)
uniform vec2 uTexSize;
varying vec2 vUv;
varying vec2 vLocal;
varying vec2 vClip;

// Keys bicubic (a = -0.75) in 9 bilinear taps. Bilinear softens painted ink
// lines at ~1:1 (review loop 1: half the edge energy lost); Catmull-Rom
// (a = -0.5) got back to 0.78 of the reference's edge energy and a = -0.75 to
// 0.86 (review loop 2) with no visible ringing on flat cel colour.
const float KA = -0.75;
vec4 catmullRom(vec2 uv) {
  vec2 sp = uv * uTexSize;
  vec2 t1 = floor(sp - 0.5) + 0.5;
  vec2 f = sp - t1;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = KA * f3 - 2.0 * KA * f2 + KA * f;
  vec2 w1 = (KA + 2.0) * f3 - (KA + 3.0) * f2 + 1.0;
  vec2 w2 = -(KA + 2.0) * f3 + (2.0 * KA + 3.0) * f2 - KA * f;
  vec2 w3 = -KA * f3 + KA * f2;
  vec2 w12 = w1 + w2;
  vec2 t0 = (t1 - 1.0) / uTexSize, t3 = (t1 + 2.0) / uTexSize, t12 = (t1 + w2 / w12) / uTexSize;
  vec4 r = textureLod(uAtlas, vec2(t0.x, t0.y), 0.0) * w0.x * w0.y
         + textureLod(uAtlas, vec2(t12.x, t0.y), 0.0) * w12.x * w0.y
         + textureLod(uAtlas, vec2(t3.x, t0.y), 0.0) * w3.x * w0.y
         + textureLod(uAtlas, vec2(t0.x, t12.y), 0.0) * w0.x * w12.y
         + textureLod(uAtlas, vec2(t12.x, t12.y), 0.0) * w12.x * w12.y
         + textureLod(uAtlas, vec2(t3.x, t12.y), 0.0) * w3.x * w12.y
         + textureLod(uAtlas, vec2(t0.x, t3.y), 0.0) * w0.x * w3.y
         + textureLod(uAtlas, vec2(t12.x, t3.y), 0.0) * w12.x * w3.y
         + textureLod(uAtlas, vec2(t3.x, t3.y), 0.0) * w3.x * w3.y;
  r = clamp(r, 0.0, 1.0);
  r.rgb = min(r.rgb, vec3(r.a));            // stay a valid premultiplied colour
  return r;
}

void main() {
  vec4 c = texture2D(uAtlas, vUv);           // trilinear: right when minifying
  if (uBicubic > 0.5) {
    vec2 fp = fwidth(vUv * uTexSize);
    if (max(fp.x, fp.y) < 1.15) c = catmullRom(vUv);
  }
  if (vClip.x > 0.5) {
    // tile art layers: one texture, split at the hex boundary. Inside = ground
    // (drawn under every sprite), outside = overhang (drawn over the neighbours).
    // The split is a hard per-pixel step: each pixel goes wholly to one pass, so
    // the halves are exact complements. (A soft split leaks the background by
    // f(1-f) along the cut: review loop 1 found a pale line through palms and
    // bushes that cross the edge.) Edge anti-aliasing lives in the art's alpha.
    vec2 a = abs(vLocal);
    float d = uHexA - max(a.x, a.x * 0.5 + a.y * 0.8660254);
    float inside = step(vClip.y, d);
    c *= vClip.x < 1.5 ? inside : 1.0 - inside;
  }
  gl_FragColor = c;
}`;

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
    this.aPos = mk(3); this.aFrame = mk(4); this.aUV = mk(4); this.aAnim = mk(4); this.aClip = mk(2);
    this.attrs = [this.aPos, this.aFrame, this.aUV, this.aAnim, this.aClip];
    this.attrs.forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iPos', this.aPos); g.setAttribute('iFrame', this.aFrame); g.setAttribute('iUV', this.aUV); g.setAttribute('iAnim', this.aAnim); g.setAttribute('iClip', this.aClip);
    g.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: { uAtlas: { value: texture }, uTime: { value: 0 }, uHexA: { value: HEX_A }, uBicubic: { value: atlas.bicubic ? 1 : 0 }, uTexSize: { value: new THREE.Vector2(atlas.width, atlas.height) } },
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.geometry = g;
  }
  // x,y world (y up). opts: scale, flip, bounce, phase, z (sort bias, + draws later),
  // clip: [mode, cut] hex split for tile art (see fragment shader)
  add(name, x, y, opts = {}) {
    const f = this.atlas.frames[name];
    if (!f) { console.warn('missing sprite', name); return null; }
    const it = { name, f, x, y, scale: opts.scale ?? 1, flip: opts.flip ? -1 : 1, bounce: opts.bounce ?? 0, phase: opts.phase ?? 0, z: opts.z ?? 0, clip: opts.clip ?? [0, 0] };
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
      this.aClip.setXY(i, it.clip[0], it.clip[1]);
    });
    this.attrs.forEach((a) => (a.needsUpdate = true));
    this.geometry.instanceCount = items.length;
  }
  update(time) { this.material.uniforms.uTime.value = time; this.commit(); }
}

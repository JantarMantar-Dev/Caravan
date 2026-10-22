// Ligne-claire hex terrain: one full-coverage fragment shader per map chunk.
// Everything on the ground plane is evaluated analytically per pixel so ink weight
// stays uniform at any zoom: biome cel bands, grass tufts/flowers, organic coastlines
// blended across hex borders, beach + foam, inked roads that meet hex edges at
// right angles (so tiles join seamlessly), town yards, and the hex outline itself.
import * as THREE from 'three';
import { HEX_R, HEX_A, hexToWorld, corners } from './hex.js';

// Colours stay in sRGB end to end (no linear conversion) so shader output matches Canvas2D art exactly.
const hex3 = (h) => { const n = parseInt(h.slice(1), 16); return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
// Biome palettes sampled from the reference sheets: base, shadow band, light band, tuft ink, accent.
export const BIOME_PAL = [
  // Ground k-means of the reference wild tiles (tools/props.py, review loop 2):
  // meadow #a4c82c, autumn #fac030 / #d99316, moor #c5a950 / #dfbc5f + heather
  // #9e648b, jungle #a8c422 / #5b9c17. Bands sit close to base: the reference
  // ground is near-flat colour with fine mottling, not big cel blotches.
  /* meadow */ ['#a4c82c', '#9ac22a', '#acce36', '#6f9c22', '#ffffff'],
  /* autumn */ ['#f8be30', '#f0b12a', '#fbc642', '#c47a14', '#e0601a'],
  /* moor   */ ['#d2b157', '#cbab52', '#dab85d', '#8c7a3a', '#9e648b'],
  /* jungle */ ['#a8c422', '#9fbc20', '#b0ca30', '#5b9c17', '#4f8f18'],
];

const vert = /* glsl */`
varying vec2 vWorld;
void main() {
  vWorld = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */`
precision highp float;
precision highp int;
varying vec2 vWorld;
uniform sampler2D uData0;
uniform sampler2D uData1;
uniform ivec2 uOrigin;
uniform ivec2 uSize;
uniform ivec2 uFocus;
uniform int uFocusOn;
uniform float uTime;
uniform vec3 uPal[20];

const float R = ${HEX_R.toFixed(3)};
const float A = ${HEX_A.toFixed(3)};
const float SQ3 = 1.7320508;
const ivec2 DIRS[6] = ivec2[6](ivec2(1,0), ivec2(1,-1), ivec2(0,-1), ivec2(-1,0), ivec2(-1,1), ivec2(0,1));
const vec3 INK = vec3(0.165, 0.122, 0.102);

// ---------- noise ----------
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p) { float a = h21(p); return vec2(a, h21(p + a + 19.19)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s / 0.875; }

// ---------- hex addressing ----------
ivec2 hexOf(vec2 p) {
  float r = -p.y / (1.5 * R); float q = p.x / (SQ3 * R) - r * 0.5; float s = -q - r;
  float rq = floor(q + 0.5), rr = floor(r + 0.5), rs = floor(s + 0.5);
  float dq = abs(rq - q), dr = abs(rr - r), ds = abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return ivec2(int(rq), int(rr));
}
vec2 centerOf(ivec2 h) { return vec2(R * SQ3 * (float(h.x) + float(h.y) * 0.5), -R * 1.5 * float(h.y)); }
bool inMap(ivec2 h) { ivec2 t = h - uOrigin; return all(greaterThanEqual(t, ivec2(0))) && all(lessThan(t, uSize)); }
vec4 data0(ivec2 h) { return inMap(h) ? texelFetch(uData0, h - uOrigin, 0) : vec4(0.0); }
vec4 data1(ivec2 h) { return inMap(h) ? texelFetch(uData1, h - uOrigin, 0) : vec4(0.5, 0.5, 0.0, 0.0); }
vec2 edgeMid(int i) { float a = float(i) * 1.0471976; return vec2(cos(a), sin(a)) * A; }
float hexEdgeDist(vec2 lp) { // distance from local point to hex boundary, + inside
  float m = -1e9;
  for (int i = 0; i < 6; i++) { float a = float(i) * 1.0471976; m = max(m, dot(lp, vec2(cos(a), sin(a)))); }
  return A - m;
}

// ---------- sdf helpers ----------
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float sdBezier(vec2 pos, vec2 A0, vec2 B0, vec2 C0) { // iq
  vec2 a = B0 - A0, b = A0 - 2.0 * B0 + C0, c = a * 2.0, d = A0 - pos;
  float kk = 1.0 / dot(b, b), kx = kk * dot(a, b), ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0, kz = kk * dot(d, a);
  float res; float p = ky - kx * kx, p3 = p * p * p, q = kx * (2.0 * kx * kx - 3.0 * ky) + kz, h = q * q + 4.0 * p3;
  if (h >= 0.0) { h = sqrt(h); vec2 x = (vec2(h, -h) - q) / 2.0; vec2 uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0)); float t = clamp(uv.x + uv.y - kx, 0.0, 1.0); res = dot(d + (c + b * t) * t, d + (c + b * t) * t); }
  else { float z = sqrt(-p); float v = acos(q / (p * z * 2.0)) / 3.0; float m = cos(v), n = sin(v) * 1.732050808; vec3 t = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
    res = min(dot(d + (c + b * t.x) * t.x, d + (c + b * t.x) * t.x), dot(d + (c + b * t.y) * t.y, d + (c + b * t.y) * t.y)); }
  return sqrt(res);
}
// AA width = one screen pixel in world units. All distances below are world-space sdfs,
// so a single global width keeps edges crisp and avoids fwidth blowups at cell seams.
float PX;
float aaStep(float edge, float d) { return smoothstep(edge - PX, edge + PX, d); }
float inkBand(float d, float halfW) { float hw = max(halfW, PX * 0.6); return 1.0 - smoothstep(hw - PX, hw + PX, abs(d)); }

// ---------- water: blended "waterness" field across neighbours ----------
float waterRaw(vec2 p) {
  ivec2 h = hexOf(p); float ws = 0.0, wt = 0.0;
  for (int i = 0; i < 7; i++) {
    ivec2 hh = i == 6 ? h : h + DIRS[i];
    float d = length(p - centerOf(hh)) / (R * 1.6);
    float k = max(0.0, 1.0 - d * d); k *= k;
    ws += k * data0(hh).b; wt += k;
  }
  return ws / max(wt, 1e-4);
}
float waterField(vec2 p) {
  vec2 w = vec2(fbm(p * 0.004), fbm(p * 0.004 + 17.3)) - 0.5;
  return waterRaw(p + w * R * 0.22) + (vnoise(p * 0.02) - 0.5) * 0.012;
}

// ---------- ground detail ----------
float tuft(vec2 p, float cell, float dens, float seed) {
  vec2 id = floor(p / cell); vec2 r = h22(id + seed);
  if (r.x > dens) return 1e3;
  vec2 c = (id + 0.5) * cell + (r - 0.5) * cell * 0.5;
  vec2 q = p - c; float s = 0.8 + r.y * 0.5;
  float d = sdSeg(q, vec2(0.0), vec2(-3.2, 5.0) * s);
  d = min(d, sdSeg(q, vec2(0.0), vec2(0.0, 6.2) * s));
  d = min(d, sdSeg(q, vec2(0.0), vec2(3.2, 5.0) * s));
  return d;
}
float dots(vec2 p, float cell, float dens, float seed, out vec2 local) {
  vec2 id = floor(p / cell); vec2 r = h22(id + seed);
  local = vec2(1e3);
  if (r.x > dens) return 1e3;
  vec2 c = (id + 0.5) * cell + (h22(id + seed + 3.7) - 0.5) * cell * 0.6;
  local = p - c; return length(local);
}

vec3 groundColor(vec2 p, int b, float seed) {
  vec3 base = uPal[b * 5], dark = uPal[b * 5 + 1], light = uPal[b * 5 + 2], tcol = uPal[b * 5 + 3], acc = uPal[b * 5 + 4];
  float n = fbm(p * 0.011 + seed * 3.1);
  vec3 col = base;
  float nw = fwidth(n) * 0.7;
  col = mix(col, dark, 1.0 - smoothstep(0.37 - nw, 0.37 + nw, n));
  col = mix(col, light, smoothstep(0.66 - nw, 0.66 + nw, n));
  // grass tufts (denser in the shadow bands, like hand-hatched)
  float td = tuft(p, 24.0, n < 0.45 ? 0.30 : 0.13, seed);
  col = mix(col, tcol, inkBand(td, 0.8) * 0.85);
  vec2 l;
  if (b == 0) { // meadow flowers: white petals, yellow eye
    float fd = dots(p, 34.0, 0.10, seed + 9.0, l);
    col = mix(col, vec3(1.0), 1.0 - aaStep(2.6, fd));
    col = mix(col, vec3(1.0, 0.85, 0.25), 1.0 - aaStep(1.0, fd));
  } else if (b == 1) { // autumn leaf litter
    float fd = dots(p, 26.0, 0.16, seed + 4.0, l);
    float e = length(l * vec2(1.0, 1.9));
    col = mix(col, acc, 1.0 - aaStep(3.0, e));
  } else if (b == 2) { // moor: heather speckle
    float fd = dots(p, 15.0, 0.22, seed + 2.0, l);
    col = mix(col, acc, 1.0 - aaStep(1.7, fd));
  } else { // jungle: little leaf ticks
    float fd = dots(p, 22.0, 0.18, seed + 6.0, l);
    float e = length(l * vec2(1.0, 2.2));
    col = mix(col, acc, 1.0 - aaStep(2.6, e));
  }
  return col;
}

void main() {
  vec2 p = vWorld;
  PX = length(fwidth(vWorld)) * 0.5;
  ivec2 h = uFocusOn == 1 ? uFocus : hexOf(p);
  vec2 c = centerOf(h);
  vec2 lp = p - c;
  float edge = hexEdgeDist(lp);
  vec4 D0 = data0(h); vec4 D1 = data1(h);
  // map mode: hexes with seed 0 are absent; edges facing an absent hex get the full outline
  float outer = 1.0;
  if (uFocusOn == 0) {
    if (D0.a == 0.0) discard;
    int ne = 0; float m = -1e9;
    for (int i = 0; i < 6; i++) { float a = float(i) * 1.0471976; float d = dot(lp, vec2(cos(a), sin(a))); if (d > m) { m = d; ne = i; } }
    outer = data0(h + DIRS[ne]).a == 0.0 ? 1.0 : 0.0;
  }
  float cover = uFocusOn == 1 ? aaStep(0.0, edge) : 1.0;
  if (cover <= 0.0) discard;
  int biome = int(D0.r * 255.0 + 0.5);
  float seed = D0.a * 255.0;
  vec3 col = groundColor(p, biome, seed);

  // --- coast ---
  float maxW = D0.b, minW = D0.b;
  for (int i = 0; i < 6; i++) { float w = data0(h + DIRS[i]).b; maxW = max(maxW, w); minW = min(minW, w); }
  if (maxW > 0.0) {
    float sd = 400.0;                               // open sea: skip the field entirely (perf)
    if (minW < 1.0) {
      float f = waterField(p);
      float fx = waterField(p + vec2(2.0, 0.0)), fy = waterField(p + vec2(0.0, 2.0));
      float g = length(vec2(fx - f, fy - f)) / 2.0;
      sd = clamp((f - 0.5) / max(g, 1e-5), -400.0, 400.0); // world-distance to shoreline, + in water
    }
    // beach: sand band with a scalloped grass edge
    float sandW = 30.0 + (vnoise(p * 0.03) - 0.5) * 16.0;
    float sandMask = aaStep(-sandW, sd);
    vec3 sand = vec3(0.96, 0.875, 0.635);   // ref #f5dfa2
    float speck; vec2 l; speck = dots(p, 9.0, 0.35, 5.0, l);
    sand = mix(sand, vec3(0.83, 0.74, 0.52), 1.0 - aaStep(1.0, speck));
    col = mix(col, uPal[biome * 5 + 1] * 0.92, inkBand(sd + sandW + 1.5, 1.6) * 0.8); // darker grass lip
    col = mix(col, sand, sandMask);
    col = mix(col, vec3(0.82, 0.74, 0.52), aaStep(-7.0, sd) * (1.0 - aaStep(0.0, sd)) * 0.6); // wet sand
    // water
    float wm = aaStep(0.0, sd);
    vec3 deep = vec3(0.02, 0.72, 0.92), shallow = vec3(0.16, 0.80, 0.95); // ref #06c2ed
    vec3 wcol = mix(shallow, deep, smoothstep(10.0, 46.0, sd));
    // foam lines that breathe along the shore
    float t = uTime;
    float f1 = inkBand(sd - 6.0 - sin(t * 1.3 + p.x * 0.01) * 1.5, 1.8);
    float br = smoothstep(0.4, 0.5, vnoise(p * 0.018 + vec2(t * 0.12, 0.0)));
    float f2 = inkBand(sd - 18.0 - sin(t * 1.1 + 1.7 + p.y * 0.012) * 2.5, 1.4) * br;
    wcol = mix(wcol, vec3(1.0), max(f1, f2));
    // open-water wave ticks
    vec2 wl; float wd = dots(p + vec2(t * 3.0, 0.0), 52.0, 0.30, 11.0, wl);
    vec2 q = wl - vec2(0.0, -9.0);
    float arc = max(abs(length(q) - 9.0), (atan(abs(q.x), q.y) - 0.75) * 9.0);
    wcol = mix(wcol, vec3(0.88, 0.97, 1.0), (1.0 - aaStep(1.1, arc)) * aaStep(30.0, sd) * 0.95);
    col = mix(col, wcol, wm);
    col = mix(col, vec3(0.13, 0.22, 0.32), inkBand(sd, 0.9)); // shoreline ink
  }

  // --- roads + town yard (one merged sdf so junctions read cleanly) ---
  int mask = int(D0.g * 255.0 + 0.5);
  float rd = 1e5;
  if (mask != 0) {
    int n = 0, i0 = -1, i1 = -1;
    for (int i = 0; i < 6; i++) if ((mask & (1 << i)) != 0) { n++; if (i0 < 0) i0 = i; else if (i1 < 0) i1 = i; }
    if (n == 2 && (i1 - i0) != 3) rd = sdBezier(lp, edgeMid(i0), vec2(0.0), edgeMid(i1));
    else for (int i = 0; i < 6; i++) if ((mask & (1 << i)) != 0) rd = min(rd, sdSeg(lp, vec2(0.0), edgeMid(i) * 1.02));
    rd += (vnoise(p * 0.045) - 0.5) * 3.0;
    rd -= 27.0;                                   // ref roads ~55 units wide
  }
  int ptype = int(D1.a * 255.0 + 0.5);
  float pd = 1e5;
  if (ptype != 0) {
    vec2 po = (D1.rg * 255.0 - 128.0) / 128.0 * R;
    float pr = D1.b * R;
    vec2 q = lp - po;
    pd = length(q * vec2(1.0, 1.25)) - pr + (fbm(p * 0.02) - 0.5) * pr * 0.35;
  }
  if (ptype == 2) { // jungle red earth: inkless, rimmed
    vec3 earth = vec3(0.70, 0.33, 0.18);
    vec2 l; float fl = dots(p, 10.0, 0.5, 3.0, l);
    earth = mix(earth, vec3(0.55, 0.24, 0.12), 1.0 - aaStep(1.4, fl));
    col = mix(col, earth, 1.0 - aaStep(0.0, pd));
    col = mix(col, vec3(0.52, 0.25, 0.12), inkBand(pd + 2.0, 1.6));
    pd = 1e5;
  }
  float sd2 = (ptype == 1 || ptype == 3) ? smin(rd, pd, 24.0) : rd;
  if (sd2 < 40.0) {
    // reference roads (wool_1 sample): cream #feedc2, a warm shaded band
    // #fbd38a inside the edge, a soft olive lip instead of a hard ink line
    vec3 road = vec3(0.996, 0.93, 0.76);
    vec2 l; float pb = dots(p, 11.0, 0.18, 8.0, l);
    road = mix(road, vec3(0.93, 0.83, 0.62), (1.0 - aaStep(1.1, pb)) * 0.7);
    road = mix(road, vec3(0.984, 0.827, 0.54), aaStep(-6.0, sd2));
    col = mix(col, col * 0.86, (1.0 - aaStep(5.0, sd2)) * aaStep(0.0, sd2)); // grass shadow lip
    col = mix(col, road, 1.0 - aaStep(0.0, sd2));
    col = mix(col, vec3(0.50, 0.48, 0.20), inkBand(sd2, 1.0) * 0.75);
  }

  // --- hex outline ---
  if (uFocusOn == 1) col = mix(col, INK, 1.0 - aaStep(2.6, edge));
  else col = mix(col, INK, (1.0 - aaStep(outer > 0.5 ? 2.6 : 1.1, edge)) * (outer > 0.5 ? 1.0 : 0.3));

  gl_FragColor = vec4(col * cover, cover);
}`;

export class TerrainChunk {
  // map: HexMap. focus: [q,r] to render a single isolated tile (preview), or null for a full map.
  constructor(map, { focus = null } = {}) {
    this.map = map;
    const mk = (data) => {
      const t = new THREE.DataTexture(data, map.w, map.h, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
    };
    this.t0 = mk(map.d0); this.t1 = mk(map.d1);
    const pal = BIOME_PAL.flat().map(hex3);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: {
        uData0: { value: this.t0 }, uData1: { value: this.t1 },
        uOrigin: { value: new THREE.Vector2(map.q0, map.r0) }, uSize: { value: new THREE.Vector2(map.w, map.h) },
        uFocus: { value: new THREE.Vector2(...(focus ?? [0, 0])) }, uFocusOn: { value: focus ? 1 : 0 },
        uTime: { value: 0 }, uPal: { value: pal },
      },
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    let geo;
    if (focus) {
      const [cx, cy] = hexToWorld(focus[0], focus[1]);
      geo = new THREE.PlaneGeometry(HEX_R * 2.0, HEX_R * 2.2); geo.translate(cx, cy, 0);
    } else {
      const xs = [], ys = [];
      for (let r = map.r0; r < map.r0 + map.h; r++) for (let q = map.q0; q < map.q0 + map.w; q++) { const [x, y] = hexToWorld(q, r); xs.push(x); ys.push(y); }
      const x0 = Math.min(...xs) - HEX_R, x1 = Math.max(...xs) + HEX_R, y0 = Math.min(...ys) - HEX_R, y1 = Math.max(...ys) + HEX_R;
      geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0); geo.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    }
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }
  update(time) {
    this.material.uniforms.uTime.value = time;
  }
  refresh() { this.t0.needsUpdate = true; this.t1.needsUpdate = true; }
}

export function hexOutlinePoints(scale = 1) { return corners(scale); }

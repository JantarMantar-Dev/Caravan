// Live water for generated tiles. The water is not painted: the shader draws
// it from a distance field around the land, so it can move.
//
//   field  R: signed distance to the shoreline (+ water, - land), tile px
//          G: distance to anything standing in the water (rocks, piles)
//          B: the shore distance heavily smoothed, for the swell crests
//   look   flat cyan with one hard-edged shallow band and a few short
//          strokes in open water: no gradients, no glints
//   waves  a bold broken surf band along the coast, a thin arc rolling in
//          behind it, a flat swash sheet on the sand inside a hard-edged
//          wet band
//   rocks  small arcs on the side facing the viewer only
import * as THREE from 'three';

export const SWELL_PERIOD = 4.2, RING_PERIOD = 2.6;
const FS = 2;                     // field px per tile px

// squared-distance transform, 1D (Felzenszwalb & Huttenlocher)
function edt1(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while ((s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])) <= z[k]) k--;
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
}
// distance (px) from every cell to the nearest cell where mask is true
function edt(mask, W, H) {
  const INF = 1e12, g = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = mask[i] ? 0 : INF;
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x];
    edt1(f, H, d, v, z);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x];
    edt1(f, W, d, v, z);
    for (let x = 0; x < W; x++) g[y * W + x] = Math.sqrt(d[x]);
  }
  return g;
}

// separable box blur, repeated (close to a gaussian)
function blur(src, W, H, r, passes) {
  let a = Float32Array.from(src), b = new Float32Array(W * H);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) {
      let acc = 0;
      const row = y * W;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        b[row + x] = acc / (2 * r + 1);
        acc += a[row + Math.min(W - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        a[y * W + x] = acc / (2 * r + 1);
        acc += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x];
      }
    }
  }
  return a;
}

// land: rings of the land outline (tile px); stands: [x, y, rx, ry] ellipses
export function waterField(w, h, land, stands) {
  const W = Math.ceil(w * FS), H = Math.ceil(h * FS);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.scale(FS, FS);
  g.fillStyle = '#f00';
  g.beginPath();
  for (const r of land) { g.moveTo(r[0][0], r[0][1]); for (const p of r.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); }
  g.fill('evenodd');
  g.fillStyle = '#0f0';
  for (const [x, y, rx, ry] of stands) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  const px = g.getImageData(0, 0, W, H).data;
  const isLand = new Uint8Array(W * H), isWater = new Uint8Array(W * H), isStand = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4], gg = px[i * 4 + 1];
    isLand[i] = r > 127 ? 1 : 0; isWater[i] = 1 - isLand[i]; isStand[i] = gg > 127 ? 1 : 0;
  }
  const toLand = edt(isLand, W, H), toWater = edt(isWater, W, H), toStand = edt(isStand, W, H);
  // signed distance, lightly smoothed so wave lines follow the shore without
  // stair steps, stored as half floats (8 bits are too coarse for thin foam)
  let sd = new Float32Array(W * H);
  let water = 0;
  for (let i = 0; i < W * H; i++) { sd[i] = (isLand[i] ? -toWater[i] + 0.5 : toLand[i] - 0.5) / FS; water += isWater[i]; }
  for (let pass = 0; pass < 2; pass++) {
    const o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let acc = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < W && Y < H) { acc += sd[Y * W + X]; n++; }
      }
      o[y * W + x] = acc / n;
    }
    sd = o;
  }
  // a much smoother copy for the swell crests, so they round off the corners
  // of the coastline the way real wave fronts do
  const soft = blur(sd, W, H, 7 * FS, 3);
  const H16 = THREE.DataUtils.toHalfFloat;
  const data = new Uint16Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = H16(sd[i]);
    data[i * 4 + 1] = H16(Math.min(200, toStand[i] / FS));
    data[i * 4 + 2] = H16(soft[i]);
    data[i * 4 + 3] = H16(1);
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.flipY = false;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  // CPU side: is (x, y) water? for splashes and the ambient mix
  const wetAt = (x, y) => {
    const X = Math.round(x * FS), Y = Math.round(y * FS);
    if (X < 0 || Y < 0 || X >= W || Y >= H) return 1;
    return isWater[Y * W + X];
  };
  return { tex, wetAt, share: water / (W * H) };
}

const BLEND = {
  transparent: true, depthTest: false, depthWrite: false,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
};

// geometry: the hex in tile px relative to (ox, oy), y up
export function waterMesh(hex, ox, oy, field, w, h) {
  const shape = new THREE.Shape(hex.map(([x, y]) => new THREE.Vector2(x - ox, -(y - oy))));
  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.ShaderMaterial({
    ...BLEND,
    uniforms: {
      uField: { value: field }, uTime: { value: 0 }, uOpacity: { value: 1 }, uDim: { value: 0 }, uFlash: { value: 0 }, uLive: { value: 1 },
      uTile: { value: new THREE.Vector4(ox, oy, w, h) },
    },
    extensions: { derivatives: true },
    vertexShader: /* glsl */`
      uniform vec4 uTile;
      varying vec2 vPx;
      void main() {
        vPx = vec2(position.x + uTile.x, -position.y + uTile.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uField;
      uniform float uTime, uOpacity, uDim, uFlash, uLive;
      uniform vec4 uTile;
      varying vec2 vPx;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      // value noise on two rotated lattices: no axis-aligned blocks when thresholded
      float snoise(vec2 p) {
        vec2 a = mat2(0.8, -0.6, 0.6, 0.8) * p, b = mat2(0.28, 0.96, -0.96, 0.28) * p * 1.73 + 17.0;
        return 0.6 * noise(a) + 0.4 * noise(b);
      }
      // anti-aliased band of half-width w around d = 0
      float band(float d, float w) { float aa = fwidth(d) * 0.75 + 0.02; return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
      float ease(float x) { return x * x * (3.0 - 2.0 * x); }

      const vec3 BASE = vec3(0.12, 0.68, 0.90);
      const vec3 SHALLOW = vec3(0.38, 0.83, 0.95);
      const vec3 FOAM = vec3(0.98, 1.0, 1.0);
      const vec3 FILM = vec3(0.60, 0.89, 0.96);
      // a hard-edged band: 1 inside |d| < w, crisp anti-aliased edge
      float hard(float d, float w) { float aa = fwidth(d) * 0.6 + 0.01; return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
      float cut(float x, float e) { float aa = fwidth(x) * 0.6 + 0.005; return smoothstep(e - aa, e + aa, x); }

      void main() {
        vec2 px = vPx;
        vec4 F = texture2D(uField, px / uTile.zw);
        float sd = F.r;                           // + water, - land, tile px
        float ds = F.g;
        float sw = max(F.b, sd);
        float t = uTime * uLive;
        // slow wobble along the coast so bands are authored, not ruler-straight
        float wob = snoise(px * 0.03) - 0.5;

        // ---- open water: one flat cyan, one hard-edged shallow band
        vec3 col = mix(SHALLOW, BASE, cut(sd, 9.0 + 6.0 * wob));

        // a few open-water strokes: short flat dashes that come and go
        vec2 cs = vec2(46.0, 26.0);
        vec2 cell = floor((px + vec2(t * 1.5, 0.0)) / cs);
        float h = hash(cell);
        vec2 c0 = (cell + vec2(0.2 + 0.6 * hash(cell + 3.1), 0.3 + 0.4 * hash(cell + 7.7))) * cs - vec2(t * 1.5, 0.0);
        vec2 dq = px - c0;
        float len = 5.0 + 6.0 * hash(cell + 1.7);
        float life = sin(t * 0.5 + h * 30.0);
        float stroke = hard(dq.y + dq.x * dq.x * 0.03, 0.55) * (1.0 - cut(abs(dq.x), len * smoothstep(0.0, 1.0, life)));
        stroke *= step(0.62, h) * cut(sd, 16.0) * cut(ds, 9.0);
        col = mix(col, vec3(0.70, 0.93, 0.99), stroke);

        float foam = 0.0, film = 0.0;
        // ---- surf: a bold broken white band hugging the coast, its gaps
        //      shifting slowly; a thinner arc rolling in behind it
        float brk = snoise(vec2(px.x * 0.05 + px.y * 0.02, px.y * 0.05) + vec2(t * 0.08, -t * 0.05));
        float swell = fract(t / ${SWELL_PERIOD.toFixed(2)});
        float pulse = 0.5 + 0.5 * sin(swell * 6.2832);
        foam = max(foam, hard(sd - 3.2, 2.8 + 0.9 * pulse) * cut(brk, 0.26));
        float arc = mix(15.0, 4.0, swell);
        foam = max(foam, hard(sw - arc, 0.7 + 0.5 * swell) * cut(brk + 0.25 * wob, 0.45) * (1.0 - smoothstep(0.75, 1.0, swell)) * smoothstep(0.0, 0.15, swell));

        // ---- swash: a flat sheet slides up the sand and drains back
        float s = fract(t / ${SWELL_PERIOD.toFixed(2)} + 0.15);
        float up = s < 0.35 ? 1.0 - pow(1.0 - s / 0.35, 2.0) : 1.0 - ease((s - 0.35) / 0.65);
        float reach = 5.0 + 3.0 * wob;
        float x = -sd;                                     // distance up the beach
        float front = mix(-1.0, reach, up);
        float sheet = (1.0 - cut(x, front)) * cut(x, -1.0);
        film = sheet * 0.75;
        foam = max(foam, hard(x - front + 0.6, 0.65) * cut(x, -0.5) * (s < 0.35 ? 1.0 : 0.8 * (1.0 - s)) * cut(brk, 0.3));
        // the wet sand: a hard boundary a little beyond the furthest reach
        float wet = 1.0 - cut(x, reach + 1.6);

        // ---- rocks and posts: small arcs on the side facing the viewer
        if (sd > -1.0 && ds > 0.05 && ds < 14.0) {
          vec2 e = vec2(1.0, 0.0) / uTile.zw;
          float gy = texture2D(uField, px / uTile.zw + e.yx).g - texture2D(uField, px / uTile.zw - e.yx).g;
          float gx = texture2D(uField, px / uTile.zw + e).g - texture2D(uField, px / uTile.zw - e).g;
          vec2 g = normalize(vec2(gx, gy) + 1e-5);
          float front = smoothstep(-0.1, 0.5, g.y + 0.25 * g.x);    // down and a little right
          foam = max(foam, hard(ds - 0.9, 0.85) * front * cut(snoise(px * 0.3 + vec2(t * 0.4, 0.0)), 0.3));
          float rp = fract(t / ${RING_PERIOD.toFixed(2)});
          float r = 2.5 + 6.0 * rp;
          foam = max(foam, hard(ds - r, 0.5) * front * smoothstep(0.6, 1.0, g.y) * (1.0 - rp) * step(0.1, rp));
        }

        vec4 outc;
        if (sd >= 0.0) {
          col = mix(col, FOAM, clamp(foam, 0.0, 1.0));
          outc = vec4(col, 1.0);
        } else {
          // on the sand: only the sheet, its foam and the wet patch
          float a = clamp(film, 0.0, 1.0);
          vec3 c = FILM * a;
          float wa = clamp(wet, 0.0, 1.0) * 0.26 * (1.0 - a);
          c += vec3(0.42, 0.30, 0.12) * wa;
          a += wa;
          float fa = clamp(foam, 0.0, 1.0);
          c = c * (1.0 - fa) + FOAM * fa;
          a = a * (1.0 - fa) + fa;
          outc = vec4(c, a);
        }
        outc.rgb = mix(outc.rgb, vec3(outc.a), uDim * 0.72);
        outc.rgb = mix(outc.rgb, vec3(outc.a), uFlash);
        gl_FragColor = outc * uOpacity;
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

// The pixel-art version of the same water: the field is sampled at the
// centre of each art pixel (cell tile px), colours come from a small palette
// and time advances in steps, so the motion reads as frame animation.
export function pixelWaterMesh(hex, ox, oy, field, w, h, cell) {
  const shape = new THREE.Shape(hex.map(([x, y]) => new THREE.Vector2(x - ox, -(y - oy))));
  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.ShaderMaterial({
    ...BLEND,
    uniforms: {
      uField: { value: field }, uTime: { value: 0 }, uOpacity: { value: 1 }, uDim: { value: 0 }, uFlash: { value: 0 }, uLive: { value: 1 },
      uTile: { value: new THREE.Vector4(ox, oy, w, h) }, uCell: { value: cell },
      uHex: { value: hex.map(([x, y]) => new THREE.Vector2(x, y)) },
    },
    vertexShader: /* glsl */`
      uniform vec4 uTile;
      varying vec2 vPx;
      void main() {
        vPx = vec2(position.x + uTile.x, -position.y + uTile.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uField;
      uniform float uTime, uOpacity, uDim, uFlash, uLive, uCell;
      uniform vec2 uHex[6];
      uniform vec4 uTile;
      varying vec2 vPx;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      const vec3 DEEP = vec3(0.07, 0.48, 0.82);
      const vec3 WATER = vec3(0.11, 0.62, 0.90);
      const vec3 SHALLOW = vec3(0.30, 0.77, 0.95);
      const vec3 LIGHT = vec3(0.62, 0.89, 0.99);
      const vec3 FOAM = vec3(0.93, 0.98, 1.0);
      const vec3 WET = vec3(0.70, 0.58, 0.38);
      const vec3 FILM_P = vec3(0.55, 0.77, 0.93);
      void main() {
        vec2 c = floor(vPx / uCell);
        vec2 px = (c + 0.5) * uCell;
        // whole art pixels only: a cell whose centre is outside the hex is not
        // drawn, matching the ground planes, so no slivers show past the frame
        float side = 0.0, edge = 1e9;
        for (int k = 0; k < 6; k++) {
          vec2 a = uHex[k], b = uHex[k == 5 ? 0 : k + 1];
          float cr = (b.x - a.x) * (px.y - a.y) - (b.y - a.y) * (px.x - a.x);
          if (k == 0) side = sign(cr);
          else if (sign(cr) != side && cr != 0.0) discard;
          edge = min(edge, abs(cr) / length(b - a));
        }
        vec4 F = texture2D(uField, px / uTile.zw);
        float sd = F.r / uCell, ds = F.g / uCell;      // in art pixels
        // land traced from the art stops a hair short of the hex edge: that is
        // not water, so leave those cells to the ground planes
        if (edge < uCell * 2.0 && sd < 2.5 && sd > -0.5) discard;
        float t = floor(uTime * uLive * 6.0) / 6.0;      // 6 frames a second
        float sw = fract(t / ${SWELL_PERIOD.toFixed(2)});
        vec3 col = WATER;
        float a = 1.0;
        // breaks in the foam come in short runs along the coast, not single pixels
        float run = hash(floor(c / vec2(4.0, 3.0)) + floor(t / 1.5) * 3.1);
        float reach = sw < 0.5 ? sw * 2.0 : 2.0 - sw * 2.0;
        if (sd >= 0.0) {
          // depth bands, each edge broken by a checker dither row
          bool ck = mod(c.x + c.y, 2.0) == 0.0;
          if (sd > 16.0 || (sd > 14.0 && ck)) col = DEEP;
          if (sd < 4.0 || (sd < 5.0 && ck)) col = SHALLOW;
          // a pale ring round rocks and posts where the water lifts
          if (ds > 0.01 && (ds < 2.5 || (ds < 3.5 && ck))) col = LIGHT;
          // shore foam: a one-pixel line, two when the swell is up, in runs
          if (sd < 1.0 && run > 0.2) col = FOAM;
          else if (sd < 2.0 && reach > 0.55 && run > 0.45) col = FOAM;
          // a light line rolling in towards the beach, also in runs
          float arc = floor(mix(7.0, 2.0, sw));
          if (floor(sd) == arc && sd > 3.0 && hash(floor(c / vec2(6.0, 4.0)) + 7.0) > 0.62) col = LIGHT;
          // open water: short dashes, a long and a short one, drifting slowly
          float drift = floor(t / 0.7);
          vec2 g = c + vec2(drift, 0.0);
          vec2 cell = floor(g / vec2(11.0, 6.0));
          float hh = hash(cell);
          vec2 o = g - cell * vec2(11.0, 6.0);
          float on = step(0.0, sin(t * 0.9 + hh * 40.0));
          bool d1 = o.y == 2.0 && o.x >= 3.0 && o.x <= 5.0;
          bool d2 = o.y == 3.0 && o.x >= 7.0 && o.x <= 8.0;
          if (sd > 6.0 && ds > 3.0 && hh > 0.6 && on > 0.5 && (d1 || d2)) col = LIGHT;
          // rocks and posts: foam pixels on the side facing the viewer
          if (ds > 0.01 && ds < 1.2 && run > 0.25) {
            vec2 e = vec2(uCell, 0.0) / uTile.zw;
            float gy = texture2D(uField, px / uTile.zw + e.yx).g - texture2D(uField, px / uTile.zw - e.yx).g;
            if (gy > -0.2) col = FOAM;
          }
        } else {
          // the beach: the swash slides up as one band, then a damp row
          float up = sw < 0.4 ? sw / 0.4 : 1.0 - (sw - 0.4) / 0.6;
          float x = -sd;
          if (x < floor(up * 2.5) && up > 0.25) { col = x < floor(up * 2.5) - 1.0 ? FILM_P : FOAM; a = 1.0; }
          else if (x < 2.0) { col = WET; a = 0.4; }
          else a = 0.0;
        }
        vec4 outc = vec4(col * a, a);
        outc.rgb = mix(outc.rgb, vec3(outc.a), uDim * 0.72);
        outc.rgb = mix(outc.rgb, vec3(outc.a), uFlash);
        gl_FragColor = outc * uOpacity;
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

// Live water for generated tiles. The water is not painted: the shader draws
// it from a distance field around the land, so it can move.
//
//   field  R: signed distance to the shoreline (+ water, - land), tile px
//          G: distance to anything standing in the water (rocks, piles)
//          B: the shore distance heavily smoothed, for the swell crests
//   look   depth colour (turquoise shallows to deep blue), drifting ripple
//          strokes, glints
//   waves  swell lines roll in following the shore, steepen, break into a
//          foam lip and the swash slides up the sand, then drains back
//          leaving wet sand that dries; a smaller second wave between
//   rocks  a foam collar, rings spreading out, and a splash as a swell passes
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

      const vec3 DEEP = vec3(0.035, 0.50, 0.82);
      const vec3 MID = vec3(0.07, 0.66, 0.91);
      const vec3 SHALLOW = vec3(0.33, 0.82, 0.94);
      const vec3 FOAM = vec3(0.97, 0.995, 1.0);
      const vec3 FILM = vec3(0.62, 0.90, 0.96);

      void main() {
        vec2 px = vPx;
        vec4 F = texture2D(uField, px / uTile.zw);
        float sd = F.r;                           // + water, - land, tile px
        float ds = F.g;
        float sw = max(F.b, sd);                  // swell distance: smooth offshore, exact at the beach
        float t = uTime * uLive;

        // ---- open water
        vec3 col = mix(SHALLOW, MID, smoothstep(1.0, 20.0, sd));
        col = mix(col, DEEP, smoothstep(24.0, 85.0, sd));
        // slow light/dark drift so the surface is never static
        float drift = snoise(px * vec2(0.018, 0.03) + vec2(t * 0.05, -t * 0.03));
        col *= 0.95 + 0.1 * drift;
        // ripple strokes: short light dashes drifting along
        float n = snoise(px * vec2(0.03, 0.05) + vec2(t * 0.06, t * 0.02));
        float rip = band(fract(px.y * 0.09 + n * 3.0 + t * 0.12) - 0.5, 0.045);
        rip *= smoothstep(0.55, 0.75, snoise(px * vec2(0.09, 0.2) + vec2(-t * 0.25, 0.0)));
        rip *= smoothstep(4.0, 14.0, sd) * smoothstep(3.0, 9.0, ds);
        col = mix(col, vec3(0.62, 0.89, 0.98), rip * 0.55);

        float foam = 0.0, film = 0.0, wet = 0.0;
        // ---- swell: two waves per period, the second smaller
        for (int k = 0; k < 2; k++) {
          float kk = float(k);
          float p = fract(t / ${SWELL_PERIOD.toFixed(2)} + kk * 0.5);
          float size = kk < 0.5 ? 1.0 : 0.62;
          float reach = (6.0 + 7.0 * snoise(px * 0.035 + kk * 9.1)) * size;   // run-up, varies along the beach
          if (p < 0.62) {
            // approaching: a crest following the shore contour
            float q = p / 0.62;
            float c = 64.0 * pow(1.0 - q, 1.25);
            float ahead = mix(sd, sw, smoothstep(2.0, 14.0, c)) - c;                      // < 0 shoreward of the crest
            float body = smoothstep(-10.0, 0.0, ahead) * (1.0 - smoothstep(0.0, 0.6, ahead));
            col = mix(col, vec3(0.55, 0.88, 0.98), body * (0.12 + 0.18 * q) * size * step(0.0, sd));
            float dash = smoothstep(0.35, 0.62, snoise(vec2(px.x * 0.06 + kk * 7.0, px.y * 0.1) + vec2(t * 0.1, 0.0)) + q * 0.35);
            foam = max(foam, band(ahead, 0.55 + 1.4 * q * q) * dash * smoothstep(0.25, 0.75, q) * step(0.0, sd) * size);
            // breaking: a white burst along the waterline just before the swash
            foam = max(foam, smoothstep(0.82, 1.0, q) * band(sd - 1.2, 1.6) * smoothstep(0.25, 0.55, 0.6 * snoise(px * 0.25 + t) + 0.4 * snoise(px * 0.45 - t)) * size);
          } else {
            // swash: the sheet slides up the sand, then drains back
            float s = (p - 0.62) / 0.38;
            float up = s < 0.32 ? 1.0 - pow(1.0 - s / 0.32, 2.2) : 1.0 - ease((s - 0.32) / 0.68);
            float front = mix(-1.5, reach, up);
            float x = -sd;                               // distance up the beach
            float sheet = smoothstep(front + 0.6, front - 0.6, x) * step(-2.0, x);
            film = max(film, sheet * mix(0.85, 0.45, smoothstep(0.0, max(front, 0.1), x)));
            float lace = smoothstep(0.35, 0.65, 0.65 * snoise(px * vec2(0.3, 0.45) + vec2(kk * 3.0, t * 0.6)) + 0.35 * snoise(px * 0.45 - t * 0.4));
            float lipW = s < 0.32 ? 1.25 : 0.7;
            foam = max(foam, band(x - front + lipW * 0.6, lipW) * (s < 0.32 ? 1.0 : 0.65 * (1.0 - s)) * (0.55 + 0.45 * lace) * step(-1.0, x));
            // bubbles left behind the lip
            vec2 bc = floor(px / 2.2), bf = fract(px / 2.2) - 0.5;
            float bub = step(0.8, hash(bc + kk * 5.0)) * (1.0 - smoothstep(0.18, 0.3, length(bf)));
            foam = max(foam, bub * smoothstep(front - 4.0, front - 1.2, x) * sheet * 0.8);
            // wet sand where the sheet has been, drying as it drains
            wet = max(wet, smoothstep(reach + 0.8, reach - 0.8, x) * step(0.0, x) * (s < 0.32 ? s / 0.32 : 1.0 - (s - 0.32) / 0.68) * size);
          }
        }
        wet = max(wet, smoothstep(3.0, 0.0, -sd) * 0.55);                   // the waterline is always damp

        // ---- rocks and piles: collar, rings, splash when a swell passes
        if (sd > -1.0 && ds > 0.05) {
          float collar = band(ds - 1.1, 1.1) * smoothstep(0.25, 0.55, snoise(px * 0.35 + vec2(t * 0.8, 0.0)));
          foam = max(foam, collar * 0.95);
          for (int k = 0; k < 2; k++) {
            float p = fract(t / ${RING_PERIOD.toFixed(2)} + float(k) * 0.5);
            float r = 1.5 + 13.0 * p;
            float dash = smoothstep(0.3, 0.55, snoise(px * 0.18 + float(k) * 13.0));
            foam = max(foam, band(ds - r, 0.55 + 0.3 * (1.0 - p)) * dash * (1.0 - p) * step(ds, 24.0) * 0.9);
          }
          float pw = fract(t / ${SWELL_PERIOD.toFixed(2)});
          float c = 64.0 * pow(1.0 - min(pw / 0.62, 1.0), 1.25);
          float hit = exp(-pow((sd - c) / 7.0, 2.0)) * step(pw, 0.62);
          foam = max(foam, band(ds - 2.0, 1.2 + 2.6 * hit) * hit * smoothstep(0.25, 0.5, snoise(px * 0.4 - t)));
        }
        // ---- glints in deep water
        vec2 cell = floor(px / 26.0);
        float h = hash(cell);
        vec2 gc = (cell + 0.25 + 0.5 * vec2(hash(cell + 3.1), hash(cell + 7.7))) * 26.0;
        float tw = smoothstep(0.85, 1.0, sin(t * (0.9 + h) + h * 40.0));
        vec2 q = abs(px - gc);
        float glint = (1.0 - smoothstep(0.3, 1.0, q.y)) * (1.0 - smoothstep(1.0, 4.0, q.x)) + (1.0 - smoothstep(0.3, 0.9, q.x)) * (1.0 - smoothstep(0.6, 2.0, q.y));
        foam = max(foam, glint * tw * step(0.6, h) * smoothstep(18.0, 30.0, sd) * smoothstep(10.0, 18.0, ds));

        vec4 outc;
        if (sd >= 0.0) {
          col = mix(col, FOAM, clamp(foam, 0.0, 1.0));
          outc = vec4(col, 1.0);
        } else {
          // on the sand: only the sheet, its foam and the wet patch
          float a = clamp(film, 0.0, 1.0);
          vec3 c = FILM * a;
          float wa = clamp(wet, 0.0, 1.0) * 0.32 * (1.0 - a);
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

// Materials for the asset lab. Everything is premultiplied alpha with the
// art's sRGB values passed straight through (no colour management), matching
// the preview's sprite layer.
import * as THREE from 'three';

const BLEND = {
  transparent: true, depthTest: false, depthWrite: false,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
};

export function loadTexture(url, renderer) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const t = new THREE.Texture(im);
      t.colorSpace = THREE.NoColorSpace;
      t.premultiplyAlpha = true;
      t.flipY = false;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      t.needsUpdate = true;
      res(t);
    };
    im.onerror = rej;
    im.src = url;
  });
}

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = vec2(uv.x, 1.0 - uv.y);          // image rows top to bottom
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// One layer: texture * opacity, with a dim (other layers faded while one is
// inspected) and a flash (white pulse when an asset lands).
export function layerMaterial(tex) {
  return new THREE.ShaderMaterial({
    ...BLEND,
    uniforms: { uTex: { value: tex }, uOpacity: { value: 1 }, uDim: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uOpacity, uDim, uFlash;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(uTex, vUv);
        // dim towards paper white, keeping alpha
        c.rgb = mix(c.rgb, vec3(c.a), uDim * 0.72);
        c.rgb = mix(c.rgb, vec3(c.a), uFlash);
        gl_FragColor = c * uOpacity;
      }`,
  });
}

// The water plane, alive. The field texture (tools/layers.py) holds the
// distance to the shore (R), to things standing in the water (G) and the water
// mask (B), 64 px range. On top of the reference water:
//   - a slow ripple that wobbles the painted foam lines
//   - shore waves: two dashed foam lines rolling in to the sand, period 3.6 s
//   - rings spreading from rocks and posts, period 2.6 s
//   - glints in open water
// All crisp white strokes like the reference foam; no blur, no gradients.
export const WAVE_PERIOD = 3.6, RING_PERIOD = 2.6;

export function waterMaterial(tex, field, rect, tile) {
  return new THREE.ShaderMaterial({
    ...BLEND,
    uniforms: {
      uTex: { value: tex }, uField: { value: field }, uTime: { value: 0 },
      uOpacity: { value: 1 }, uDim: { value: 0 }, uFlash: { value: 0 }, uLive: { value: 1 },
      uRect: { value: new THREE.Vector4(rect.x, rect.y, rect.w, rect.h) },
      uTile: { value: new THREE.Vector4(tile.ox, tile.oy, tile.w, tile.h) },
    },
    extensions: { derivatives: true },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex, uField;
      uniform float uTime, uOpacity, uDim, uFlash, uLive;
      uniform vec4 uRect, uTile;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      // anti-aliased line of half-width w at distance d from its centre
      float line(float d, float w) { float aa = fwidth(d) * 0.8 + 0.25; return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }

      vec4 field(vec2 px) { return texture2D(uField, (px + uTile.xy) / uTile.zw); }

      void main() {
        vec2 px = uRect.xy + vUv * uRect.zw;            // tile px, y down, from the hex centre
        vec4 f = field(px);
        float dl = f.r * 64.0, dr = f.g * 64.0, wm = f.b;
        float t = uTime * uLive;

        // ripple: displace the lookup in open water only
        float open = smoothstep(3.0, 14.0, dl) * smoothstep(2.0, 10.0, dr);
        vec2 off = vec2(sin(px.y * 0.11 + t * 1.4) + 0.6 * sin(px.x * 0.05 - t * 0.9),
                        cos(px.x * 0.09 + t * 1.2) + 0.6 * sin(px.y * 0.07 + t * 0.8)) * 0.75 * open * wm * uLive;
        vec4 c = texture2D(uTex, (px + off - uRect.xy) / uRect.zw);

        float foam = 0.0;
        if (wm > 0.02 && uLive > 0.0) {
          // shore waves rolling in: the line travels from 22 px out to the sand
          for (int k = 0; k < 2; k++) {
            float p = fract(t / ${WAVE_PERIOD.toFixed(1)} + float(k) * 0.5);
            float r = mix(24.0, 1.5, p * p * (3.0 - 2.0 * p));
            float dash = smoothstep(0.32, 0.5, noise(px * vec2(0.07, 0.11) + vec2(t * 0.15, float(k) * 7.0)));
            float fade = sin(3.14159 * p) * (0.55 + 0.45 * p);
            foam = max(foam, line(dl - r, 1.1 + 0.8 * p) * dash * fade);
          }
          // the wash: a bright fringe right at the waterline as each wave lands
          float land = fract(t / ${WAVE_PERIOD.toFixed(1)});
          float wash = smoothstep(0.6, 0.85, land) * (1.0 - smoothstep(0.9, 1.0, land));
          foam = max(foam, (1.0 - smoothstep(1.0, 3.5, dl)) * wash * 0.9);
          // rings around rocks and posts
          for (int k = 0; k < 2; k++) {
            float p = fract(t / ${RING_PERIOD.toFixed(1)} + float(k) * 0.5);
            float r = 2.0 + 15.0 * p;
            float dash = smoothstep(0.3, 0.55, noise(px * 0.16 + float(k) * 13.0));
            foam = max(foam, line(dr - r, 0.9) * dash * (1.0 - p) * step(dr, 30.0));
          }
          // glints in open water
          vec2 g = floor(px / 22.0);
          float h = hash(g);
          vec2 gc = (g + 0.5 + 0.3 * vec2(hash(g + 3.1), hash(g + 7.7)) - 0.15) * 22.0;
          float tw = smoothstep(0.82, 1.0, sin(t * (0.8 + h) + h * 40.0));
          vec2 q = abs(px - gc);
          float glint = (1.0 - smoothstep(0.5, 1.4, q.y)) * (1.0 - smoothstep(1.5, 4.5, q.x));
          foam = max(foam, glint * tw * step(0.55, h) * smoothstep(16.0, 26.0, dl) * smoothstep(12.0, 20.0, dr));
          foam *= wm;
        }
        c.rgb = mix(c.rgb, vec3(0.96, 0.99, 1.0) * c.a, foam * 0.92);
        c.rgb = mix(c.rgb, vec3(c.a), uDim * 0.72);
        c.rgb = mix(c.rgb, vec3(c.a), uFlash);
        gl_FragColor = c * uOpacity;
      }`,
  });
}

// Dust puff for landings: white cloud lobes with an ink rim, drawn once.
export function puffTexture() {
  const s = 64, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const lobes = [[22, 40, 13], [36, 34, 15], [46, 42, 11], [30, 46, 11]];
  g.fillStyle = '#2a1f1a';
  for (const [x, y, r] of lobes) { g.beginPath(); g.arc(x, y, r + 2.2, 0, 7); g.fill(); }
  g.fillStyle = '#fffaf0';
  for (const [x, y, r] of lobes) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.fillStyle = '#efe4d2';
  for (const [x, y, r] of lobes) { g.beginPath(); g.arc(x + 2, y + 3, r * 0.55, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = true; t.flipY = false;
  return t;
}

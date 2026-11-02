// Pointy-top axial hex grid. World units are design px (dp): one hex is 490 dp wide,
// matching the reference sheets 1:1. World y points up; axial r increases downward.
export const HEX_R = 283;                       // centre -> corner
export const HEX_A = HEX_R * Math.sqrt(3) / 2;  // centre -> edge midpoint (apothem)
export const SQRT3 = Math.sqrt(3);

// Direction i sits at angle 60*i degrees (world, y-up): E, NE, NW, W, SW, SE.
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const DIR_NAMES = ['E', 'NE', 'NW', 'W', 'SW', 'SE'];
export const dirIndex = (n) => DIR_NAMES.indexOf(n);

export function hexToWorld(q, r) {
  return [HEX_R * SQRT3 * (q + r / 2), -HEX_R * 1.5 * r];
}

export function worldToHex(x, y) {
  const r = -y / (HEX_R * 1.5);
  const q = x / (HEX_R * SQRT3) - r / 2;
  return hexRound(q, r);
}

export function hexRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

// Edge midpoint for direction i, in local sprite space (y down).
export function edgeMid(i, k = 1) {
  const a = (i * Math.PI) / 3;
  return [Math.cos(a) * HEX_A * k, -Math.sin(a) * HEX_A * k];
}

// A road exit on edge i, `off` world units along the edge tangent (the edge
// normal rotated +90 deg, y-up), in local sprite space (y down). The same
// physical point seen from the neighbour across edge i is edge (i+3)%6 at -off.
export function edgePort(i, off = 0, k = 1) {
  const a = (i * Math.PI) / 3;
  return [Math.cos(a) * HEX_A * k - Math.sin(a) * off, -(Math.sin(a) * HEX_A * k + Math.cos(a) * off)];
}

// Hex corners in local sprite space (y down), pointy-top.
export function corners(scale = 1) {
  const out = [];
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; out.push([Math.cos(a) * HEX_R * scale, -Math.sin(a) * HEX_R * scale]); }
  return out;
}

export function insideHex(x, y, margin = 0) {
  // local sprite space; true if point is inside the hex shrunk by margin
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    if (x * Math.cos(a) - y * Math.sin(a) > HEX_A - margin) return false;
  }
  return true;
}

export const BIOMES = { meadow: 0, autumn: 1, moor: 2, jungle: 3 };
export const PLAZA = { none: 0, yard: 1, earth: 2, sand: 3 };

// A rectangular block of axial storage holding per-hex data for the terrain shader.
//   tex0: R biome, G road mask (6 bits), B waterness (0..255), A variation seed (0 = no hex here)
//   tex1: R/G plaza offset (128 = 0, 1 unit = HEX_R/128), B plaza radius (HEX_R*v/255), A plaza type
export class HexMap {
  constructor(q0, r0, w, h) {
    this.q0 = q0; this.r0 = r0; this.w = w; this.h = h;
    this.d0 = new Uint8Array(w * h * 4);
    this.d1 = new Uint8Array(w * h * 4);
    // road exit offsets along each edge (edges 0-3 in d2, 4-5 in d3), 128 = midpoint
    this.d2 = new Uint8Array(w * h * 4).fill(128);
    this.d3 = new Uint8Array(w * h * 4).fill(128);
    for (let i = 0; i < w * h; i++) { this.d1[i * 4] = 128; this.d1[i * 4 + 1] = 128; } // seed 0 = hex absent
    this.version = 0;
  }
  idx(q, r) {
    const x = q - this.q0, y = r - this.r0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return (y * this.w + x) * 4;
  }
  set(q, r, { biome, water, roads, seed, plaza, roadOff } = {}) {
    const i = this.idx(q, r); if (i < 0) return;
    // roadOff: { edge: offset } in world units along the edge tangent (see edgePort)
    if (roadOff) for (const [e, off] of Object.entries(roadOff)) {
      const k = +e, v = Math.max(0, Math.min(255, Math.round(128 + (off / (HEX_R / 2)) * 127)));
      if (k < 4) this.d2[i + k] = v; else this.d3[i + k - 4] = v;
    }
    if (biome !== undefined) this.d0[i] = typeof biome === 'string' ? BIOMES[biome] : biome;
    if (roads !== undefined) this.d0[i + 1] = roads.reduce((m, d) => m | (1 << (typeof d === 'string' ? dirIndex(d) : d)), 0);
    if (water !== undefined) this.d0[i + 2] = Math.round(water * 255);
    if (seed !== undefined) this.d0[i + 3] = 1 + (Math.abs(seed) % 254);
    if (plaza) {
      this.d1[i] = 128 + Math.round((plaza.x / HEX_R) * 128);
      this.d1[i + 1] = 128 + Math.round((-plaza.y / HEX_R) * 128); // stored y-up
      this.d1[i + 2] = Math.round((plaza.r / HEX_R) * 255);
      this.d1[i + 3] = PLAZA[plaza.type ?? 'yard'];
    }
    this.version++;
  }
  has(q, r) { const i = this.idx(q, r); return i >= 0 && this.d0[i + 3] > 0; }
  water(q, r) { const i = this.idx(q, r); return i < 0 ? 0 : this.d0[i + 2] / 255; }
}

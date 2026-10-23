"""Layer split: turn each reference hex tile into a stack of game layers.

A tile is drawn in ligne-claire: every object (tree, rock, house, crate) is closed
by an ink contour, and the land it stands on is one big ink-free region. So:

  ground   the largest ink-free cell (closed over 1 px ink gaps); everything it
           covers is land, water or road. It is split by colour into planes
           (water < sand < grass < road), each filled underneath the planes and
           objects above it so the stack can be pulled apart.
  objects  everything else, in connected pieces. Pieces that touch each other
           (a crate on a dock, a fence on a house) are split by the tile's spec
           (tools/layers/<tile>.json: rough polygons, front to back), the rest
           become one object each and are labelled by colour (tree, rock, ...).
           Occluded parts of an object are filled when the spec asks for it.
  parts    an object can be split again into parts by polygon (roof, chimney,
           door ...) for the build animation.
  water    a field texture for the animated water shader: distance to the shore
           and distance to rocks standing in water.

Writes assets/layers/<tile>/*.avif, assets/layers/<tile>/water.png and
assets/layers.json. Debug sheets go to docs/review/layers/.

Usage: python3 tools/layers.py [tile ...]
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from ingest import hex_sdf
import rebuild

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEX = os.path.join(ROOT, 'assets', 'hex')
OUT = os.path.join(ROOT, 'assets', 'layers')
SPEC = os.path.join(ROOT, 'tools', 'layers')
DBG = os.path.join(ROOT, 'docs', 'review', 'layers')
TILES = [f'{f}_{s}' for f in ('fish', 'apple', 'wool', 'spice') for s in (0, 1, 2)]
INK_L = 80
MIN_OBJ = 60            # smaller ink islands stay on the ground (grass strokes, flowers)

# ground plane prototypes (sRGB). The biome's own ground colours come from
# assets/props.json; roads are painted in the sand colour, so they are told
# apart by the painted road path in the manifest, not by colour.
PROTO = {
    'water': [(0, 100, 170), (20, 120, 190), (2, 135, 213), (30, 170, 235), (60, 213, 246), (120, 220, 248), (235, 250, 252), (200, 240, 250)],
    'sand': [(200, 175, 120), (180, 155, 105), (254, 230, 168), (245, 215, 150), (235, 200, 135), (254, 237, 193), (225, 205, 160)],
}
BIOME = {'fish': 'meadow', 'apple': 'autumn', 'wool': 'moor', 'spice': 'jungle'}
PLANES = ['water', 'sand', 'ground', 'road']


def lum(rgb):
    return rgb[..., 0] * 0.3 + rgb[..., 1] * 0.59 + rgb[..., 2] * 0.11


def load(name):
    im = np.asarray(Image.open(os.path.join(HEX, name + '_m.avif')).convert('RGBA')).astype(np.float32) / 255
    return im[..., :3], im[..., 3]


def poly_mask(shape, pts, grow=0):
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.round(np.array(pts, np.float32) * 4).astype(np.int32)], 1, shift=2)
    if grow: m = cv2.dilate(m, np.ones((2 * grow + 1, 2 * grow + 1), np.uint8))
    return m.astype(bool)


def fill_holes(m):
    return ndi.binary_fill_holes(m)


def ground_region(rgb, a, sdf, claimed=None, biome=None, keep_out=()):
    """The land/water region: the largest ink-free cell once 1 px gaps in the
    ink are closed (light rock faces otherwise leak into it), grown back."""
    L = lum(rgb) * 255
    ink = (L < INK_L) & (a > 0.5)
    inkc = cv2.dilate(ink.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    free = (~inkc) & (a > 0.98)
    n, lab, st, _ = cv2.connectedComponentsWithStats(free.astype(np.uint8), 4)
    g = 1 + int(np.argmax(st[1:, 4]))
    G = lab == g
    # grow back the 1 px taken by the closing, never into ink
    G = cv2.dilate(G.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & ~ink
    # rock faces are light grey and their contours leak into the land through
    # gaps the closing misses; no ground plane is grey, so cut grey out and keep
    # the land connected to the bulk
    hsv = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
    h_, s_, v_ = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    grey = ((s_ < 52) | ((s_ < 90) & (h_ > 95) & (h_ < 135))) & (v_ > 60) & (v_ < 228)
    grey = cv2.morphologyEx(grey.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
    n, lab, st, _ = cv2.connectedComponentsWithStats((G & ~grey).astype(np.uint8), 4)
    G = lab == 1 + int(np.argmax(st[1:, 4]))
    # yards and plazas fenced in by ink are ground too: big ink-free cells in
    # the sand colour (never a crown: no plane but sand is tested)
    n, lab, st, _ = cv2.connectedComponentsWithStats(free.astype(np.uint8), 4)
    labc = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    sand = [cv2.cvtColor(np.uint8([[c]]), cv2.COLOR_RGB2LAB)[0, 0].astype(np.float32) for c in PROTO['sand']]
    land = [cv2.cvtColor(np.uint8([[c]]), cv2.COLOR_RGB2LAB)[0, 0].astype(np.float32) for c in ground_protos(biome)] if biome else []
    for k in range(1, n):
        if st[k, 4] < 800: continue
        m = lab == k
        if (m & G).any(): continue
        if any(m[int(y), int(x)] for x, y in keep_out): continue                     # spec: this cell is an object
        if claimed is not None and (m & claimed).sum() > 0.5 * m.sum(): continue   # a wall inside a spec'd building
        mc = np.median(labc[m], 0)
        # land cut off from the bulk by a tree line still runs to the hex edge
        # (a crown can touch the edge too, but it pokes out of the hex; land never does)
        edge_land = biome is not None and st[k, 4] > 700 and (m & (sdf < 10) & (sdf > -2)).sum() > 25 and \
            (m & (sdf < -2.5)).sum() < 5 and min(np.linalg.norm(mc - q) for q in land) < 12
        if min(np.linalg.norm(mc - q) for q in sand) < 18 or edge_land:
            G |= cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & ~ink
    # light cells cut off from the big region but sitting inside it with no
    # contour of their own (sun glints on water, foam flecks) are ground too
    return G, ink


def ground_protos(biome):
    pal = json.load(open(os.path.join(ROOT, 'assets', 'props.json')))['ground'][biome]
    out = [(150, 200, 50), (186, 212, 35)] if biome in ('meadow', 'jungle') else []
    for _, c in pal:
        r, g, b = c
        mx, mn = max(c), min(c)
        if lum(np.float32(c)) < 110: continue                                 # shade tones
        if b > r + 30 or mx > 235 and mn > 200 or (mx - mn) < 0.18 * mx: continue    # water, foam, grey
        if min(np.linalg.norm(np.subtract(c, p)) for p in PROTO['sand']) < 30: continue
        out.append(tuple(c))
    return out


def classify_ground(rgb, known, road_m, biome):
    """Nearest-prototype class per ground pixel (Lab distance); road is the
    sand-coloured land on the painted road path."""
    lab = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    cls_of, protos = [], []
    for k, cols in (('water', PROTO['water']), ('sand', PROTO['sand']), ('ground', ground_protos(biome))):
        for c in cols:
            cls_of.append(PLANES.index(k))
            protos.append(cv2.cvtColor(np.uint8([[c]]), cv2.COLOR_RGB2LAB)[0, 0].astype(np.float32))
    d = np.stack([np.linalg.norm(lab - p, axis=-1) for p in protos], -1)
    cls = np.array(cls_of)[np.argmin(d, -1)]
    cls[(cls == PLANES.index('sand')) & road_m] = PLANES.index('road')
    cls[~known] = -1
    return cls


def smooth_labels(cls, valid, r=5):
    """Fill unknown labels from the nearest known one, then a mode filter so
    plane borders under objects come out as smooth curves."""
    unk = (cls < 0) & valid
    if unk.any():
        _, (iy, ix) = ndi.distance_transform_edt(cls < 0, return_indices=True)
        cls = np.where(unk, cls[iy, ix], cls)
    votes = np.stack([cv2.GaussianBlur((cls == k).astype(np.float32), (0, 0), r) for k in range(len(PLANES))], -1)
    out = np.argmax(votes, -1)
    return np.where(valid, out, -1)


def fill_plane(rgb, src, region, sigma=18):
    """Colour for `region` from the pixels in `src`: normalised convolution at
    two scales (local colour where the plane is near, the plane's mean far off)
    plus TELEA on the seam. Ground in this style is flat colour with sparse
    strokes, so this reads as the same paint."""
    w = src.astype(np.float32)
    out = rgb.copy()
    num = cv2.GaussianBlur(rgb * w[..., None], (0, 0), sigma)
    den = cv2.GaussianBlur(w, (0, 0), sigma)[..., None]
    mean = (rgb[src].mean(0) if src.any() else np.array([0.5, 0.5, 0.5])).astype(np.float32)
    fillc = np.where(den > 1e-3, num / np.maximum(den, 1e-6), mean)
    k = np.clip(den * 4, 0, 1)
    fillc = fillc * k + mean * (1 - k)
    out[region & ~src] = fillc[region & ~src]
    return out


def unblend_rim(rgb, L, LG, m, a):
    """Alpha for the 2 px ring outside an object mask: the ink's anti-aliased
    edge blended with the ground. Colour goes to ink, alpha from luminance."""
    ring = cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~m
    alpha = m.astype(np.float32) * a
    col = rgb.copy()
    ra = np.clip((LG - L) / np.maximum(LG - 30, 1), 0, 1)
    on = ring & (a > 0.98)
    alpha[on] = ra[on]
    col[on] = np.array([0.12, 0.09, 0.08])
    off = ring & (a <= 0.98)
    alpha[off] = a[off]
    return col, alpha, ring


def kind_of(rgb, m):
    """Label an auto object by its dominant paint."""
    hsv = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2HSV)[m].astype(np.float32)
    L = lum(rgb[m]) * 255
    body = L > 70
    h, s, v = hsv[body, 0], hsv[body, 1], hsv[body, 2]
    if not len(h): return 'prop'
    green = ((h > 30) & (h < 85) & (s > 70)).mean()
    grey = (s < 45).mean()
    autumn = ((h >= 8) & (h <= 30) & (s > 120) & (v > 150)).mean()
    purple = ((h > 120) & (h < 170) & (s > 50)).mean()
    if grey > 0.55: return 'rock'
    if green > 0.45: return 'tree'
    if autumn > 0.35: return 'tree'
    crown = ((h >= 4) & (h <= 30) & (s > 110) & (v > 120)).mean()
    if crown > 0.45: return 'tree'
    if purple > 0.3: return 'heather'
    return 'prop'


def save_rgba(path, col, alpha):
    a8 = np.dstack([np.clip(col, 0, 1), np.clip(alpha, 0, 1)])
    a8 = (a8 * 255 + 0.5).astype(np.uint8)
    a8[a8[..., 3] == 0, :3] = 0
    Image.fromarray(a8, 'RGBA').save(path, 'AVIF', quality=95, subsampling='4:4:4', speed=4)


def crop_box(alpha, pad=1):
    ys, xs = np.nonzero(alpha > 0.004)
    return max(xs.min() - pad, 0), max(ys.min() - pad, 0), xs.max() + 1 + pad, ys.max() + 1 + pad


# --- objects -----------------------------------------------------------------

KIND_RANK = {'rock': 1, 'ledge': 1, 'dock': 2, 'wall': 3, 'building': 4, 'tower': 4, 'fence': 5, 'stall': 5,
             'rack': 6, 'crop': 6, 'prop': 7, 'crate': 7, 'barrel': 7, 'animal': 8, 'tree': 9, 'bush': 9,
             'heather': 9, 'palm': 9}


def claim_cells(obj, ink, pmask, taken):
    """Pixels of `obj` an object polygon claims: every ink-enclosed cell whose
    larger part lies inside the polygon, then the ink touching those cells."""
    free = obj & ~ink & ~taken
    n, lab = cv2.connectedComponents(free.astype(np.uint8), connectivity=4)
    if n < 2: return np.zeros_like(obj)
    tot = np.bincount(lab.ravel(), minlength=n)
    ins = np.bincount(lab[pmask].ravel(), minlength=n)
    keep = (ins > 0.5 * tot) & (ins > 0)
    keep[0] = False
    # a big cell that leaks through gaps in the ink into its neighbours (a wall
    # running into the trees behind) is cut along the polygon instead
    part = (ins > 0.12 * tot) & (tot > 2500) & ~keep
    part[0] = False
    return keep[lab] | (part[lab] & pmask)


def assign_ink(objs, ink, obj_px):
    """Ink pixels go to the front-most object among those whose cells lie
    within 4 px: an outline belongs to the thing in front of it."""
    ink_obj = ink & obj_px
    best = np.full(ink.shape, -1, np.int32)
    for i in range(len(objs) - 1, -1, -1):           # objs are front to back
        near = cv2.dilate(objs[i]['cells'].astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
        best[near & ink_obj] = i
    return best


def build(name, spec, man, debug=True):
    t = man['tiles'][name]
    fam = name.split('_')[0]
    rgb, a = load(name)
    H, W = a.shape
    ox, oy = int(t['ox']), int(t['oy'])
    gx, gy = np.meshgrid(np.arange(W) - ox, np.arange(H) - oy)
    sdf = hex_sdf(gx.astype(np.float64), gy.astype(np.float64), 283.0)
    L = lum(rgb) * 255
    claimed = np.zeros(a.shape, bool)
    for o in spec.get('objects', []): claimed |= poly_mask(a.shape, o['poly'])
    G, ink_all = ground_region(rgb, a, sdf, claimed, BIOME[fam], spec.get('not_ground', []))
    O = (a > 0.5) & ~G
    # ink islands too small to be objects are ground strokes
    n, lab, st, _ = cv2.connectedComponentsWithStats(O.astype(np.uint8), 8)
    small = (st[:, 4] < MIN_OBJ)
    small[0] = False
    G = G | small[lab]
    O = O & ~small[lab]
    ink = (L < INK_L) & O

    # spec objects (front to back), then auto objects for what is left
    objs, taken = [], np.zeros_like(O)
    for o in spec.get('objects', []):
        pm = poly_mask(O.shape, o['poly'])
        if o.get('mode') == 'poly':
            cells = pm & O & ~taken & ~ink
        else:
            cells = claim_cells(O, ink, pm, taken)
        if cells.sum() < 20:
            print(f'  {name}: spec object {o["id"]} claims nothing, skipped')
            continue
        objs.append(dict(id=o['id'], kind=o.get('kind', 'prop'), cells=cells, spec=o))
        taken |= cells
    rest = O & ~taken
    # ink that only borders claimed cells belongs to them, not to an auto object
    n, lab, st, cen = cv2.connectedComponentsWithStats((rest & ~ink).astype(np.uint8), 8)
    autos = []
    for k in range(1, n):
        if st[k, 4] < MIN_OBJ // 2: continue
        m = lab == k
        if not (m & ~cv2.dilate(taken.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)).any(): continue
        autos.append(m)
    # merge auto cells that share an ink contour into one object (a tree's
    # crown cells, a rock's faces): connected through ink within the rest mask
    joined = np.zeros(O.shape, np.int32)
    if autos:
        seeds = np.zeros(O.shape, np.int32)
        for i, m in enumerate(autos): seeds[m] = i + 1
        body = rest.astype(np.uint8)
        n2, lab2 = cv2.connectedComponents(body, connectivity=8)
        for k in range(1, n2):
            m = lab2 == k
            ids = np.unique(seeds[m]); ids = ids[ids > 0]
            if not len(ids): continue
            cells = m & ~ink
            if cells.sum() < MIN_OBJ // 2: continue
            objs.append(dict(id=None, kind=None, cells=cells, spec={}))
    # small auto pieces sitting inside a bigger one's outline (apples in a
    # crown, flowers in a bush) join it
    autos_i = [i for i, o in enumerate(objs) if o['id'] is None]
    hulls = {}
    for i in autos_i:
        ys, xs = np.nonzero(objs[i]['cells'])
        hm = np.zeros(O.shape, np.uint8)
        cv2.fillConvexPoly(hm, cv2.convexHull(np.stack([xs, ys], 1).astype(np.int32)), 1)
        hulls[i] = hm.astype(bool)
    for i in sorted(autos_i, key=lambda i: objs[i]['cells'].sum()):
        ci = objs[i]['cells']
        for j in autos_i:
            if j == i or objs[j].get('merged') or objs[j]['cells'].sum() < 4 * ci.sum(): continue
            if (ci & hulls[j]).sum() > 0.85 * ci.sum():
                objs[j]['cells'] = objs[j]['cells'] | ci
                objs[i]['merged'] = True
                break
    objs = [o for o in objs if not o.get('merged')]
    # a tree line comes out as one piece (crowns touch): split big auto pieces
    # into crowns by watershed on the distance to their outline
    from skimage.segmentation import watershed
    from skimage.feature import peak_local_max
    split = []
    for o in objs:
        c = o['cells']
        if o['id'] is not None or c.sum() < 7000:
            split.append(o); continue
        full = fill_holes(cv2.morphologyEx(c.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool))
        dist = ndi.distance_transform_edt(full)
        pk = peak_local_max(dist, min_distance=16, threshold_abs=9, labels=full.astype(int))
        if len(pk) < 2:
            split.append(o); continue
        mk = np.zeros(c.shape, np.int32)
        for i, (y, x) in enumerate(pk): mk[y, x] = i + 1
        ws = watershed(-dist, mk, mask=full)
        for i in range(1, len(pk) + 1):
            ci = c & (ws == i)
            if ci.sum() >= 300: split.append(dict(id=None, kind=None, cells=ci, spec={}))
    objs = split
    # ink to cells
    owner = assign_ink(objs, ink, O)
    hidden_all = np.zeros_like(O)
    renames = spec.get('auto', {})
    autoc = {}
    for i, o in enumerate(objs):
        m = o['cells'] | (owner == i)
        # light highlights inside a crown or on a rock face can touch the land
        # through 1-2 px gaps: close small gaps before filling holes
        mc = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        m = m | (fill_holes(mc.astype(bool)) & ~fill_holes(m) & (a > 0.5)) | fill_holes(m)
        m &= a > 0.02
        o['mask'] = m
        if o['id'] is None:
            kind = kind_of(rgb, m)
            ys, xs = np.nonzero(m)
            for key, v in renames.items():
                px, py = map(int, key.split(','))
                if 0 <= py < H and 0 <= px < W and m[py, px]:
                    kind = v.get('kind', kind)
                    if v.get('ground'): o['ground'] = True
                    o['id'] = v.get('id')
            autoc[kind] = autoc.get(kind, 0) + 1
            o['kind'] = kind
            o['id'] = o['id'] or f'{kind}_{autoc[kind]}'
    # spec can send auto objects back to the ground (flat ledges, paving)
    for o in [o for o in objs if o.get('ground')]:
        G |= o['mask']; O &= ~o['mask']
    objs = [o for o in objs if not o.get('ground')]
    return dict(rgb=rgb, a=a, L=L, G=G, O=O, ink=ink, objs=objs, sdf=sdf, ox=ox, oy=oy, W=W, H=H, t=t, fam=fam)


# --- export ------------------------------------------------------------------

def plane_stack(r):
    """Label every pixel of the hex with a ground plane and fill each plane
    under the planes and objects above it."""
    rgb, a, G, L = r['rgb'], r['a'], r['G'], r['L']
    H, W = a.shape
    t = r['t']
    road = np.zeros((H, W), np.uint8)
    if t.get('road'):
        pts = np.array([[x + r['ox'], y + r['oy']] for x, y in t['road']], np.int32)
        cv2.polylines(road, [pts], False, 1, 44)
    near_obj = cv2.dilate((~G & (r['a'] > 0.5)).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
    known = G & (L >= INK_L) & ~near_obj
    cls = classify_ground(rgb, known, road.astype(bool), BIOME[r['fam']])
    valid = r['sdf'] > -2.5
    # under a rebuilt structure the new one may cover less than the old: the
    # strip it leaves between deck and beach should read as beach, not sea
    for o in r['objs']:
        if not o['spec'].get('rebuild'): continue
        hole = o['mask'] & (cls < 0)
        dl = ndi.distance_transform_edt(~((cls >= 1) & known))
        dw = ndi.distance_transform_edt(~((cls == 0) & known))
        cls = np.where(hole & (dl < 2.5 * dw), PLANES.index('sand'), cls)
    lab = smooth_labels(cls, valid, r=3)
    # plane k covers its own label and every plane above it (a full plate)
    planes = []
    # around rebuilt structures the painted water carries foam rings of the old
    # posts; repaint it plain (the water shader rings the new piles)
    clear = np.zeros_like(G)
    for o in r['objs']:
        if o['spec'].get('rebuild'):
            clear |= cv2.dilate(o['mask'].astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19))).astype(bool)
    src_all = G & valid & ~clear
    r['clear'] = clear
    for k, nm in enumerate(PLANES):
        cover = valid & (lab >= k) if nm != 'road' else valid & (lab == k)
        if nm == 'ground': cover = valid & ((lab == k) | (lab == PLANES.index('road')))
        if nm == 'water': cover = valid.copy()
        if not cover.any(): continue
        own = src_all & (lab == k)
        if not own.any(): continue
        # fill from the plane's clean paint: no ink, no cast shadows
        Lk = L[own]
        clean = own & (L >= INK_L) & (L >= np.median(Lk) - 28)
        if nm == 'water': clean &= L <= np.median(Lk) + 25         # no foam in the fill
        col = fill_plane(rgb, clean, cover)
        col = np.where((own)[..., None], rgb, col)          # strokes on the plane keep their ink
        hexa = np.clip(r['sdf'] + 0.5, 0, 1).astype(np.float32)
        alpha = cv2.GaussianBlur(cover.astype(np.float32), (0, 0), 0.6) * hexa if nm != 'water' else hexa
        planes.append(dict(id=nm, col=col, alpha=alpha, cover=cover))
    return lab, planes


def object_sprite(r, o, LG):
    rgb, a, L, G = r['rgb'], r['a'], r['L'], r['G']
    m = o['mask']
    ring = cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~m & G
    alpha = (m * a).astype(np.float32)
    col = rgb.copy()
    ra = np.clip((LG - L) / np.maximum(LG - 30, 1), 0, 1)
    on = ring & (a > 0.98)
    alpha[on] = ra[on]
    col[on] = np.array([0.12, 0.09, 0.08])
    off = ring & (a <= 0.98)
    alpha[off] = a[off]
    return col, alpha


def export(name, r, lab, planes, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        if f.endswith('.avif') or f.endswith('.png'): os.remove(os.path.join(out_dir, f))
    rgb, G, L = r['rgb'], r['G'], r['L']
    H, W = G.shape
    ox, oy = r['ox'], r['oy']
    rel = f'layers/{name}/'
    meta = dict(w=W, h=H, ox=ox, oy=oy, flat=f'hex/{name}_m.avif', planes=[], objects=[])
    for p in planes:
        x0, y0, x1, y1 = crop_box(p['alpha'], 0)
        save_rgba(os.path.join(out_dir, f"plane_{p['id']}.avif"), p['col'][y0:y1, x0:x1], p['alpha'][y0:y1, x0:x1])
        meta['planes'].append(dict(id=p['id'], file=rel + f"plane_{p['id']}.avif", x=int(x0 - ox), y=int(y0 - oy),
                                   w=int(x1 - x0), h=int(y1 - y0)))
    # ground luminance for the rim un-blend: the land with objects painted out
    g8 = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    LG = lum(cv2.GaussianBlur(cv2.inpaint(g8, (~G).astype(np.uint8), 5, cv2.INPAINT_TELEA).astype(np.float32), (0, 0), 3))
    water = lab == PLANES.index('water')
    stand = np.zeros_like(G)
    stand_list = []
    for o in r['objs']:
        col, alpha = object_sprite(r, o, LG)
        m = o['mask']
        ys, xs = np.nonzero(m)
        foot = [float(np.median(xs[ys > ys.max() - 4])) - ox, float(ys.max()) - oy]
        if o['kind'] in ('rock', 'dock'): stand |= m & cv2.erode(water.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        if o['spec'].get('rebuild'):
            meta['objects'].append(rebuilt(o, r, lab, out_dir, rel, stand_list))
            continue
        parts = []
        body = m.copy()
        ink = (L < INK_L) & m
        for pt in o['spec'].get('parts', []):
            pm = poly_mask(m.shape, pt['poly'])
            cells = (pm & body) if pt.get('mode') == 'poly' else claim_cells(body, ink, pm, np.zeros_like(m))
            if pt.get('color') and pt.get('mode') != 'poly':
                # keep only cells painted near the part's colour (roof tiles, not the gable wall)
                n_, lab_ = cv2.connectedComponents(cells.astype(np.uint8), connectivity=4)
                keep = np.zeros(n_, bool)
                for k in range(1, n_):
                    keep[k] = np.linalg.norm(rgb[lab_ == k].mean(0) * 255 - pt['color']) < pt.get('tol', 70)
                cells = keep[lab_]
            if not cells.any(): continue
            near = cv2.dilate(cells.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
            pmask = fill_holes(cells | (ink & near & pm & body))
            pmask &= body
            body &= ~pmask
            parts.append((pt['id'], pmask))
        def put(pid, pm_alpha, c=None):
            c = col if c is None else c
            x0, y0, x1, y1 = crop_box(pm_alpha)
            fn = f"obj_{pid}.avif"
            save_rgba(os.path.join(out_dir, fn), c[y0:y1, x0:x1], pm_alpha[y0:y1, x0:x1])
            return dict(file=rel + fn, x=int(x0 - ox), y=int(y0 - oy), w=int(x1 - x0), h=int(y1 - y0))
        entry = dict(id=o['id'], kind=o['kind'], foot=[round(foot[0], 1), round(foot[1], 1)],
                     z=round(foot[1] + o['spec'].get('z', 0), 1), area=int(m.sum()))
        if parts:
            ring = alpha * ~m                    # outer rim goes with the body
            # doors, windows: paint the wall in behind them so the wall stays
            # whole when they are lifted out
            fill = np.zeros_like(m)
            for (pid, pm), pt in zip(parts, [p for p in o['spec']['parts'] if p['id'] in dict(parts)]):
                if pt.get('fill'): fill |= pm
            if fill.any():
                c8 = (np.clip(col, 0, 1) * 255).astype(np.uint8)
                filled = cv2.inpaint(c8, cv2.dilate(fill.astype(np.uint8), np.ones((3, 3), np.uint8)), 4, cv2.INPAINT_TELEA).astype(np.float32) / 255
                body_col = np.where(fill[..., None], filled, col)
                body = body | fill
            else:
                body_col = col
            entry['body'] = put(o['id'], np.where(body, alpha, ring), body_col)
            entry['parts'] = []
            for pid, pm in parts:
                e = put(f"{o['id']}__{pid}", np.where(pm, alpha, 0))
                e['id'] = pid
                entry['parts'].append(e)
        else:
            entry['body'] = put(o['id'], alpha)
        meta['objects'].append(entry)
    # water field: R distance to land, G distance to things standing in the
    # water (rocks, posts), B water mask; 64 px range
    for x, y, rr in stand_list:
        sm = np.zeros(G.shape, np.uint8)
        cv2.ellipse(sm, (int(round(x + ox)), int(round(y + oy))), (int(rr + 1), int(rr * 0.45 + 1)), 0, 0, 360, 1, -1)
        stand |= sm.astype(bool)
    wm = water & (r['sdf'] > -2.5)
    d_land = ndi.distance_transform_edt(wm | (r['sdf'] <= -2.5))      # the hex edge is not a shore
    d_rock = ndi.distance_transform_edt(~stand) if stand.any() else np.full(G.shape, 1e3)
    f = np.dstack([np.clip(d_land / 64, 0, 1), np.clip(d_rock / 64, 0, 1),
                   cv2.GaussianBlur(wm.astype(np.float32), (0, 0), 0.7)])
    if wm.any():
        Image.fromarray((f * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(out_dir, 'water.png'))
        meta['water'] = rel + 'water.png'
    meta['objects'].sort(key=lambda e: e['z'])
    return meta


def rebuilt(o, r, lab, out_dir, rel, stand_list):
    """Object redrawn by tools/rebuild.py: the old pixels are dropped, the
    parametric parts take their place (frame as the body, then piles and deck
    slabs in draw order)."""
    rb = o['spec']['rebuild']
    W, H, ox, oy = r['W'], r['H'], r['ox'], r['oy']
    water = lab == PLANES.index('water')
    if rb.get('fit') and rb['type'] == 'dock':
        # target: the old deck, piles opened away, crate holes closed
        t = cv2.morphologyEx(o['mask'].astype(np.uint8), cv2.MORPH_OPEN, np.ones((1, 21), np.uint8))
        t = cv2.morphologyEx(t, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
        rb = rebuild.fit_dock(rb, t.astype(bool))
        print(f"  {o['id']}: fitted, IoU {rb['fit_iou']}, origin {np.round(rb['origin'], 1).tolist()}, "
              f"axes {rb['au']:.1f}/{rb['av']:.1f}, segments {np.round(rb['segments'], 1).tolist()}")
    if rb.get('fit') and rb['type'] == 'house':
        rb = rebuild.fit_house(rb, o['mask'])
        print(f"  {o['id']}: fitted, IoU {rb['fit_iou']}, origin {np.round(rb['origin'], 1).tolist()}, "
              f"w {rb['w']:.1f} d {rb['d']:.1f} h {rb['h']:.1f} rise {rb['rise']:.1f}, axes {rb['au']:.1f}/{rb['av']:.1f}")
    out = getattr(rebuild, rb['type'])(rb, W, H, ox, oy, water)
    stand_list += out['stand']
    entry = None
    alls = []
    for pid, kind, cv in out['parts']:
        col, alpha = cv.down()
        full = np.zeros((H, W), np.float32)
        full[cv.y0:cv.y0 + cv.H, cv.x0:cv.x0 + cv.W] = alpha
        alls.append(full)
        x0, y0, x1, y1 = crop_box(alpha)
        fn = f"obj_{o['id']}__{pid}.avif"
        save_rgba(os.path.join(out_dir, fn), col[y0:y1, x0:x1], alpha[y0:y1, x0:x1])
        x0, y0, x1, y1 = x0 + cv.x0, y0 + cv.y0, x1 + cv.x0, y1 + cv.y0
        e = dict(id=pid, kind=kind, file=rel + fn, x=int(x0 - ox), y=int(y0 - oy), w=int(x1 - x0), h=int(y1 - y0))
        if entry is None:
            entry = dict(id=o['id'], kind=o['kind'], body=e, parts=[], rebuilt=rb['type'], params={k: rb[k] for k in ('origin', 'au', 'av', 'segments', 'w', 'd', 'h', 'rise', 'fit_iou') if k in rb})
        else:
            entry['parts'].append(e)
    a = np.max(alls, 0) > 0.5
    ys, xs = np.nonzero(a)
    foot = [float(np.median(xs[ys > ys.max() - 4])) - ox, float(ys.max()) - oy]
    entry['foot'] = [round(foot[0], 1), round(foot[1], 1)]
    entry['z'] = round(foot[1] + o['spec'].get('z', 0), 1)
    entry['area'] = int(a.sum())
    return entry


def debug_sheet(name, r, lab, planes, meta, out_dir):
    """Review sheet: original | plane labels | objects tinted | recomposite."""
    os.makedirs(DBG, exist_ok=True)
    rgb, a = r['rgb'], r['a']
    H, W = a.shape
    white = np.ones_like(rgb)
    orig = rgb * a[..., None] + white * (1 - a[..., None])
    pal = np.array([(0.15, 0.45, 0.85), (0.95, 0.85, 0.6), (0.45, 0.7, 0.25), (1, 1, 1)])
    labv = np.where((lab >= 0)[..., None], pal[np.maximum(lab, 0)], 1.0)
    rng = np.random.default_rng(5)
    objv = labv * 0.5 + 0.5
    for o in r['objs']:
        objv[o['mask']] = rgb[o['mask']] * 0.5 + rng.random(3) * 0.5
    # recomposite from the written files
    comp = white.copy()
    def over(path, x, y):
        im = np.asarray(Image.open(os.path.join(ROOT, 'assets', path)).convert('RGBA')).astype(np.float32) / 255
        X, Y = x + r['ox'], y + r['oy']
        h, w = im.shape[:2]
        x0, y0 = max(X, 0), max(Y, 0)
        x1, y1 = min(X + w, W), min(Y + h, H)
        s = im[y0 - Y:y1 - Y, x0 - X:x1 - X]
        comp[y0:y1, x0:x1] = s[..., :3] * s[..., 3:] + comp[y0:y1, x0:x1] * (1 - s[..., 3:])
    for p in meta['planes']: over(p['file'], p['x'], p['y'])
    for o in meta['objects']:
        over(o['body']['file'], o['body']['x'], o['body']['y'])
        for p in o.get('parts', []): over(p['file'], p['x'], p['y'])
    err = np.abs(comp - orig).max(-1)
    sheet = np.hstack([orig, labv, objv, comp])
    Image.fromarray((np.clip(sheet, 0, 1) * 255).astype(np.uint8)).save(os.path.join(DBG, f'{name}.jpg'), quality=88)
    return float((err > 0.08).mean()), float(err.mean())


def main(names):
    man = json.load(open(os.path.join(ROOT, 'assets', 'manifest.json')))
    jp = os.path.join(ROOT, 'assets', 'layers.json')
    allm = json.load(open(jp)) if os.path.exists(jp) else {}
    for name in names:
        sp = os.path.join(SPEC, name + '.json')
        spec = json.load(open(sp)) if os.path.exists(sp) else {}
        r = build(name, spec, man)
        lab, planes = plane_stack(r)
        meta = export(name, r, lab, planes, os.path.join(OUT, name))
        bad, mean = debug_sheet(name, r, lab, planes, meta, os.path.join(OUT, name))
        meta['review'] = dict(recomposite_bad=round(bad, 4), recomposite_err=round(mean, 4))
        allm[name] = meta
        print(name, len(meta['planes']), 'planes', len(meta['objects']), 'objects',
              sum(len(o.get('parts', [])) for o in meta['objects']), 'parts; recomposite off', f'{bad:.2%}')
    json.dump(allm, open(jp, 'w'), indent=1)
    write_layers_js(allm)


def write_layers_js(allm):
    """Static import list for the bundler (asset lab)."""
    files = set()
    for m in allm.values():
        files |= {p['file'] for p in m['planes']}
        for o in m['objects']:
            files.add(o['body']['file'])
            files |= {p['file'] for p in o.get('parts', [])}
        if m.get('water'): files.add(m['water'])
        files.add(m['flat'])
    files = sorted(files)
    with open(os.path.join(ROOT, 'assets', 'layers.js'), 'w') as f:
        f.write('// generated by tools/layers.py\n')
        for i, fn in enumerate(files): f.write(f"import l{i} from './{fn}';\n")
        f.write("export { default as layers } from './layers.json';\n")
        f.write('export const files = {\n' + ''.join(f"  '{fn}': l{i},\n" for i, fn in enumerate(files)) + '};\n')


if __name__ == '__main__':
    main(sys.argv[1:] or TILES)

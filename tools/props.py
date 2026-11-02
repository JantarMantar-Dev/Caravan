"""Prop extraction: cut single trees, bushes, rocks, heather and palms out of the
reference tiles so code-built filler hexes are dressed with the reference's own
strokes instead of redrawn approximations.

Method (per tile, on the borderless map variant from tools/ingest.py):
  1. ink = dark pixels; ground = the big ink-free regions (grass, sand, water)
  2. props = what ink encloses, split into connected clusters
  3. each cluster's outer ink rim is un-blended from the local ground colour so
     the contour keeps its full weight with no ground-coloured fringe
  4. its cast shadow (ground darker than the smoothed local ground, touching the
     prop) is kept as a black, partly transparent layer under it
  5. ground palette per biome: k-means over ground pixels

Writes assets/props/<biome>_<n>.avif, assets/props.json (anchors, sizes, kind)
and the ground palettes into assets/props.json too.

Usage: python3 tools/props.py
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

from ingest import hex_sdf, write_art_js

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEX = os.path.join(ROOT, 'assets', 'hex')
OUT = os.path.join(ROOT, 'assets', 'props')
BIOME = {'fish': 'meadow', 'apple': 'autumn', 'wool': 'moor', 'spice': 'jungle'}
INK_L = 80          # luminance below this is ink
MIN_AREA, MAX_AREA = 600, 26000
# reviewed by eye (loop 2 contact sheet): man-made pieces that belong to towns,
# and clusters whose cut caught a stray shadow or a sliver
EXCLUDE = {('apple_2', 203, 328), ('apple_1', 267, 284), ('apple_1', 187, 356), ('spice_0', 178, 273),
           ('spice_0', 55, 182), ('spice_1', 219, 373), ('spice_2', 141, 391), ('spice_2', 9, 423),
           ('wool_0', 27, 265), ('wool_0', 50, 54), ('fish_0', 188, 173)}


def lum(rgb):
    return rgb[..., 0] * 0.3 + rgb[..., 1] * 0.59 + rgb[..., 2] * 0.11


def extract(name, t):
    im = np.asarray(Image.open(os.path.join(HEX, name + '_m.avif')).convert('RGBA')).astype(np.float32) / 255
    rgb, a = im[..., :3], im[..., 3]
    L = lum(rgb) * 255
    solid = a > 0.98
    ink = (L < INK_L) & (a > 0.5)
    inkd = cv2.dilate(ink.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    free = solid & ~inkd
    n, lab, st, _ = cv2.connectedComponentsWithStats(free.astype(np.uint8), 4)
    # ground regions reach the hex edge; prop interiors are closed by ink
    H_, W_ = a.shape
    gx, gy = np.meshgrid(np.arange(W_) - t['ox'], np.arange(H_) - t['oy'])
    sdf = hex_sdf(gx.astype(np.float64), gy.astype(np.float64), 283.0)
    band = (sdf > 3) & (sdf < 14)
    touch = np.zeros(n, bool)
    touch[np.unique(lab[band & free])] = True
    touch[0] = False
    ground = touch[lab] & free & (st[lab, 4] > 1500)
    # anything opaque that is not ground and not touching the tile's open edge
    props = (a > 0.5) & ~ground
    props = cv2.morphologyEx(props.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)

    # smooth ground colour field: inpaint props, blur
    g8 = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    hole = (~ground).astype(np.uint8)
    G = cv2.inpaint(g8, hole, 7, cv2.INPAINT_TELEA).astype(np.float32)
    G = cv2.GaussianBlur(G, (0, 0), 9)
    LG = lum(G)

    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(props.astype(np.uint8), 8)
    ink5 = cv2.dilate(ink.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    # a prop is unusable only where the hex clip cut it (transparent at the
    # hex boundary); overhang props (palms, tall trees) border paper outside
    edge = cv2.dilate(((a < 0.5) & (sdf > -3)).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    H, W = a.shape
    out = []
    for k in range(1, n2):
        x, y, w, h, area = st2[k]
        if not (MIN_AREA <= area <= MAX_AREA): continue
        if x <= 1 or y <= 1 or x + w >= W - 1 or y + h >= H - 1: continue
        m = lab2 == k
        # enclosed ground-coloured holes (rock faces, canopy centres) belong to the prop
        ff = np.pad(m, 1).astype(np.uint8)
        cv2.floodFill(ff, None, (0, 0), 2)
        m = (ff[1:-1, 1:-1] != 2)
        # cut thin appendages (ground contour lines, path edges touching the prop)
        body = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        nb, lb, sb, _ = cv2.connectedComponentsWithStats(body, 8)
        if nb < 2: continue
        body = lb == 1 + int(np.argmax(sb[1:, 4]))
        m = m & cv2.dilate(body.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        # shape filters: ink fragments (road edges, contour lines) are thin and hollow
        thick = cv2.distanceTransform(m.astype(np.uint8), cv2.DIST_L2, 3).max()
        cnts, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        hull = cv2.contourArea(cv2.convexHull(np.vstack(cnts)))
        if thick < 5 or m.sum() < 0.45 * max(hull, 1): continue
        # props standing in water carry foam and a wet rim; land filler can't use them
        Gm = G[m].mean(axis=0)
        if Gm[2] > Gm[0] + 40: continue
        # a prop is mostly colour, not a ground-coloured shell
        Gm = G[m].mean(axis=0); dc = np.linalg.norm(rgb[m] * 255 - Gm, axis=1)
        if (dc > 40).mean() < 0.55: continue
        # skip clusters touching the tile's alpha edge (cut by the hex)
        if (m & edge).any(): continue
        # man-made (crates, fences, walls, trellis, stalls): lots of plank brown
        hsv = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2HSV)[m]
        wood = ((hsv[:, 0] >= 8) & (hsv[:, 0] <= 22) & (hsv[:, 1] > 80) & (hsv[:, 1] < 175) & (hsv[:, 2] > 70) & (hsv[:, 2] < 200)).mean()
        if wood > 0.16: continue
        # skip low-contrast blobs (ground decals, road bits): need an ink contour
        rim = m & ~cv2.erode(m.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        if (ink5 & rim).sum() < 0.6 * rim.sum(): continue
        # rim un-blend against ground: outer 2 px ring
        ring = cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~m
        alpha = m.astype(np.float32)
        col = rgb.copy()
        inkc = np.array([0.12, 0.09, 0.08])
        ra = np.clip((LG - L) / np.maximum(LG - 30, 1), 0, 1)
        on_ground = ring & (a > 0.98)
        alpha[on_ground] = ra[on_ground]
        col[on_ground] = inkc
        off = ring & (a <= 0.98)                       # overhang rim: the art's own alpha
        alpha[off] = a[off]
        # cast shadow: ground darker than the local ground, near and below the prop
        near = cv2.dilate(m.astype(np.uint8), np.ones((31, 31), np.uint8)).astype(bool) & ~m & ~ring
        sh = np.clip(1 - L / np.maximum(LG, 1), 0, 0.55)
        sh[~near | ~ground | (L < 115)] = 0           # soft shade only, never ink lines
        sh[sh < 0.07] = 0
        # keep only shadow connected to the prop
        shm = (sh > 0).astype(np.uint8)
        nn, sl, _, _ = cv2.connectedComponentsWithStats(shm | m.astype(np.uint8), 8)
        keep = np.isin(sl, np.unique(sl[m]))
        sh[~keep] = 0
        alpha = np.maximum(alpha, sh)
        col = np.where((sh > alpha - 1e-6)[..., None] & ~m[..., None] & ~ring[..., None], 0.0, col)
        ys, xs = np.nonzero(alpha > 0.01)
        x0, x1, y0, y1 = xs.min() - 1, xs.max() + 2, ys.min() - 1, ys.max() + 2
        crop = np.dstack([col, alpha])[y0:y1, x0:x1]
        # anchor: bottom of the solid prop (its ground contact), centred
        mys, mxs = np.nonzero(m[y0:y1, x0:x1])
        foot = mys.max()
        ax = float(np.median(mxs[mys > foot - 6]))
        out.append(dict(img=crop, ax=round(ax, 1), ay=int(foot), w=int(x1 - x0), h=int(y1 - y0), area=int(area),
                        src=[int(x), int(y)]))
    # ground palette
    gp = (rgb[ground] * 255).reshape(-1, 3).astype(np.float32)
    gp = gp[np.random.default_rng(0).choice(len(gp), min(len(gp), 40000), replace=False)]
    _, lbl, ctr = cv2.kmeans(gp, 5, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    share = np.bincount(lbl.ravel(), minlength=5) / len(lbl)
    pal = sorted([(float(s), [int(c) for c in ctr[i]]) for i, s in enumerate(share)], reverse=True)
    return out, pal


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):                       # stale cut-outs from a previous run
        if f.endswith('.avif'): os.remove(os.path.join(OUT, f))
    meta = {'props': {}, 'ground': {}}
    man = json.load(open(os.path.join(ROOT, 'assets', 'manifest.json')))
    for fam, biome in BIOME.items():
        allp = []
        for st in (0, 1, 2):
            props, pal = extract(f'{fam}_{st}', man['tiles'][f'{fam}_{st}'])
            if st == 0: meta['ground'][biome] = pal
            allp += [dict(p, tile=f'{fam}_{st}') for p in props if (f'{fam}_{st}', *p['src']) not in EXCLUDE]
        allp.sort(key=lambda p: -p['area'])
        for i, p in enumerate(allp):
            nm = f'{biome}_{i}'
            a8 = (np.clip(p['img'], 0, 1) * 255 + 0.5).astype(np.uint8)
            a8[a8[..., 3] == 0, :3] = 0
            Image.fromarray(a8, 'RGBA').save(os.path.join(OUT, nm + '.avif'), 'AVIF', quality=95, subsampling='4:4:4', speed=4)
            meta['props'][nm] = dict(file=f'props/{nm}.avif', biome=biome, w=p['w'], h=p['h'], ax=p['ax'], ay=p['ay'], area=p['area'], tile=p['tile'], src=p['src'])
        print(biome, len(allp), 'props; ground', meta['ground'][biome][:3])
    json.dump(meta, open(os.path.join(ROOT, 'assets', 'props.json'), 'w'), indent=1)
    write_art_js()


if __name__ == '__main__':
    main()

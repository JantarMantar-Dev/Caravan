"""Reference-art ingest: cut each goods sheet into layered, game-ready assets.

For every sheet in assets/ref/<family>.png (white background, 3 hex tiles on top,
goods icon + wagon below) this writes:

  assets/hex/<family>_<stage>.avif   hex tile normalised to the engine's hex
                                     (R = 283 world units, regular), overhang kept
  assets/hex/<family>_icon.avif      goods icon, background removed
  assets/hex/<family>_wagon.avif     caravan wagon, background removed
  assets/manifest.json               anchors + fit quality for every asset

Layers are split at render time from the same texture: pixels inside the hex
polygon are the ground layer, pixels outside it (trees, roofs, lighthouse) are
the overhang layer that must draw over the neighbouring hex.

Usage: python3 tools/ingest.py
"""
import json
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'assets', 'ref')
OUT = os.path.join(ROOT, 'assets', 'hex')
FAMILIES = ['fish', 'apple', 'wool', 'spice']
HEX_R = 283.0                     # engine hex circumradius, world units
WHITE_T = 235                     # min channel above this = paper
AVIF_Q = 95


def paper_mask(im):
    """True where the pixel is background paper connected to the sheet border."""
    near_white = (im.min(axis=2) > WHITE_T).astype(np.uint8) * 255
    h, w = near_white.shape
    ff = near_white.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if ff[y, x] == 255:
            cv2.floodFill(ff, mask, (x, y), 128)
    return ff == 128


def hex_poly(cx, cy, r, sy):
    return np.array([(cx + np.cos(np.pi / 6 + k * np.pi / 3) * r,
                      cy - np.sin(np.pi / 6 + k * np.pi / 3) * r * sy) for k in range(6)], np.float32)


def fit_hex(m):
    """Fit a pointy-top hex (centre, radius, vertical squash) to a tile mask.
    Width comes from the straight side edges, the bottom vertex pins the centre,
    and the squash is searched by IoU over the lower part (no overhang there)."""
    ys, xs = np.nonzero(m)
    y0, y1 = ys.min(), ys.max()
    h = y1 - y0
    band = m[y0 + h // 3: y0 + 2 * h // 3]
    ls = [np.flatnonzero(r).min() for r in band if r.any()]
    rs = [np.flatnonzero(r).max() for r in band if r.any()]
    left, right = float(np.median(ls)), float(np.median(rs))
    r = (right - left + 1) / np.sqrt(3)
    cx = (left + right) / 2
    best = None
    for sy in np.arange(0.84, 1.06, 0.0025):
        cy = y1 + 0.5 - r * sy
        poly = np.zeros_like(m, np.uint8)
        cv2.fillPoly(poly, [(hex_poly(cx, cy, r, sy) * 16).astype(np.int32)], 1, shift=4)
        top = int(cy - 0.3 * r * sy)
        inter = (poly[top:] & m[top:]).sum()
        union = (poly[top:] | m[top:]).sum()
        iou = inter / union
        if best is None or iou > best[0]:
            best = (iou, sy, cy)
    iou, sy, cy = best
    return dict(cx=cx, cy=cy, r=r, sy=sy, iou=float(iou))


def cutout(im, comp):
    """RGBA cut-out of one component. Interior is opaque; the outer rim is
    un-blended from white ("colour to alpha") so ink edges stay crisp with no
    white halo on any background."""
    m = comp.astype(np.uint8)
    rim_in = m & (1 - cv2.erode(m, np.ones((3, 3), np.uint8), iterations=2))
    rim_out = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=1) & (1 - m)
    rim = (rim_in | rim_out).astype(bool)
    f = im.astype(np.float32) / 255.0
    a = np.where(m.astype(bool), 1.0, 0.0)
    ca = (1.0 - f).max(axis=2)                       # alpha that explains the colour over white
    a = np.where(rim, ca, a)
    a = np.clip(a, 0, 1)
    with np.errstate(divide='ignore', invalid='ignore'):
        un = (f - (1.0 - a[..., None])) / np.maximum(a[..., None], 1e-4)
    col = np.where(rim[..., None], np.clip(un, 0, 1), f)
    return np.dstack([col, a])                       # straight (non-premultiplied) RGBA float


def warp_rgba(rgba, mtx, size):
    """Resample straight RGBA through premultiplied space (no dark/white fringes)."""
    pm = rgba.copy()
    pm[..., :3] *= pm[..., 3:4]
    out = cv2.warpAffine(pm, mtx, size, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    out = np.clip(out, 0, 1)
    a = out[..., 3:4]
    rgb = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    return np.dstack([np.clip(rgb, 0, 1), a[..., 0]])


def save_img(path, rgba):
    """AVIF with full-resolution chroma. Lossy WebP is always 4:2:0, which
    smears colour across every ink line (review loop 1: mean dE 2.1 from the
    codec alone); AVIF 4:4:4 q95 is 1.4 at a similar size."""
    from PIL import Image
    a8 = (np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8)
    a8[a8[..., 3] == 0, :3] = 0
    Image.fromarray(a8, 'RGBA').save(path, 'AVIF', quality=AVIF_Q, subsampling='4:4:4', speed=4)


def edge_fit(m, fit):
    """Fit the six outline edges. Generated sheets are not regular hexes (side
    vertices sit higher, tops are taller, by 10-25 px), so one regular fit leaves
    the outline wobbling inside the engine hex. Each edge is probed along its
    normal where the outside is clean paper (no overhang reaching past it) and a
    robust line is fitted. Edges mostly hidden by overhang (palms, roofs) keep
    the direction of the opposite edge (the sheets are point-symmetric to ~2 px)
    and only fit their offset from the visible samples.
    Returns outer-boundary vertices (6x2, image coords) and per-edge support."""
    V = hex_poly(fit['cx'], fit['cy'], fit['r'], fit['sy'])
    C = V.mean(axis=0)
    h, w = m.shape
    axis = np.arange(-30, 40, 0.5)
    pts, normals = [], []
    for k in range(6):
        a, b = V[k], V[(k + 1) % 6]
        e = b - a
        n = np.array([e[1], -e[0]]); n /= np.linalg.norm(n)
        if np.dot((a + b) / 2 - C, n) < 0: n = -n
        P = []
        for t in np.linspace(0.1, 0.9, 160):
            q = a + e * t + n[None] * 0
            xy = (a + e * t)[None] + n[None] * axis[:, None]
            xi, yi = np.round(xy[:, 0]).astype(int), np.round(xy[:, 1]).astype(int)
            ok = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)
            prof = np.zeros(len(axis), bool)
            prof[ok] = m[yi[ok], xi[ok]]
            if prof[-1] or not prof[0]: continue          # overhang reaches past the probe
            last = np.flatnonzero(prof).max()
            if (~prof[:last]).any(): continue
            P.append(a + e * t + n * (axis[last] + 0.5))
        pts.append(np.array(P)); normals.append(n)

    def fit_line(P, d=None):
        keep = np.ones(len(P), bool)
        for _ in range(4):
            c = P[keep].mean(axis=0)
            if d is None:
                _, _, vt = np.linalg.svd(P[keep] - c); dd = vt[0]
            else:
                dd = d
            nn = np.array([-dd[1], dd[0]])
            if d is not None: c = c + nn * (np.median((P[keep] - c) @ nn))
            res = np.abs((P - c) @ nn)
            keep = res < max(1.0, 2.5 * np.median(res[keep]))
        return c, dd / np.linalg.norm(dd)

    support = [len(p) for p in pts]
    # side and lower edges (2..5) are always clean in the sheets: free fits
    lines = [None] * 6
    for k in (2, 3, 4, 5):
        lines[k] = fit_line(pts[k])
    # upper edges: overhang art (bushes, palms) bulges past the outline and only
    # ever pushes the probe outward, so take the innermost dense cluster of
    # samples along the normal, with the opposite edge's direction
    for k in (0, 1):
        d = lines[k + 3][1]
        nn = np.array([-d[1], d[0]])
        if np.dot(nn, normals[k]) < 0: nn = -nn
        P = pts[k]
        if len(P) >= 15:
            off = np.sort(P @ nn)
            cnt = np.searchsorted(off, off + 2.5) - np.arange(len(off))
            i0 = int(np.flatnonzero(cnt >= 15)[0]) if (cnt >= 15).any() else len(off) // 2
            sel = (P @ nn >= off[i0] - 0.5) & (P @ nn <= off[i0] + 3.0)
            c = P[sel].mean(axis=0)
            lines[k] = fit_line(P[sel], d) if sel.sum() >= 15 else (c, d)
        else:
            lines[k] = (V[k], V[(k + 1) % 6] - V[k])
    verts = []
    for k in range(6):
        (p1, d1), (p2, d2) = lines[(k - 1) % 6], lines[k]
        t1, _ = np.linalg.solve(np.array([d1, -d2]).T, p2 - p1)
        verts.append(p1 + d1 * t1)
    verts = np.array(verts, np.float64)
    if min(support[0], support[1]) < 100:
        # top edges mostly hidden (spice sheet): the sheets are point-symmetric,
        # so rebuild the top from the clean bottom half. The centre height comes
        # from how far each vertical side's outline visibly runs up.
        tops = []
        for k, v_lo in ((2, verts[3]), (5, verts[5])):
            p, d = lines[k]
            d = d if d[1] < 0 else -d                   # walk upward
            nrm = normals[k]
            last, gap, s = 0.0, 0.0, 0.0
            while s < 600 and gap < 8:
                q = v_lo + d * s
                xo, yo = np.round(q + nrm * 2.5).astype(int)
                xi, yi = np.round(q - nrm * 1.0).astype(int)
                ok = 0 <= yo < h and 0 <= xo < w and not m[yo, xo] and m[yi, xi]
                if ok: last, gap = s, 0.0
                else: gap += 0.5
                s += 0.5
            tops.append(last)
        side = max(tops)
        cx = (verts[2][0] + verts[3][0] + verts[5][0] + verts[0][0]) / 4
        cy = (verts[3][1] + verts[5][1]) / 2 - side / 2
        Cn = np.array([cx, cy])
        verts[0] = 2 * Cn - verts[3]
        verts[1] = 2 * Cn - verts[4]
        verts[2] = 2 * Cn - verts[5]
    return np.array(verts, np.float64), support


def ink_width(im, m, verts):
    """Median thickness of the dark outline just inside the fitted boundary."""
    C = verts.mean(axis=0)
    lum = im.astype(np.float32).mean(axis=2)
    ws = []
    for k in range(6):
        a, b = verts[k], verts[(k + 1) % 6]
        e = b - a; n = np.array([e[1], -e[0]]); n /= np.linalg.norm(n)
        if np.dot((a + b) / 2 - C, n) < 0: n = -n
        for t in np.linspace(0.15, 0.85, 40):
            p = a + e * t
            run = 0
            for s in np.arange(-0.5, -14, -0.5):
                x, y = p + n * s
                if lum[int(round(y)), int(round(x))] < 95: run += 0.5
                elif run > 0: break
            if run > 0: ws.append(run)
    return float(np.median(ws)) if ws else 4.0


def canon_verts(R):
    return np.array([(np.cos(np.pi / 6 + k * np.pi / 3) * R, -np.sin(np.pi / 6 + k * np.pi / 3) * R) for k in range(6)])


def sector_maps(dst_v, src_v, src_c, xs, ys):
    """Piecewise-affine inverse map: output point (centre-relative) -> source.
    Six triangle fans (centre, v_k, v_k+1), extended past the hex so overhang
    art follows the warp of the sector it sits in."""
    mx = np.zeros_like(xs); my = np.zeros_like(ys); done = np.zeros(xs.shape, bool)
    for k in range(6):
        D = np.array([dst_v[k], dst_v[(k + 1) % 6]]).T
        inv = np.linalg.inv(D)
        al = inv[0, 0] * xs + inv[0, 1] * ys
        be = inv[1, 0] * xs + inv[1, 1] * ys
        sel = (al >= -1e-6) & (be >= -1e-6) & ~done
        S0, S1 = src_v[k] - src_c, src_v[(k + 1) % 6] - src_c
        mx[sel] = (src_c[0] + al * S0[0] + be * S1[0])[sel]
        my[sel] = (src_c[1] + al * S0[1] + be * S1[1])[sel]
        done |= sel
    return mx.astype(np.float32), my.astype(np.float32)


def hex_sdf(xs, ys, R):
    """Signed distance to a pointy-top hex of circumradius R, inside positive."""
    A = R * np.sqrt(3) / 2
    d = np.full(xs.shape, -1e9)
    for k in range(6):
        a = k * np.pi / 3
        d = np.maximum(d, xs * np.cos(a) - ys * np.sin(a))
    return A - d


def borderless(rgba, sdf, half):
    """Map-mode variant: remove the sheet outline where the edge is clean (no
    overhang crossing it) so neighbouring hexes join on a faint seam instead of a
    double ink line. Inside band is inpainted from the tile, outside goes clear."""
    a = rgba[..., 3]
    over = (a > 0.5) & (sdf < -(half + 2.0))
    near_over = cv2.dilate(over.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
    band = (sdf > -(half + 3.0)) & (sdf < half + 2.5)
    clean = band & ~near_over
    rgb = (rgba[..., :3] * a[..., None] + (1 - a[..., None])) * 255
    rgb8 = np.clip(rgb + 0.5, 0, 255).astype(np.uint8)
    fill = cv2.inpaint(rgb8, clean.astype(np.uint8), 6, cv2.INPAINT_TELEA).astype(np.float32) / 255
    out = rgba.copy()
    out[..., :3] = np.where(clean[..., None], fill, rgba[..., :3])
    # anti-aliased hex boundary baked into alpha (the engine splits ground and
    # overhang with a hard step, so the soft edge has to come from the art)
    out[..., 3] = np.where(clean, np.clip(sdf + 0.5, 0.0, 1.0), a)
    return out


# Road exits of the town tiles: (edge, offset). Edge i is the engine direction
# (0 E, 1 NE, 2 NW, 3 W, 4 SW, 5 SE); offset runs along the edge tangent
# (y-up rotation of the edge normal by +90 deg), in world units from the edge
# midpoint. Found by scanning each edge for road-coloured runs (review loop 3),
# beach runs on the fishing tiles removed by eye.
PORTS = {
    'fish_1': [(2, 13.5), (0, -83.0)], 'fish_2': [(2, 17.5), (5, 112.5)],
    'apple_1': [(3, 80.0), (0, -80.0)], 'apple_2': [(3, 78.0), (0, -103.0)],
    'wool_1': [(3, 89.0), (0, -91.0)], 'wool_2': [(3, 92.0), (0, -91.0)],
    'spice_1': [(3, 92.0), (5, -5.0)], 'spice_2': [(3, 95.0), (5, -16.0)],
}
ROAD_COLS = np.array([[254, 237, 194], [251, 211, 138], [252, 226, 170]], float)


def port_point(edge, off, inset=0.0):
    """Hex-local, y-down point of a road exit (inset world units inside the edge)."""
    a = edge * np.pi / 3
    A = HEX_R * np.sqrt(3) / 2 - inset
    up = np.array([np.cos(a), np.sin(a)]) * A + np.array([-np.sin(a), np.cos(a)]) * off
    return np.array([up[0], -up[1]])


def road_path(rgb, ox, oy, ports):
    """Centre line of the painted road between the two exits: cheapest path
    over a cost map that is low on road colour and lowest at the road's middle."""
    from skimage.graph import route_through_array
    d = np.min(np.linalg.norm(rgb[..., None, :] * 255 - ROAD_COLS[None, None], axis=3), axis=2)
    road = (d < 34).astype(np.uint8)
    road = cv2.morphologyEx(road, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    dt = cv2.distanceTransform(road, cv2.DIST_L2, 5)
    cost = np.where(road > 0, 1.0 + 8.0 * np.exp(-dt / 6.0), 60.0)
    pts = [port_point(e, o, 6) + [ox, oy] for e, o in ports]
    (x0, y0), (x1, y1) = pts
    path, _ = route_through_array(cost, (int(round(y0)), int(round(x0))), (int(round(y1)), int(round(x1))), fully_connected=True, geometric=True)
    path = np.array(path, float)[:, ::-1] - [ox, oy]
    path = cv2.GaussianBlur(path.reshape(-1, 1, 2), (1, 0), sigmaX=0, sigmaY=6).reshape(-1, 2) if len(path) > 20 else path
    keep = [0]
    for i in range(1, len(path)):
        if np.linalg.norm(path[i] - path[keep[-1]]) >= 8: keep.append(i)
    if keep[-1] != len(path) - 1: keep.append(len(path) - 1)
    out = [port_point(*ports[0])] + [path[i] for i in keep] + [port_point(*ports[1])]
    return [[round(float(x), 1), round(float(y), 1)] for x, y in out]


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {'hexR': HEX_R, 'tiles': {}, 'items': {}}
    for fam in FAMILIES:
        im = cv2.cvtColor(cv2.imread(os.path.join(REF, f'{fam}.png')), cv2.COLOR_BGR2RGB)
        fg = (~paper_mask(im)).astype(np.uint8)
        n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
        comps = [i for i in range(1, n) if stats[i][4] > 2000]
        tiles = sorted([i for i in comps if stats[i][4] > 150000], key=lambda i: stats[i][0])
        items = sorted([i for i in comps if i not in tiles], key=lambda i: stats[i][0])
        assert len(tiles) == 3 and len(items) == 2, (fam, len(tiles), len(items))

        for stage, i in enumerate(tiles):
            comp = lab == i
            fit = fit_hex(comp)
            sv, support = edge_fit(comp, fit)
            sc = sv.mean(axis=0)
            r_src = float(np.mean(np.linalg.norm(sv - sc, axis=1)))
            w_src = ink_width(im, comp, sv)
            half = 0.5 * w_src * HEX_R / r_src
            # the outline's centre line lands exactly on the engine hex (R = HEX_R)
            dv = canon_verts(HEX_R + half / np.cos(np.pi / 6))
            rgba = cutout(im, comp)
            pm = rgba.copy(); pm[..., :3] *= pm[..., 3:4]
            # output canvas: bound the forward-mapped component generously
            x, y, w, h, _ = stats[i]
            k_ = HEX_R / r_src
            pad = 40
            left = int(np.floor(min((x - sc[0]) * k_, -HEX_R)) - pad)
            top = int(np.floor(min((y - sc[1]) * k_, -HEX_R)) - pad)
            right = int(np.ceil(max((x + w - sc[0]) * k_, HEX_R)) + pad)
            bot = int(np.ceil(max((y + h - sc[1]) * k_, HEX_R)) + pad)
            W, H = right - left, bot - top
            ox, oy = -left, -top
            gx, gy = np.meshgrid(np.arange(W, dtype=np.float64) + left, np.arange(H, dtype=np.float64) + top)
            mx, my = sector_maps(dv, sv, sc, gx, gy)
            out = cv2.remap(pm.astype(np.float32), mx, my, cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            out = np.clip(out, 0, 1)
            al = out[..., 3:4]
            out = np.dstack([np.where(al > 1e-4, out[..., :3] / np.maximum(al, 1e-4), 0).clip(0, 1), al[..., 0]])
            # trim empty margins
            ys_, xs_ = np.nonzero(out[..., 3] > 0.004)
            x0, x1, y0, y1 = max(0, xs_.min() - 2), xs_.max() + 3, max(0, ys_.min() - 2), ys_.max() + 3
            out = out[y0:y1, x0:x1]; gx = gx[y0:y1, x0:x1]; gy = gy[y0:y1, x0:x1]
            ox, oy = ox - x0, oy - y0
            name = f'{fam}_{stage}'
            save_img(os.path.join(OUT, name + '.avif'), out)
            save_img(os.path.join(OUT, name + '_m.avif'), borderless(out, hex_sdf(gx, gy, HEX_R), half))
            if name in PORTS:
                extra = dict(ports=[dict(edge=e, off=o) for e, o in PORTS[name]], road=road_path(out[..., :3], ox, oy, PORTS[name]))
            else:
                extra = {}
            manifest['tiles'][name] = dict(**extra, file=f'hex/{name}.avif', map=f'hex/{name}_m.avif', w=int(out.shape[1]), h=int(out.shape[0]),
                                           ox=float(ox), oy=float(oy), ink=round(2 * half, 2),
                                           src=dict(verts=[[round(float(a), 2), round(float(b), 2)] for a, b in sv],
                                                    support=support, iou=round(fit['iou'], 4)))

        for kind, i in zip(['icon', 'wagon'], items):
            comp = lab == i
            # keep the soft drop shadow: it is part of the component already
            x, y, w, h, _ = stats[i]
            rgba = cutout(im, comp)[y - 2:y + h + 2, x - 2:x + w + 2]
            name = f'{fam}_{kind}'
            save_img(os.path.join(OUT, name + '.avif'), rgba)
            manifest['items'][name] = dict(file=f'hex/{name}.avif', w=int(w + 4), h=int(h + 4),
                                           ax=int(w // 2 + 2), ay=int(h + 2),
                                           src=dict(x=int(x), y=int(y), w=int(w), h=int(h)))
        print(fam, [(manifest['tiles'][f'{fam}_{s}']['ink'], manifest['tiles'][f'{fam}_{s}']['src']['support']) for s in range(3)])
    with open(os.path.join(ROOT, 'assets', 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    write_art_js()


def write_art_js():
    """Static import list so the bundler inlines every image (tiles, items and,
    once tools/props.py has run, the cut-out props)."""
    manifest = json.load(open(os.path.join(ROOT, 'assets', 'manifest.json')))
    pj = os.path.join(ROOT, 'assets', 'props.json')
    props = json.load(open(pj))['props'] if os.path.exists(pj) else {}
    files = sorted({v['file'] for v in manifest['tiles'].values()} | {v['map'] for v in manifest['tiles'].values()}
                   | {v['file'] for v in manifest['items'].values()} | {v['file'] for v in props.values()})
    with open(os.path.join(ROOT, 'assets', 'art.js'), 'w') as f:
        f.write('// generated by tools/ingest.py\n')
        for i, fn in enumerate(files): f.write(f"import a{i} from './{fn}';\n")
        f.write('export { default as manifest } from \'./manifest.json\';\n')
        f.write("export { default as props } from './props.json';\n" if props else 'export const props = { props: {}, ground: {} };\n')
        f.write('export const files = {\n' + ''.join(f"  '{fn}': a{i},\n" for i, fn in enumerate(files)) + '};\n')

if __name__ == '__main__':
    main()

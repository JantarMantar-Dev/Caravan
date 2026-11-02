"""Rebuilt assets: parametric redraws of structures the generated art gets
physically wrong (posts of random height, decks that change width, planks that
don't line up), drawn in the tile's own projection with the palette and stroke
weights sampled from the reference so they sit in the same hand.

Everything is drawn 4x supersampled in premultiplied RGBA and box-filtered
down, the way the reference's ink lines are anti-aliased.

Projection: the tile's ground axes measured from its ink (Hough peaks, see
docs/review/layers/README.md): u runs down-right at `au` degrees, v up-right at
`av` degrees, z is screen-up; one unit is one screen pixel along each axis.
"""
import numpy as np
import cv2

SS = 4
INK = np.array([28, 20, 14]) / 255


def rgb(c):
    return np.array(c, np.float32) / 255


class Canvas:
    """Premultiplied RGBA canvas at SS x resolution over a box of the tile;
    draw calls take tile px."""

    def __init__(self, W, H, box=None):
        x0, y0, x1, y1 = box if box is not None else (0, 0, W, H)
        x0, y0 = max(int(np.floor(x0)), 0), max(int(np.floor(y0)), 0)
        x1, y1 = min(int(np.ceil(x1)), W), min(int(np.ceil(y1)), H)
        self.x0, self.y0, self.W, self.H = x0, y0, x1 - x0, y1 - y0
        self.px = np.zeros((self.H * SS, self.W * SS, 4), np.float32)

    def mask(self, pts, closed=True, width=0):
        m = np.zeros(self.px.shape[:2], np.uint8)
        p = np.round((np.asarray(pts, np.float64) - [self.x0, self.y0]) * SS * 16).astype(np.int32)
        if width:
            cv2.polylines(m, [p], closed, 255, int(round(width * SS)), cv2.LINE_8, shift=4)
        else:
            cv2.fillPoly(m, [p], 255, cv2.LINE_8, shift=4)
        return m.astype(np.float32) / 255

    def ellipse_mask(self, c, rx, ry, width=0, a0=0, a1=360):
        m = np.zeros(self.px.shape[:2], np.uint8)
        cc = (int(round((c[0] - self.x0) * SS * 16)), int(round((c[1] - self.y0) * SS * 16)))
        ax = (int(round(rx * SS * 16)), int(round(ry * SS * 16)))
        cv2.ellipse(m, cc, ax, 0, a0, a1, 255, -1 if not width else int(round(width * SS)), cv2.LINE_8, shift=4)
        return m.astype(np.float32) / 255

    def paint(self, m, col, alpha=1.0):
        """Composite colour (rgb, or an HxWx3 array) over the canvas under mask m."""
        a = m * alpha
        if np.ndim(col) == 1: col = np.broadcast_to(col, self.px.shape[:2] + (3,))
        self.px[..., :3] = col * a[..., None] + self.px[..., :3] * (1 - a[..., None])
        self.px[..., 3] = a + self.px[..., 3] * (1 - a)

    def coords(self):
        ys, xs = np.mgrid[0:self.H * SS, 0:self.W * SS].astype(np.float32)
        return (xs + 0.5) / SS + self.x0, (ys + 0.5) / SS + self.y0

    def down(self):
        """Box filter to tile resolution; straight (un-premultiplied) colour and
        alpha of the box (its origin is x0, y0)."""
        p = cv2.resize(self.px, (self.W, self.H), interpolation=cv2.INTER_AREA)
        a = p[..., 3]
        col = np.where(a[..., None] > 1e-4, p[..., :3] / np.maximum(a[..., None], 1e-4), 0)
        return np.clip(col, 0, 1), np.clip(a, 0, 1)


def noise1(x, seed, scale):
    """Smooth 1D value noise, vectorised."""
    rng = np.random.default_rng(seed)
    tab = rng.random(4096).astype(np.float32)
    t = x / scale
    i = np.floor(t).astype(np.int64)
    f = t - i
    f = f * f * (3 - 2 * f)
    return tab[i % 4096] * (1 - f) + tab[(i + 1) % 4096] * f


# ---------------------------------------------------------------------------
# Dock / pier

DOCK_PAL = dict(
    plank=[(215, 148, 77), (199, 135, 68), (229, 164, 90), (206, 141, 72), (186, 125, 63)],
    hi=(245, 195, 116), seam=(96, 62, 32), fascia=(132, 85, 42), fascia_lo=(98, 62, 31),
    end=(112, 72, 36), post=[(232, 168, 94), (201, 136, 69), (150, 99, 50)], post_top=(240, 186, 110),
    ring=(176, 116, 58), shadow=(16, 78, 125), wet=(52, 96, 128), foam=(246, 252, 255),
)


def dock(spec, W, H, ox, oy, water):
    """A pier of rectangular deck segments on round piles.

    spec: origin [x, y] tile image px of the deck's front-left top corner; au, av axis angles; segments [[u0, u1, v0,
          v1], ...] in deck units; height (deck top above water), thickness,
          plank (plank width), post_r, post_gap, post_up (protrusion), seed.
    water: HxW bool water mask (for the cast shadow).
    Returns dict(parts=[(id, kind, Canvas)], stand=[(x, y, r)]) in tile px.
    """
    au, av = np.radians(spec.get('au', -18)), np.radians(spec.get('av', 28))
    eu = np.array([np.cos(au), -np.sin(au)])
    ev = np.array([np.cos(av), -np.sin(av)])
    O = np.array(spec['origin'], np.float64)
    Hd = spec.get('height', 40)
    T = spec.get('thickness', 8)
    pw = spec.get('plank', 9)
    pr = spec.get('post_r', 6.2)
    gap = spec.get('post_gap', 44)
    up = spec.get('post_up', 12)
    segs = spec['segments']
    pal = {k: (rgb(v) if np.ndim(v) == 1 else [rgb(c) for c in v]) for k, v in DOCK_PAL.items()}
    rng = np.random.default_rng(spec.get('seed', 7))

    P = lambda u, v, z=0.0: O + u * eu + v * ev + np.array([0, -z])

    def box(pts, pad=5):
        p = np.asarray(pts)
        return (p[:, 0].min() - pad, p[:, 1].min() - pad, p[:, 0].max() + pad, p[:, 1].max() + pad)

    def free_span(si, u, a, b, side):
        """Parts of the edge u=const, v in [a, b] of segment si that no
        neighbouring segment continues (side +1: the u1 edge, -1: the u0 edge)."""
        spans = [(a, b)]
        for j, (s0, s1, w0, w1) in enumerate(segs):
            if j == si or abs((s0 if side > 0 else s1) - u) > 1e-6: continue
            nxt = []
            for p, q in spans:
                if w1 <= p or w0 >= q: nxt.append((p, q)); continue
                if w0 > p: nxt.append((p, w0))
                if w1 < q: nxt.append((w1, q))
            spans = nxt
        return [(p, q) for p, q in spans if q - p > 0.5]

    def covered(si, u, v, side):
        return not free_span(si, u, v - 0.1, v + 0.1, side)

    parts = []
    # --- frame: cast shadow on the water and the cross beams under the deck
    corners = [P(u, v, z) for u0, u1, v0, v1 in segs for u in (u0, u1) for v in (v0, v1) for z in (0, -Hd)]
    frame = Canvas(W, H, box(corners, 8))
    wm = cv2.resize(water[frame.y0:frame.y0 + frame.H, frame.x0:frame.x0 + frame.W].astype(np.float32),
                    (frame.W * SS, frame.H * SS), interpolation=cv2.INTER_NEAREST)
    for u0, u1, v0, v1 in segs:
        sh = [P(u0, v0, -Hd) + [3, 0], P(u1, v0, -Hd) + [3, 0], P(u1, v1, -Hd) + [3, 0], P(u0, v1, -Hd) + [3, 0]]
        under = [P(u0, v0, -T), P(u1, v0, -T), P(u1, v0, -Hd), P(u0, v0, -Hd)]
        m = np.maximum(frame.mask(sh), frame.mask(under))
        frame.paint(m * wm, pal['shadow'], 0.5)
    parts.append(('frame', 'dock', frame))

    # --- piles: on every segment corner and along the long edges at an even spacing
    posts = []
    seen = set()
    for u0, u1, v0, v1 in segs:
        n = max(1, int(round((u1 - u0) / gap)))
        for v in (v0, v1):
            for k in range(n + 1):
                u = u0 + (u1 - u0) * k / n
                key = (round(u), round(v))
                if key in seen: continue
                seen.add(key)
                corner = k in (0, n)
                posts.append((u, v, corner))
        nv = max(1, int(round((v1 - v0) / gap)))
        for k in range(1, nv):
            for u in (u0, u1):
                v = v0 + (v1 - v0) * k / nv
                if (round(u), round(v)) not in seen:
                    seen.add((round(u), round(v))); posts.append((u, v, False))
    # inset the piles so they hug the deck edge like real piling
    def inset(u, v):
        uu = min(max(u, min(s[0] for s in segs) + pr * 0.6), max(s[1] for s in segs) - pr * 0.6)
        return uu, v + (pr * 0.55 if v == min(s[2] for s in segs) else -pr * 0.55 if v > 0 else pr * 0.55)

    def post_canvas(base, top):
        return Canvas(W, H, (base[0] - pr - 7, top[1] - pr - 4, base[0] + pr + 7, base[1] + pr + 5))

    def draw_post(c, base, top, corner):
        x, yb = base
        yt = top[1]
        xs, ys = c.coords()
        body = c.mask([(x - pr, yt), (x + pr, yt), (x + pr, yb), (x - pr, yb)])
        body = np.maximum(body, c.ellipse_mask((x, yb), pr, pr * 0.42))
        t = (xs - x) / pr
        col = np.where((t < -0.38)[..., None], pal['post'][0], np.where((t < 0.34)[..., None], pal['post'][1], pal['post'][2]))
        # grain: a few vertical cracks
        g = noise1(xs * 3.1 + 17 * x, int(x * 13) % 997, 1.7)
        col = col * (0.94 + 0.08 * g[..., None])
        c.paint(body, col)
        in_water = water[int(min(max(yb, 0), water.shape[0] - 1)), int(min(max(x, 0), water.shape[1] - 1))]
        # wet foot: the bottom stays darker where the water laps
        if in_water:
            wet = body * np.clip((ys - (yb - 7)) / 3, 0, 1)
            c.paint(wet, pal['wet'], 0.45)
        for k in range(2):
            cx = x + rng.uniform(-0.5, 0.4) * pr
            y0 = rng.uniform(yt + 5, (yt + yb) / 2)
            c.paint(c.mask([(cx, y0), (cx + 0.2, y0 + rng.uniform(5, 10))], False, 1.0), pal['fascia_lo'], 0.7)
        top_m = c.ellipse_mask((x, yt), pr, pr * 0.42)
        c.paint(top_m, pal['post_top'])
        c.paint(c.ellipse_mask((x, yt), pr * 0.55, pr * 0.22, width=0.9), pal['ring'])
        # outline: silhouette and the top rim
        c.paint(c.mask([(x - pr, yt), (x - pr, yb)], False, 2.2), INK)
        c.paint(c.mask([(x + pr, yt), (x + pr, yb)], False, 2.2), INK)
        c.paint(c.ellipse_mask((x, yt), pr, pr * 0.42, width=2.0), INK)
        c.paint(c.ellipse_mask((x, yb), pr, pr * 0.42, width=2.0, a0=0, a1=180), INK)
        # foam crescent where it meets the water (the shader animates rings on top)
        if in_water: c.paint(c.ellipse_mask((x, yb + 1.5), pr + 3.5, pr * 0.55 + 1.5, width=1.8, a0=10, a1=170), pal['foam'], 0.95)

    back, front = [], []
    vmin = min(s[2] for s in segs)
    for u, v, corner in posts:
        uu, vv = inset(u, v)
        base = P(uu, vv, -Hd)
        top = P(uu, vv, up + (6 if corner else 0))
        is_front = abs(v - vmin) < 1e-6 or u == max(s[1] for s in segs)
        if not is_front and not corner: continue           # hidden under the deck
        (front if is_front else back).append((uu, vv, base, top, corner))
    stand = []
    for i, (uu, vv, base, top, corner) in enumerate(sorted(back, key=lambda p: p[2][1])):
        c = post_canvas(base, top)
        draw_post(c, base, top, corner)
        parts.append((f'pile_b{i + 1}', 'post', c))
        if water[int(min(base[1], H - 1)), int(min(base[0], W - 1))]: stand.append((base[0] - ox, base[1] - oy, pr))

    # --- deck: planks across the deck (along v), butt joints staggered,
    # dropped as slabs of a few planks so the build reads plank by plank
    slab_n = spec.get('slab', 6)
    for si, (u0, u1, v0, v1) in enumerate(segs):
        planks = int(np.ceil((u1 - u0) / pw))
        for s0 in range(0, planks, slab_n):
            fa0, fa1 = u0 + s0 * pw, min(u1, u0 + (s0 + slab_n) * pw)
            c = Canvas(W, H, box([P(u, v, z) for u in (fa0, fa1) for v in (v0, v1) for z in (0, -T)], 4))
            xs, ys = c.coords()
            for k in range(s0, min(planks, s0 + slab_n)):
                a0, a1 = u0 + k * pw, min(u1, u0 + (k + 1) * pw)
                m = c.mask([P(a0, v0), P(a1, v0), P(a1, v1), P(a0, v1)])
                base_c = pal['plank'][rng.integers(len(pal['plank']))]
                # grain runs along the plank: noise across it
                d = (xs - O[0]) * eu[0] + (ys - O[1]) * eu[1]          # ~u coordinate
                g = noise1(d * 6.0 + k * 31, 100 + k + 50 * si, 2.3) - 0.5
                col = base_c * (1 + 0.09 * g[..., None])
                c.paint(m, col)
                # highlight on the leading edge, seam on the trailing edge
                c.paint(c.mask([P(a0 + 0.8, v0), P(a0 + 0.8, v1)], False, 1.0), pal['hi'], 0.9)
                c.paint(c.mask([P(a1, v0), P(a1, v1)], False, 1.5), pal['seam'])
                # butt joints every ~24 units, staggered by plank parity
                nj = max(1, int(round((v1 - v0) / 24)))
                for j in range(1, nj + 1):
                    jv = v0 + (v1 - v0) * (j - (0.5 if k % 2 else 0.0)) / nj
                    if v0 + 3 < jv < v1 - 3:
                        c.paint(c.mask([P(a0, jv), P(a1, jv)], False, 1.4), pal['seam'])
                # nails at the beams
                for vn in (v0 + 3, v1 - 3):
                    q = P((a0 + a1) / 2, vn)
                    c.paint(c.ellipse_mask(q, 0.75, 0.55), pal['seam'])
            # fascia under this slab's stretch of the front edge
            if abs(v0 - vmin) < 1e-6 or True:
                f = [P(fa0, v0), P(fa1, v0), P(fa1, v0, -T), P(fa0, v0, -T)]
                fm = c.mask(f)
                yy = (ys - P(0, v0)[1])
                c.paint(fm, pal['fascia'])
                c.paint(fm * (c.mask([P(fa0, v0, -T * 0.55), P(fa1, v0, -T * 0.55), P(fa1, v0, -T), P(fa0, v0, -T)])), pal['fascia_lo'])
                c.paint(c.mask([P(fa0, v0, -1.2), P(fa1, v0, -1.2)], False, 1.0), pal['hi'], 0.6)
            if fa1 >= u1 - 1e-6:                                  # end face at the far end
                for a, b in free_span(si, u1, v0, v1, +1):
                    c.paint(c.mask([P(u1, a), P(u1, b), P(u1, b, -T), P(u1, a, -T)]), pal['end'])
            # outline: the slab's outer edges only (inner seams stay brown)
            edges = [[P(fa0, v0), P(fa1, v0)], [P(fa0, v1), P(fa1, v1)], [P(fa0, v0, -T), P(fa1, v0, -T)]]
            if fa0 <= u0 + 1e-6:
                for a, b in free_span(si, u0, v0, v1, -1): edges += [[P(u0, a), P(u0, b)]]
                if not covered(si, u0, v0, -1): edges += [[P(u0, v0), P(u0, v0, -T)]]
            if fa1 >= u1 - 1e-6:
                for a, b in free_span(si, u1, v0, v1, +1):
                    edges += [[P(u1, a), P(u1, b)], [P(u1, a, -T), P(u1, b, -T)], [P(u1, b), P(u1, b, -T)], [P(u1, a), P(u1, a, -T)]]
            for e in edges:
                c.paint(c.mask(e, False, 2.2), INK)
            # where segments meet, the joined deck has no outline: repaint plank
            # colour over outline that falls inside another segment's top
            parts.append((f'deck_{si + 1}_{s0 // slab_n + 1}', 'deck', c))

    for i, (uu, vv, base, top, corner) in enumerate(sorted(front, key=lambda p: p[2][0])):
        c = post_canvas(base, top)
        draw_post(c, base, top, corner)
        parts.append((f'pile_f{i + 1}', 'post', c))
        if water[int(min(base[1], H - 1)), int(min(base[0], W - 1))]: stand.append((base[0] - ox, base[1] - oy, pr))
    return dict(parts=parts, stand=stand)


def dock_silhouette(spec, shape):
    """Deck top plus fascia of a dock spec, rasterised at 1x (for fitting)."""
    au, av = np.radians(spec['au']), np.radians(spec['av'])
    eu = np.array([np.cos(au), -np.sin(au)])
    ev = np.array([np.cos(av), -np.sin(av)])
    O = np.array(spec['origin'], np.float64)
    T = spec.get('thickness', 8)
    m = np.zeros(shape, np.uint8)
    for u0, u1, v0, v1 in spec['segments']:
        P = lambda u, v, z=0.0: O + u * eu + v * ev + np.array([0, -z])
        poly = [P(u0, v1), P(u0, v0), P(u0, v0, -T), P(u1, v0, -T), P(u1, v1, -T), P(u1, v1)]
        cv2.fillPoly(m, [np.round(np.array(poly) * 16).astype(np.int32)], 1, shift=4)
    return m.astype(bool)


def fit_dock(spec, target):
    """Fit the deck to the old dock's footprint: coordinate descent on the
    origin, the axis angles and the segment extents (all segments share the
    front edge v0, so the front stays one straight line), maximising IoU with
    the target mask (the old deck with its piles opened away)."""
    import copy
    s = copy.deepcopy(spec)
    s['segments'] = [list(map(float, g)) for g in s['segments']]

    def iou(sp):
        m = dock_silhouette(sp, target.shape)
        return (m & target).sum() / max((m | target).sum(), 1)

    def get(sp):
        v = [sp['origin'][0], sp['origin'][1], sp['au'], sp['av'], sp['segments'][0][2]]
        for g in sp['segments']: v += [g[0], g[1], g[3]]
        return v

    def put(v):
        sp = copy.deepcopy(s)
        sp['origin'] = [v[0], v[1]]; sp['au'] = v[2]; sp['av'] = v[3]
        for i, g in enumerate(sp['segments']):
            g[0], g[1], g[2], g[3] = v[5 + 3 * i], v[6 + 3 * i], v[4], v[7 + 3 * i]
        # segments stay joined: each starts where the previous one ends
        for i in range(1, len(sp['segments'])):
            sp['segments'][i][0] = sp['segments'][i - 1][1]
        return sp

    v = get(s)
    # the axes may only settle near the tile's measured projection, so the
    # deck stays parallel to the houses next to it
    lim = {2: (s['au'] - 4, s['au'] + 4), 3: (s['av'] - 4, s['av'] + 4)}
    ok = lambda w: all(lo <= w[i] <= hi for i, (lo, hi) in lim.items())
    best = iou(put(v))
    steps = [4.0, 4.0, 1.5, 1.5, 4.0] + [6.0, 6.0, 6.0] * len(s['segments'])
    for it in range(60):
        improved = False
        for i in range(len(v)):
            for d in (+1, -1):
                w = list(v); w[i] += d * steps[i]
                if not ok(w): continue
                sc = iou(put(w))
                if sc > best + 1e-5:
                    v, best, improved = w, sc, True
        if not improved:
            steps = [st * 0.5 for st in steps]
            if max(steps) < 0.3: break
    out = put(v)
    out['fit_iou'] = round(float(best), 4)
    return out


# ---------------------------------------------------------------------------
# House: box walls + gable roof + chimney, doors and windows on the faces

HOUSE_PAL = dict(
    wall=(250, 240, 208), wall_side=(214, 199, 172), plinth=(174, 157, 130), speck=(192, 176, 153),
    roof=[(250, 106, 59), (249, 95, 50), (251, 117, 69), (240, 100, 55)], roof_dark=(190, 63, 31),
    roof_line=(148, 57, 30), roof_hi=(253, 150, 105), board=(150, 60, 32), board_side=(118, 46, 24),
    door=(167, 96, 33), door_line=(112, 64, 22), frame=(140, 100, 60), glass=(66, 52, 44), glass_hi=(120, 120, 130),
    step=(192, 176, 153), cap=(174, 157, 130), hole=(52, 40, 32),
)


def _hash(a, b, seed):
    h = np.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453
    return h - np.floor(h)


class HouseGeo:
    def __init__(self, sp):
        au, av = np.radians(sp['au']), np.radians(sp['av'])
        self.eu = np.array([np.cos(au), -np.sin(au)])
        self.ev = np.array([np.cos(av), -np.sin(av)])
        self.O = np.array(sp['origin'], np.float64)
        self.W, self.D, self.h = sp['w'], sp['d'], sp['h']
        self.rise, self.e = sp['rise'], sp.get('eave', 5)
        self.ridge = sp.get('roof', 'u')
        half = (self.D if self.ridge == 'u' else self.W) / 2
        self.ze = self.h - self.e * self.rise / half
        self.zr = self.h + self.rise

    def P(self, u, v, z=0.0):
        return self.O + u * self.eu + v * self.ev + np.array([0, -z])

    def faces(self):
        W, D, h, P = self.W, self.D, self.h, self.P
        front = [P(0, 0, 0), P(W, 0, 0), P(W, 0, h)]
        if self.ridge == 'v': front += [P(W / 2, 0, self.zr)]
        front += [P(0, 0, h)]
        side = [P(W, 0, 0), P(W, D, 0), P(W, D, h)]
        if self.ridge == 'u': side += [P(W, D / 2, self.zr)]
        side += [P(W, 0, h)]
        return front, side

    def slopes(self):
        """Roof slopes back to front, each (eave-left, eave-right, ridge-right, ridge-left)."""
        W, D, e, P, ze, zr = self.W, self.D, self.e, self.P, self.ze, self.zr
        if self.ridge == 'u':
            back = [P(W + e, D + e, ze), P(-e, D + e, ze), P(-e, D / 2, zr), P(W + e, D / 2, zr)]
            front = [P(-e, -e, ze), P(W + e, -e, ze), P(W + e, D / 2, zr), P(-e, D / 2, zr)]
        else:
            back = [P(-e, D + e, ze), P(-e, -e, ze), P(W / 2, -e, zr), P(W / 2, D + e, zr)]
            front = [P(W + e, -e, ze), P(W + e, D + e, ze), P(W / 2, D + e, zr), P(W / 2, -e, zr)]
        return back, front

    def silhouette(self, shape, chimney=None):
        m = np.zeros(shape, np.uint8)
        for poly in [*self.faces(), *self.slopes()]:
            cv2.fillPoly(m, [np.round(np.array(poly) * 16).astype(np.int32)], 1, shift=4)
        return m.astype(bool)


def house(spec, W, H, ox, oy, water):
    """A house in the tile's projection. Returns parts walls, roof, chimney,
    door(s) and windows, each its own canvas, in draw order."""
    g = HouseGeo(spec)
    pal = {k: (rgb(v) if np.ndim(v) == 1 else [rgb(c) for c in v]) for k, v in HOUSE_PAL.items()}
    for k, v in spec.get('palette', {}).items():
        pal[k] = rgb(v) if np.ndim(v) == 1 else [rgb(c) for c in v]
    seed = spec.get('seed', 1)
    P = g.P
    allpts = np.array([*g.faces()[0], *g.faces()[1], *g.slopes()[0], *g.slopes()[1]])
    box = (allpts[:, 0].min() - 10, allpts[:, 1].min() - 40, allpts[:, 0].max() + 10, allpts[:, 1].max() + 10)
    parts = []

    # --- walls (front lit, side in shade), plaster specks, plinth, corner ink
    c = Canvas(W, H, box)
    xs, ys = c.coords()
    front, side = g.faces()
    for poly, base in ((front, pal['wall']), (side, pal['wall_side'])):
        m = c.mask(poly)
        sp = (_hash(np.floor(xs * 1.3), np.floor(ys * 1.3), seed) > 0.965).astype(np.float32)
        col = np.broadcast_to(base, m.shape + (3,)).copy()
        col = col * (1 - 0.18 * sp[..., None]) + pal['speck'] * 0.18 * sp[..., None]
        c.paint(m, col)
    pl = 3.5
    c.paint(c.mask([P(0, 0, 0), P(g.W, 0, 0), P(g.W, 0, pl), P(0, 0, pl)]), pal['plinth'])
    c.paint(c.mask([P(g.W, 0, 0), P(g.W, g.D, 0), P(g.W, g.D, pl), P(g.W, 0, pl)]), pal['plinth'] * 0.85)
    for poly in (front, side):
        c.paint(c.mask(poly, True, 2.2), INK)
    parts.append(('walls', 'building', c))

    # --- openings, each its own part so they can drop in after the walls
    def face_pt(face, x, z):
        return P(x, 0, z) if face == 'front' else P(g.W, x, z)

    def arch(face, x0, w, z0, hgt, n=10):
        pts = [face_pt(face, x0, z0), face_pt(face, x0 + w, z0), face_pt(face, x0 + w, z0 + hgt - w / 2)]
        for k in range(1, n):
            a = np.pi * k / n
            pts.append(face_pt(face, x0 + w / 2 + np.cos(a) * w / 2, z0 + hgt - w / 2 + np.sin(a) * w / 2))
        pts.append(face_pt(face, x0, z0 + hgt - w / 2))
        return pts

    nd = nw = 0
    for op in spec.get('openings', []):
        face, kind = op.get('face', 'front'), op.get('kind', 'window')
        w = op.get('w', 11 if kind == 'door' else 7)
        flen = g.W if face == 'front' else g.D
        x0 = (op['at'] * flen if op['at'] <= 1 else op['at']) - w / 2
        hgt = op.get('h', 19 if kind == 'door' else 10)
        z0 = op.get('z', 0 if kind == 'door' else 11)
        shade = 1.0 if face == 'front' else 0.86
        pts = [face_pt(face, x0 - 2, z0 - 2), face_pt(face, x0 + w + 2, z0 - 2), face_pt(face, x0 + w + 2, z0 + hgt + 2), face_pt(face, x0 - 2, z0 + hgt + 2)]
        q = np.array(pts)
        oc = Canvas(W, H, (q[:, 0].min() - 8, q[:, 1].min() - 8, q[:, 0].max() + 8, q[:, 1].max() + 10))
        oxs, oys = oc.coords()
        if kind == 'door':
            nd += 1
            if face == 'front':
                oc.paint(oc.mask([P(x0 - 1.5, 0, 0), P(x0 + w + 1.5, 0, 0), P(x0 + w + 1.5, -5, 0), P(x0 - 1.5, -5, 0)]), pal['step'])
                oc.paint(oc.mask([P(x0 - 1.5, 0, 0), P(x0 + w + 1.5, 0, 0), P(x0 + w + 1.5, -5, 0), P(x0 - 1.5, -5, 0)], True, 1.6), INK)
            m = oc.mask(arch(face, x0, w, z0, hgt))
            oc.paint(m, pal['door'] * shade)
            for k in (1, 2):
                a = face_pt(face, x0 + w * k / 3, z0 + 1); b = face_pt(face, x0 + w * k / 3, z0 + hgt - 2)
                oc.paint(oc.mask([a, b], False, 1.0) * m, pal['door_line'])
            knob = face_pt(face, x0 + w * 0.78, z0 + hgt * 0.45)
            oc.paint(oc.ellipse_mask(knob, 0.9, 0.9), INK)
            oc.paint(oc.mask(arch(face, x0, w, z0, hgt), True, 2.0), INK)
            parts.append((f'door_{nd}', 'door', oc))
        else:
            nw += 1
            m = oc.mask(arch(face, x0, w, z0, hgt, 8))
            oc.paint(m, pal['frame'] * shade)
            inner = arch(face, x0 + 1.4, w - 2.8, z0 + 1.4, hgt - 2.8, 8)
            oc.paint(oc.mask(inner), pal['glass'])
            a = face_pt(face, x0 + w * 0.3, z0 + hgt * 0.75); b = face_pt(face, x0 + w * 0.3, z0 + hgt * 0.45)
            oc.paint(oc.mask([a, b], False, 1.2), pal['glass_hi'], 0.8)
            oc.paint(oc.mask([face_pt(face, x0 - 1, z0 - 0.5), face_pt(face, x0 + w + 1, z0 - 0.5)], False, 2.0), pal['plinth'])
            oc.paint(oc.mask(arch(face, x0, w, z0, hgt, 8), True, 1.8), INK)
            parts.append((f'window_{nw}', 'window', oc))

    # --- roof: tiles in staggered rows on each slope, boards on the edges
    rc = Canvas(W, H, box)
    xs, ys = rc.coords()
    back, frontS = g.slopes()
    for si, sl in enumerate((back, frontS)):
        A, B, C, Dd = [np.array(p) for p in sl]
        M = np.array([B - A, Dd - A]).T
        Mi = np.linalg.inv(M)
        a = Mi[0, 0] * (xs - A[0]) + Mi[0, 1] * (ys - A[1])
        b = Mi[1, 0] * (xs - A[0]) + Mi[1, 1] * (ys - A[1])
        L_eave = np.linalg.norm(B - A)
        span = (g.D if g.ridge == 'u' else g.W) / 2 + g.e
        L_slope = np.hypot(span, g.rise + g.e * g.rise / ((g.D if g.ridge == 'u' else g.W) / 2))
        nrows = max(2, int(round(L_slope / 7.5)))
        ntile = max(2, int(round(L_eave / 9)))
        row = np.floor(b * nrows)
        fb = b * nrows - row
        tcoord = a * ntile + 0.5 * (row % 2)
        tile = np.floor(tcoord)
        ft = tcoord - tile
        hv = _hash(row + 10 * si, tile, seed)
        roofs = pal['roof']
        col = np.zeros(xs.shape + (3,), np.float32)
        for k, rc_ in enumerate(roofs):
            sel = (hv * len(roofs)).astype(int) == k
            col[sel] = rc_
        lit = 1.0 if si == 1 else 0.86
        col *= lit
        # the lower lip of each row is darker (the next row overlaps it), a
        # highlight runs along the top of each tile, gaps between tiles
        col = np.where((fb < 0.2)[..., None], pal['roof_dark'] * lit, col)
        col = np.where(((fb > 0.82) & (fb < 0.92))[..., None], pal['roof_hi'] * lit, col)
        col = np.where(((ft < 0.07) & (fb > 0.2))[..., None], pal['roof_line'] * lit, col)
        m = rc.mask(sl)
        rc.paint(m, col)
        rc.paint(rc.mask(sl, True, 2.2), INK)
    # ridge cap
    if g.ridge == 'u':
        r0, r1 = P(-g.e, g.D / 2, g.zr), P(g.W + g.e, g.D / 2, g.zr)
    else:
        r0, r1 = P(g.W / 2, -g.e, g.zr), P(g.W / 2, g.D + g.e, g.zr)
    rc.paint(rc.mask([r0, r1], False, 4.0), pal['roof_dark'])
    rc.paint(rc.mask([r0, r1], False, 1.6), INK)
    # barge boards on the visible gable and the eave fascia
    t = 3.0
    if g.ridge == 'u':
        gab = [P(g.W + g.e, -g.e, g.ze), P(g.W + g.e, g.D / 2, g.zr), P(g.W + g.e, g.D + g.e, g.ze)]
        eave = [P(-g.e, -g.e, g.ze), P(g.W + g.e, -g.e, g.ze)]
    else:
        gab = [P(-g.e, -g.e, g.ze), P(g.W / 2, -g.e, g.zr), P(g.W + g.e, -g.e, g.ze)]
        eave = [P(g.W + g.e, -g.e, g.ze), P(g.W + g.e, g.D + g.e, g.ze)]
    for a, b in zip(gab[:-1], gab[1:]):
        poly = [a, b, b + [0, t], a + [0, t]]
        rc.paint(rc.mask(poly), pal['board'])
        rc.paint(rc.mask(poly, True, 1.8), INK)
    a, b = eave
    poly = [a, b, b + [0, t], a + [0, t]]
    rc.paint(rc.mask(poly), pal['board_side'])
    rc.paint(rc.mask(poly, True, 1.8), INK)
    parts.insert(1, ('roof', 'roof', rc))

    # --- chimney
    ch = spec.get('chimney')
    if ch:
        cu, cv_, cw, cd, top = ch['u'], ch['v'], ch.get('w', 11), ch.get('d', 10), ch.get('top', 12)
        zt = g.zr + top
        zb = g.ze
        u0, u1, v0, v1 = cu - cw / 2, cu + cw / 2, cv_ - cd / 2, cv_ + cd / 2
        q = np.array([P(u0, v0, zt), P(u1, v1, zb), P(u0, v0, zb), P(u1, v1, zt)])
        cc = Canvas(W, H, (q[:, 0].min() - 6, q[:, 1].min() - 6, q[:, 0].max() + 6, q[:, 1].max() + 6))
        fr = [P(u0, v0, zb), P(u1, v0, zb), P(u1, v0, zt), P(u0, v0, zt)]
        sd = [P(u1, v0, zb), P(u1, v1, zb), P(u1, v1, zt), P(u1, v0, zt)]
        tp = [P(u0, v0, zt), P(u1, v0, zt), P(u1, v1, zt), P(u0, v1, zt)]
        # only the part above the roof is visible: clip to above the roof plane
        roofm = np.zeros(cc.px.shape[:2], np.float32)
        for sl in (back, frontS): roofm = np.maximum(roofm, cc.mask(sl))
        keep = 1 - roofm
        for poly, colr in ((fr, pal['wall']), (sd, pal['wall_side'])):
            cc.paint(cc.mask(poly) * keep, colr)
            cc.paint(cc.mask(poly, True, 2.0) * keep, INK)
        # a band of cap stones and the flue
        capz = 3
        cap_f = [P(u0 - 1, v0 - 1, zt - capz), P(u1 + 1, v0 - 1, zt - capz), P(u1 + 1, v0 - 1, zt), P(u0 - 1, v0 - 1, zt)]
        cap_s = [P(u1 + 1, v0 - 1, zt - capz), P(u1 + 1, v1 + 1, zt - capz), P(u1 + 1, v1 + 1, zt), P(u1 + 1, v0 - 1, zt)]
        tp = [P(u0 - 1, v0 - 1, zt), P(u1 + 1, v0 - 1, zt), P(u1 + 1, v1 + 1, zt), P(u0 - 1, v1 + 1, zt)]
        for poly, colr in ((cap_f, pal['cap']), (cap_s, pal['cap'] * 0.85), (tp, pal['wall'])):
            cc.paint(cc.mask(poly), colr)
            cc.paint(cc.mask(poly, True, 1.8), INK)
        hole = [P(u0 + 2, v0 + 2, zt), P(u1 - 2, v0 + 2, zt), P(u1 - 2, v1 - 2, zt), P(u0 + 2, v1 - 2, zt)]
        cc.paint(cc.mask(hole), pal['hole'])
        parts.insert(2, ('chimney', 'chimney', cc))
    return dict(parts=parts, stand=[])


def fit_house(spec, target):
    """Fit origin, width, depth, wall height and roof rise to the old house's
    silhouette (axes held near the tile's projection)."""
    import copy
    s = copy.deepcopy(spec)
    keys = [('origin', 0), ('origin', 1), 'w', 'd', 'h', 'rise', 'au', 'av']

    def get(sp): return [sp[k[0]][k[1]] if isinstance(k, tuple) else sp[k] for k in keys]

    def put(v):
        sp = copy.deepcopy(s)
        sp['origin'] = [v[0], v[1]]
        for k, x in zip(keys[2:], v[2:]): sp[k] = x
        return sp

    def iou(sp):
        m = HouseGeo(sp).silhouette(target.shape)
        return (m & target).sum() / max((m | target).sum(), 1)

    v = get(s)
    lim = {6: (s['au'] - 4, s['au'] + 4), 7: (s['av'] - 4, s['av'] + 4)}
    best = iou(put(v))
    steps = [3.0, 3.0, 4.0, 4.0, 3.0, 3.0, 1.5, 1.5]
    for it in range(80):
        improved = False
        for i in range(len(v)):
            for d in (1, -1):
                w = list(v); w[i] += d * steps[i]
                if i in lim and not lim[i][0] <= w[i] <= lim[i][1]: continue
                if min(w[2:6]) < 4: continue
                sc = iou(put(w))
                if sc > best + 1e-5: v, best, improved = w, sc, True
        if not improved:
            steps = [x * 0.5 for x in steps]
            if max(steps) < 0.3: break
    out = put(v)
    out['fit_iou'] = round(float(best), 4)
    return out

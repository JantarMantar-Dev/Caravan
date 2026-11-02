"""Review harness: score every reference asset as the engine actually draws it.

For each goods sheet the preview is rendered headless at exactly 1 css px per
reference px (?score=<i>), then every asset is compared against the same
asset in assets/ref/<family>.png:

  tiles   the render is compared with the ideal: the reference pushed straight
          into the engine's hex geometry in one Lanczos resample. The score is
          then the engine's own loss (cut-out, ingest warp, compression, GPU
          sampling, blending, ground/overhang split) and not the deliberate
          regularisation of the hex shape
  items   icon + wagon compared in place

Metrics per asset (inside the asset's own mask):
  ssim     structural similarity, colour (1 = identical)
  dE       mean CIE76 colour error in Lab (< 2 is invisible, < 5 is close)
  dE95     95th percentile of that error (catches halos and fringes)
  sharp    gradient energy render / reference (1 = as crisp, < 1 = blurred)
  ink      IoU of the ink line masks (dark pixels), outline alignment
  holes    share of reference-opaque pixels that rendered as paper (gaps at
           the ground / overhang split, lost overhang)

Writes docs/review/<tag>/summary.md, scores.json and a side-by-side
(ideal | engine | error heat map) per asset; full renders go to dist/review/.

Usage: python3 tools/review.py <tag> [--no-render]
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from skimage.metrics import structural_similarity

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ingest as I  # noqa: E402

ROOT = I.ROOT
HTML = os.path.join(ROOT, 'dist', 'caravan-preview.html')


def render(i, out):
    subprocess.run(['node', os.path.join(ROOT, 'dev', 'shot.mjs'), f'file://{HTML}?score={i}', out, '1536', '1024', '9000'],
                   check=True, cwd=ROOT, stdout=subprocess.DEVNULL)


def lab(rgb):
    return cv2.cvtColor((rgb * 255).astype(np.uint8) if rgb.dtype != np.uint8 else rgb, cv2.COLOR_RGB2LAB).astype(np.float32) * [100 / 255, 1, 1] - [0, 128, 128]


def metrics(ref, got, mask):
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    r, g, m = ref[y0:y1, x0:x1], got[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    # paper outside the mask in both, so ssim only sees the asset
    rp = np.where(m[..., None], r, 255).astype(np.uint8)
    gp = np.where(m[..., None], g, 255).astype(np.uint8)
    ssim, smap = structural_similarity(rp, gp, channel_axis=2, full=True, data_range=255)
    ssim = float(smap.mean(axis=2)[m].mean())
    de = np.linalg.norm(lab(rp) - lab(gp), axis=2)
    lr = cv2.Laplacian(cv2.cvtColor(rp, cv2.COLOR_RGB2GRAY).astype(np.float32), cv2.CV_32F)
    lg = cv2.Laplacian(cv2.cvtColor(gp, cv2.COLOR_RGB2GRAY).astype(np.float32), cv2.CV_32F)
    inner = cv2.erode(m.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    sharp = float((lg[inner] ** 2).mean() / max(1e-6, (lr[inner] ** 2).mean()))
    ir = (rp.mean(axis=2) < 90) & m
    ig = (gp.mean(axis=2) < 90) & m
    ink = float((ir & ig).sum() / max(1, (ir | ig).sum()))
    paper_g = gp.min(axis=2) > I.WHITE_T
    paper_r = rp.min(axis=2) > I.WHITE_T
    holes = float((paper_g & ~paper_r & inner).sum() / max(1, inner.sum()))
    return dict(ssim=round(ssim, 4), dE=round(float(de[m].mean()), 2), dE95=round(float(np.percentile(de[m], 95)), 2),
                sharp=round(sharp, 3), ink=round(ink, 3), holes=round(holes, 5)), (y0, y1, x0, x1), de


def panel(ref, got, de, box, path, scale=1.0):
    y0, y1, x0, x1 = box
    pad = 6
    y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
    y1, x1 = min(ref.shape[0], y1 + pad), min(ref.shape[1], x1 + pad)
    r, g = ref[y0:y1, x0:x1], got[y0:y1, x0:x1]
    d = np.zeros(ref.shape[:2], np.float32); d[box[0]:box[1], box[2]:box[3]] = de
    heat = cv2.applyColorMap(np.clip(d[y0:y1, x0:x1] * 12, 0, 255).astype(np.uint8), cv2.COLORMAP_INFERNO)[..., ::-1]
    bar = np.full((r.shape[0], 8, 3), 255, np.uint8)
    out = np.hstack([r, bar, g, bar, heat])
    if scale != 1.0: out = cv2.resize(out, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    cv2.imwrite(path, out[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 88])


FILL_BIOMES = [('meadow', 'fish_0'), ('autumn', 'apple_0'), ('moor', 'wool_0'), ('jungle', 'spice_0')]


def hex_stats(rgb, mask, ground_ref):
    """Dominant ground colour (closest k-means centre to the reference ground),
    prop cover (pixels far from every ground colour) and ink density."""
    px = rgb[mask].reshape(-1, 3).astype(np.float32)
    _, lbl, ctr = cv2.kmeans(px, 6, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    labc = lab(ctr.reshape(1, -1, 3).astype(np.uint8))[0]
    lref = lab(np.uint8([[ground_ref]]))[0, 0]
    k = int(np.argmin(np.linalg.norm(labc - lref, axis=1)))
    dE = float(np.linalg.norm(labc[k] - lref))
    lpx = lab(px.reshape(1, -1, 3).astype(np.uint8))[0]
    ground = np.linalg.norm(lpx - labc[k], axis=1) < 14
    ink = px.mean(axis=1) < 80
    return round(dE, 2), round(float(1 - ground.mean()), 3), round(float(ink.mean() * 1000), 1)


def review_filler(tag, out_dir):
    """Render the filler sheet at 1:1 and compare each land biome hex with the
    reference wild tile of that biome."""
    W, H, cx, cy = 2100, 1300, 1606, -2978
    shot = os.path.join(ROOT, 'dist', 'review', tag, 'render_filler.png')
    if '--no-render' not in sys.argv:
        subprocess.run(['node', os.path.join(ROOT, 'dev', 'shot.mjs'), f'file://{HTML}?score=0&zoom={cx},{cy},{H}', shot, str(W), str(H), '9000'],
                       check=True, cwd=ROOT, stdout=subprocess.DEVNULL)
    got = cv2.cvtColor(cv2.imread(shot), cv2.COLOR_BGR2RGB)
    props = json.load(open(os.path.join(ROOT, 'assets', 'props.json')))
    out = {}
    for i, (biome, ref_tile) in enumerate(FILL_BIOMES):
        x = (1536 * 2 + 140 - 4 * 515) / 2 + (i + 0.5) * 515
        y = -2 * (1024 + 140) - 330
        sx, sy = W / 2 + (x - cx), H / 2 - (y - cy)
        gx, gy = np.meshgrid(np.arange(W) - sx, np.arange(H) - sy)
        mask = I.hex_sdf(gx.astype(np.float64), gy.astype(np.float64), I.HEX_R) > 8
        pal = props['ground'][biome]
        gref = [c for _, c in pal if not (c[2] > c[0] + 40)][0]          # first land (non-water) cluster
        g = hex_stats(got, mask, gref)
        rim = np.asarray(__import__('PIL.Image', fromlist=['Image']).open(os.path.join(ROOT, 'assets', 'hex', ref_tile + '.avif')).convert('RGBA'))
        t = json.load(open(os.path.join(ROOT, 'assets', 'manifest.json')))['tiles'][ref_tile]
        hx, hy = np.meshgrid(np.arange(rim.shape[1]) - t['ox'], np.arange(rim.shape[0]) - t['oy'])
        rmask = (I.hex_sdf(hx.astype(np.float64), hy.astype(np.float64), I.HEX_R) > 8) & (rim[..., 3] > 250)
        rr = hex_stats(rim[..., :3], rmask, gref)
        out[biome] = dict(ground_dE=g[0], cover=g[1], cover_ref=rr[1], ink_px=g[2], ink_px_ref=rr[2])
        ys, xs = np.nonzero(mask)
        crop = got[ys.min():ys.max(), xs.min():xs.max()]
        rc = cv2.cvtColor(rim, cv2.COLOR_RGBA2RGB)
        rc = np.where(rim[..., 3:4] > 0, rc, 255).astype(np.uint8)
        hh = min(crop.shape[0], rc.shape[0])
        pan = np.hstack([cv2.resize(rc, (int(rc.shape[1] * hh / rc.shape[0]), hh)), np.full((hh, 8, 3), 255, np.uint8),
                         cv2.resize(crop, (int(crop.shape[1] * hh / crop.shape[0]), hh))])
        cv2.imwrite(os.path.join(out_dir, f'filler_{biome}.jpg'), pan[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 88])
    print('filler', out)
    return out


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else 'latest'
    out_dir = os.path.join(ROOT, 'docs', 'review', tag)
    os.makedirs(out_dir, exist_ok=True)
    man = json.load(open(os.path.join(ROOT, 'assets', 'manifest.json')))
    scores = {}
    for i, fam in enumerate(I.FAMILIES):
        shot_dir = os.path.join(ROOT, 'dist', 'review', tag)       # full renders stay out of git
        os.makedirs(shot_dir, exist_ok=True)
        shot = os.path.join(shot_dir, f'render_{fam}.png')
        if '--no-render' not in sys.argv: render(i, shot)
        got = cv2.cvtColor(cv2.imread(shot), cv2.COLOR_BGR2RGB)[:1024, :1536]
        ref = cv2.cvtColor(cv2.imread(os.path.join(I.REF, f'{fam}.png')), cv2.COLOR_BGR2RGB)
        fg = (~I.paper_mask(ref)).astype(np.uint8)
        n, lab_, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
        comps = [k for k in range(1, n) if stats[k][4] > 2000]
        tiles = sorted([k for k in comps if stats[k][4] > 150000], key=lambda k: stats[k][0])
        items = sorted([k for k in comps if k not in tiles], key=lambda k: stats[k][0])
        H, W = ref.shape[:2]
        gx, gy = np.meshgrid(np.arange(W, dtype=np.float64), np.arange(H, dtype=np.float64))
        for st, k in enumerate(tiles):
            name = f'{fam}_{st}'
            t = man['tiles'][name]
            sv = np.array(t['src']['verts']); sc_ = sv.mean(axis=0)
            rad = np.mean(np.linalg.norm(sv - sc_, axis=1))
            r_out = I.HEX_R + t['ink'] / 2 / np.cos(np.pi / 6)
            s = rad / r_out
            mx, my = I.sector_maps(s * I.canon_verts(r_out), sv, sc_, gx - sc_[0], gy - sc_[1])
            ideal = cv2.remap(ref.astype(np.float32), mx, my, cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))
            ideal = np.clip(ideal + 0.5, 0, 255).astype(np.uint8)
            mask = cv2.remap((lab_ == k).astype(np.float32), mx, my, cv2.INTER_LINEAR) > 0.5
            mt, box, de = metrics(ideal, got, mask)
            scores[name] = mt
            panel(ideal, got, de, box, os.path.join(out_dir, f'{name}.jpg'), 0.75)
        for kind, k in zip(['icon', 'wagon'], items):
            name = f'{fam}_{kind}'
            mask = lab_ == k
            mt, box, de = metrics(ref, got, mask)
            scores[name] = mt
            panel(ref, got, de, box, os.path.join(out_dir, f'{name}.jpg'), 1.0)
        print(fam, {k: v for k, v in scores.items() if k.startswith(fam)})
    filler = review_filler(tag, out_dir)
    json.dump({'assets': scores, 'filler': filler}, open(os.path.join(out_dir, 'scores.json'), 'w'), indent=1)
    keys = ['ssim', 'dE', 'dE95', 'sharp', 'ink', 'holes']
    rows = ['| asset | ' + ' | '.join(keys) + ' |', '|' + '---|' * (len(keys) + 1)]
    for name, m in scores.items(): rows.append(f'| {name} | ' + ' | '.join(str(m[k]) for k in keys) + ' |')
    avg = {k: round(float(np.mean([m[k] for m in scores.values()])), 4) for k in keys}
    rows.append('| **mean** | ' + ' | '.join(str(avg[k]) for k in keys) + ' |')
    fk = ['ground_dE', 'cover', 'cover_ref', 'ink_px', 'ink_px_ref']
    frows = ['| filler biome | ' + ' | '.join(fk) + ' |', '|' + '---|' * (len(fk) + 1)]
    for b, m in filler.items(): frows.append(f'| {b} | ' + ' | '.join(str(m[k]) for k in fk) + ' |')
    open(os.path.join(out_dir, 'summary.md'), 'w').write(f'# Review {tag}\n\n' + '\n'.join(rows) + '\n\n'
        + 'Code-built filler hexes vs the wild (stage 0) reference tile of the same biome: dominant ground colour error, '
        + 'share of the hex covered by props, and ink density (dark px per 1000).\n\n' + '\n'.join(frows) + '\n')
    print('mean', avg)


if __name__ == '__main__':
    main()

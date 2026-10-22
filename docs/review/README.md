# Asset review loops

Every asset is rendered headless by the engine at 1 px per reference px and scored
against its reference sheet by `tools/review.py` (method in the script header).
Each `loopN/` folder holds `summary.md`, `scores.json` and one side-by-side panel per
asset: reference (ideal) | engine | colour-error heat map.

Means over the 12 hex tiles and the 8 icons/wagons:

| loop | tile SSIM | tile ΔE | tile ΔE p95 | tile sharpness | tile ink IoU | item SSIM | item ΔE |
|---|---|---|---|---|---|---|---|
| 0 baseline | 0.940 | 4.81 | 15.1 | 0.50 | 0.940 | 0.962 | 2.79 |
| 1 | 0.987 | 1.86 | 5.0 | 0.79 | 0.963 | 0.994 | 1.07 |
| 2 | 0.989 | 1.74 | 4.4 | 0.87 | 0.969 | 0.994 | 1.07 |
| 3 | 0.989 | 1.74 | 4.4 | 0.87 | 0.969 | 0.994 | 1.07 |

ΔE under ~2 is invisible side by side; sharpness is edge energy relative to the
reference (1.0 = as crisp).

Code-built filler hexes vs the wild reference tile of the same biome (dominant ground colour ΔE):

| loop | meadow | autumn | moor | jungle |
|---|---|---|---|---|
| 2 | 1.07 | 1.84 | 4.06 | 1.00 |
| 3 | 1.07 | 1.84 | 1.27 | 1.00 |

## What each loop found and fixed

**Loop 0 → 1**
- Lossy WebP is always 4:2:0 and smeared colour across every ink line (ΔE ≈ 2 from the codec alone): now AVIF 4:4:4 q95.
- Tiles were half as crisp as the reference: the ingest warp is now Lanczos, and painted art is sampled with a 9-tap bicubic in the sprite shader whenever a texel covers about a pixel or more (trilinear otherwise).
- Icons and wagons sat on half-pixel anchors (a 0.5 px blur): anchors are now integers.
- A pale seam ran through palms and bushes that cross the hex edge. The soft split between ground and overhang leaked background by f(1−f); the split is now a hard, exactly complementary per-pixel step, and edge anti-aliasing comes from the art's alpha.
- Ingest fits each sheet hex's real outline (the generated hexes are taller than regular, by 10–25 px, and hide their tops under palms on the spice sheet) instead of one regular hex, so the outline lands on the engine hex.

**Loop 1 → 2**
- Bicubic kernel a = −0.5 → −0.75: sharpness 0.79 → 0.87 with no ringing on flat colour.
- The map showed the real gap: code-drawn filler land looked nothing like the towns. `tools/props.py` now cuts trees, rocks, bushes and heather out of the reference tiles, with their ink rim un-blended and their cast shadows kept. Filler hexes are dressed with those.
- Ground, sand, water and road colours were re-sampled from the reference tiles (k-means), with flatter cel bands.

**Loop 2 → 3**
- Town roads left their tiles off-centre while filler roads met edge midpoints. Each town tile now records its road exits (edge + offset) and the traced centre line of its painted road; filler roads slide to meet the exits exactly, and caravans follow the painted road.
- Filler was half as dense as the reference wild tiles: density up ~35%.
- The moor ground was ΔE 4 off: re-tuned to 1.3.

## Known limits
- Tile sharpness tops out near 0.87 at 1:1 because the art is resampled once to fit the engine hex. Storing tiles at 1.5× would reach 1.0 at about 2.3× the download and GPU memory.
- The spice sheet's palms all cross the tile edges, so the jungle filler borrows meadow greenery.

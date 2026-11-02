# Caravan

Towns sit on hexes, each making one thing and needing another. You draw roads, and caravans run them on their own.

This repo currently holds the **hex asset preview**: the 2D Three.js rendering framework for the hand-inked ligne-claire look. The town tiles, goods icons and wagons are the reference art itself, cut into game layers (hex ground + overhang) and reviewed against the sheets; filler land is built in code and dressed with trees, rocks and heather cut from the same art. A joined map shows caravans riding the roads.

Review results per loop: [docs/review](docs/review/README.md).

![All sets](docs/screenshots/all-sets.png)

## Run it

```sh
npm install
npm run build          # bundles src/ -> dist/main.js and dist/caravan-preview.html
open index.html        # or open dist/caravan-preview.html (single self-contained file)
```

Tabs switch between the Fish, Apples, Wool and Spice sheets and the map view. Drag to pan, scroll or pinch to zoom.
URL options: `?set=0..3`, `?map`, `?zoom=x,y,height`, and `?noterrain` / `?nosprites` for performance A/B checks.

## Asset pipeline

```sh
python3 tools/ingest.py   # sheets in assets/ref -> assets/hex/*.avif + manifest (hex fit, warp, map variants, road exits)
python3 tools/props.py    # trees / rocks / heather cut from the tiles -> assets/props/*.avif
npm run build
python3 tools/review.py loopN   # headless render + per-asset scores and side-by-side panels in docs/review/loopN
```

![Filler](docs/screenshots/filler.png)
![Map](docs/screenshots/map.png)

## Layout

| Path | What it is |
| --- | --- |
| `src/art/ink.js` | Drawing kit: uniform ink contour, cel shading, scalloped blobs, isometric helper |
| `src/art/nature.js`, `buildings.js`, `goods.js` | Procedural sprites: flora, rocks, buildings, props, icons, wagons |
| `src/art/sprites.js` | Sprite registry (names, variants, bake scale) |
| `src/art/atlas.js` | Bounds-recording bake + shelf packer into one atlas |
| `src/engine/hex.js` | Pointy-top axial hex math and the per-hex data block |
| `src/engine/terrain.js` | Terrain shader: biome cel bands, tufts, blended coasts, foam, inked roads and yards, hex outlines |
| `src/engine/spriteLayer.js` | One instanced, y-sorted, premultiplied draw per sprite layer, with bounce |
| `src/engine/refArt.js` | Loads the reference-art layers and props into one atlas |
| `src/filler.js` | Dresses code-built hexes with props cut from the reference |
| `src/tiles.js` | CPU mirrors of the water / road / yard fields (and the earlier code-drawn compositions) |
| `src/mapview.js` | Reference towns + filler on one map, roads meeting the painted exits, caravans |
| `tools/` | Ingest, prop extraction and the review harness (Python, OpenCV) |
| `dev/` | Build, packaging, atlas debug page, headless screenshot script |

World units are reference-sheet pixels: one hex is 490 units wide.

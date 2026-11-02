// dist/caravan-preview.html: one self-contained file (bundle + images inlined).
// dist/artifact/: the claude.ai Artifact form, a small page fragment plus main.js
// and the images as separate files (build.sh bundles that variant there).
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
const js = readFileSync('dist/main.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const full = html.replace('<script src="dist/main.js"></script>', () => `<script>${js}</script>`);
writeFileSync('dist/caravan-preview.html', full);
const frag = html
  .replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '').replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/(<title>[^<]*<\/title>)/, '$1\n<meta name="claude:viewport-fit-sides" content="cover">')
  .replace('<script src="dist/main.js"></script>', '<script src="main.js"></script>');
writeFileSync('dist/artifact/caravan-preview.html', frag);

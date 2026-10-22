// Inline the bundle into self-contained HTML: dist/caravan-preview.html (standalone file)
// and dist/artifact/caravan-preview.html (fragment form for the claude.ai Artifact skeleton).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
const js = readFileSync('dist/main.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const full = html.replace('<script src="dist/main.js"></script>', () => `<script>${js}</script>`);
writeFileSync('dist/caravan-preview.html', full);
mkdirSync('dist/artifact', { recursive: true });
const frag = full
  .replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '').replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/(<title>[^<]*<\/title>)/, '$1\n<meta name="claude:viewport-fit-sides" content="cover">');
writeFileSync('dist/artifact/caravan-preview.html', frag);

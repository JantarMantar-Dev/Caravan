#!/bin/sh
# single-file build (images inlined) + artifact build (images as files)
cd "$(dirname "$0")/.." && npx esbuild src/main.js --bundle --minify --loader:.avif=dataurl --outfile=dist/main.js --log-level=warning \
  && rm -rf dist/artifact && npx esbuild src/main.js --bundle --minify --loader:.avif=file --asset-names=art/[name]-[hash] --outdir=dist/artifact --log-level=warning \
  && node dev/package.mjs

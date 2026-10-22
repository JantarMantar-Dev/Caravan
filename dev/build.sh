#!/bin/sh
cd "$(dirname "$0")/.." && npx esbuild src/main.js --bundle --minify --loader:.avif=dataurl --outfile=dist/main.js --log-level=warning && node dev/package.mjs

#!/bin/sh
cd "$(dirname "$0")/.." && npx esbuild src/main.js --bundle --minify --outfile=dist/main.js --log-level=warning && node dev/package.mjs

# Performance Notes

This file records the production optimizations that are easy to undo by accident.

## Build

- Run `npm ci` followed by `npm run build` before deploying. Cloudflare publishes
  `dist/`; source files remain readable for local `file://` use.
- The build minifies CSS and JavaScript only in `dist/`, while retaining external
  source maps for the minified JavaScript files.
- Never minify the source data files directly: `data/ships.js` and the equipment
  data scripts must keep their global variable names for classic-script loading.

## Rendering And Assets

- `dist/index.html` inlines the minified CSS to remove the only render-blocking
  `style.css` request. The source page still links `style.css` for local development.
- `_headers` contains a CSP placeholder. The build replaces it with the SHA-256 hash
  of the exact inline CSS. Do not use `unsafe-inline` as a shortcut.
- Raleway is hosted at `assets/fonts/raleway-latin.woff2` and preloaded from the same
  origin. Do not restore the deferred Google Fonts loader.
- Production cards use responsive WebP thumbnails: 144x192 by default and 288x384
  `@2x` for high-density displays. Source HTML continues to use PNG/JPG fallbacks so
  it works directly from disk.
- Render all ship cards into one `DocumentFragment`. Progressive animation-frame
  batches lowered a synthetic long-task metric but made the catalog feel slower.
- `main` starts with `aria-busy="true"` and is revealed only after filters and the
  initial catalog are built. This prevents the dynamically generated filters from
  shifting visible cards.

## Known Limits

- The remaining Lighthouse image savings are intentionally small; pursuing them
  requires noticeably lower image quality.
- Document compression and redirect behavior are Cloudflare settings, not headers
  that this static app can safely force. Check Cloudflare Compression Rules when the
  Document request latency insight fails.

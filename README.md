# VectorForge AI

Convert raster images (PNG / JPG / WebP) into clean, editable **SVG** entirely in the browser. Files never leave the device.

## Features

- **Tracing engine** (in a Web Worker): median-cut quantization → single-pass edge chaining → RDP simplification → corner-aware least-squares Bézier fitting → primitive fitting (rectangles / circles) + grid/ortho snapping.
- **Live text via OCR**: tesseract.js runs in the browser and replaces pixel text blocks with native `<text>` elements — fonts, weights, and colors are sampled from the bitmap, and each block stays editable in the Text tab.
- **Per-layer inspection**: palette with per-color toggles, per-layer opacity, removal of specks and background channels.
- **Presets**: Scientific / Line Art, Icons & Logos, Flowcharts & Diagrams — tuned defaults for each use case.
- **Batch queue**: drop multiple images; parameters debounce-coalesce into one re-trace per item.
- **Comparator**: A/B slider, side-by-side, and split-preview modes with zoom & pan, rgba/vector overlays.
- **Exports**: current item (SVG) or entire queue (ZIP) with corrected filenames, minified or pretty output.

## Stack

Vite, React, TypeScript, Tailwind CSS v4, tesseract.js, JSZip. No backend; no API keys.

## Commands

```sh
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/
npm run preview   # serve the production build
npm run lint      # oxlint
npx tsc -b        # typecheck
```

## Verification scripts (`scripts/`)

```sh
node scripts/smoke.ts         # engine unit checks: exact colour resolution, primitives, OCR layer
node scripts/make-test-png.ts # regenerate scripts/fixtures/sample-cells.png
node scripts/e2e.mjs          # browser E2E: trace -> export -> validate SVG
node scripts/e2e-quality.mjs  # rasterises the export and measures pixel match vs the source
node scripts/e2e-textcheck.mjs# verifies OCR text lands on the source baseline/size
node scripts/e2e-ocr.mjs      # OCR happy path: text PNG -> <text> layers
node scripts/e2e-offline.mjs  # OCR fallback: CDN blocked -> amber notice
```

E2E scripts use `playwright-core` with an installed Edge/Chrome (no browser download).

## Notes

- OCR streams worker/core/traineddata from a CDN at runtime, so OCR needs internet; if unavailable the app falls back to tracing text as outlines and shows an amber notice. Everything else works offline.
- Node 24 can run `.ts` directly (type stripping); internal imports use explicit `.ts` extensions so engine code runs in both Node and the Vite worker.
- On Windows npm may be blocked by the execution policy — use `npm.cmd` (or `npx.cmd`) instead.
# Unified product scanner - 3 November 2026

One camera view automatically handles barcodes and printed product part numbers. There is no mode switch and no separate Read Part Number action. Barcode decoding remains active and has priority while one bounded label snapshot is processed. Text reading starts only after the first unsuccessful barcode frames and retries at most once per eight seconds, without overlapping jobs. A text result pauses the camera for staff to check/edit the number before the existing product lookup callback runs. Manual input is never overwritten by a late text result.

The shared scanner is used in POS, inventory and manual receiving. No invoice scan button, invoice parser, backend OCR service or image-upload endpoint was restored. Tesseract runs only in an on-demand browser worker; pinned English/LSTM assets are served from the same origin under part-number-reader. Photos/camera pixels are not uploaded. Only the confirmed identifier follows the existing catalogue lookup.

The reader bounds images to a 1600-pixel longest edge, allows a single worker job, has initialization/recognition deadlines and terminates after completion/error/abort. Late initialization is disposed without creating overlapping workers. Camera streams, photo URLs and timers are cleaned on close, restart, switching cameras and page hiding. Barcode/manual fallback remains available when text reading cannot initialize. Photos are limited to 8 MB and one label; very large source dimensions are rejected before creating a processing canvas.

## Verification

- Browser recognition, with the real packaged model, correctly proposed all eight clean synthetic labels: MD094120, MR446308, 1800A062, 6370A933HA, 11045W010P, MZ320897, CPMW400120 and DP010374.
- The real video/MediaStream/worker pipeline with a synthetic label camera automatically proposed 6370A933HA, waited for confirmation, and delivered it to the parent once. The phone-width 390 x 844 view kept confirmation controls visible without horizontal scrolling.
- Unit/integration coverage includes repeated barcode frames, simultaneous barcode/text priority, text confirmation/correction, late-result/manual-input safety, no-match, permission failures, cleanup, bounded photos, timeouts, identifier parsing, catalogue lookup and manual stock receiving.
- ESLint, production build and existing route bundle budgets are checked separately. The text engine is not in the initial/static route graph.
- Physical iPhone/Android camera focus, lighting, damaged labels and memory/performance still require real-device acceptance. The clean synthetic results are not a claim of general OCR accuracy.
- No live inventory, sales, users or database schema were changed. This implementation is local until separately pushed/deployed.

References: [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md), [same-origin asset configuration](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).

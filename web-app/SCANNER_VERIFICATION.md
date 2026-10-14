# Barcode scanner verification

## Change inventory

- Scanner UI and lifecycle: `src/components/ui/CameraScannerModal.jsx`, new `cameraScanner.css`, nested-dialog cleanup in `Modal.jsx`.
- Detection and validation: new `src/utils/scannerDecoder.js`, `barcodeDecoder.worker.js`, `scannerPolicy.js`; identifier matching in `barcode.js`.
- Integration: `src/hooks/useBarcodeScanner.js`, POS `POSTerminal.jsx`, inventory `InventoryList.jsx` / `AddStockModal.jsx`, `src/store/useDataStore.js`.
- Dependencies: `package.json` and `package-lock.json`. Regenerating the lockfile also pruned stale, unused PWA dependencies left from the earlier PWA removal; no PWA functionality was changed here.
- Verification: seven scanner/barcode test files, local browser harness, `scripts/verify-scanner-production.mjs`, `scripts/verify-bundle-budget.mjs`, and the repository README.

Final checks: clean `npm ci`, ESLint, **258 frontend tests**, **122 backend tests**, production build and bundle budgets passed. The built worker passed all 13 independently encoded formats. No SQL migrations were added or applied. No commit, push or deployment was performed as part of this scanner review.

## Why the implementation changed

The previous `html5-qrcode` UI owned fixed DOM IDs, camera lifecycle, decoding and controls together. Parent callback changes could restart it, scan callbacks were not awaited, and camera frames were reduced to the displayed viewport. This made dense labels on narrow screens harder to read. The replacement retains the same modal API and parent product workflows, but separates camera ownership, frame preparation, decoding and validation.

The JavaScript ZXing reader was evaluated first. A clean UPC-E fixture failed; its reader is experimental. The pinned ZXing-C++ WASM reader passed the independent fixture suite. The app self-hosts the exact matching binary. BWIP is only a development dependency for generating independent test symbols, not a runtime scanner dependency.

Official API references: [zxing-wasm](https://github.com/Sec-ant/zxing-wasm), [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## Reproducible checks

From `web-app`:

```text
npm ci
npm run lint
npx vitest run
npm run build
npm run dev -- --host 127.0.0.1 --port 5176
```

Open `http://127.0.0.1:5176/scripts/scanner-harness.html`. This local-only harness is not part of the production build and never writes to the database.

To test the actual production assets, run `npm run preview -- --host 127.0.0.1 --port 4176` after building, then `node scripts/verify-scanner-production.mjs`. Install `agent-browser` separately or set `AGENT_BROWSER_BIN` to its executable (on Windows, the native `agent-browser-win32-x64.exe`). The test navigates to a same-origin image document, independently generates 13 barcode PNGs and checks the minified worker against each. It does not need deployment credentials or call the backend.

- In the browser console, `await scannerTest.decodeCases()` uses the real worker and self-hosted WASM to read independently generated labels: normal, vertical, tilted 12°, small, large, dim, bright and mildly blurred.
- `scannerTest.fakeCamera()` followed by **Open scanner** supplies a synthetic MediaStream through the real video/decoder pipeline. Expect one `MD094120` result, automatic close, and `scannerTest.tracksEnded()` to be true. This validates integration, not physical camera optics.
- Reload, open the scanner and call `await scannerTest.photo()`. Expect one `6370A933HA` result and automatic close, even with camera permission denied.
- Check 320×568, 360×640, 390×844, 430×932, 844×390 and 1366×768. No horizontal overflow; close/manual controls remain reachable. Reduced motion disables decorative motion.
- With a physical camera, use **Open scanner** without `fakeCamera()`. Deny permission, retry, switch cameras if offered, toggle torch if offered, close during startup, reopen, rotate the device, background the tab and return. Hidden pages require an explicit restart to prevent unexpected camera reactivation.

## Results and remaining acceptance checks

Verified locally: all 13 real format fixtures in both tests and the production-built browser worker; blank frames, moderate low contrast, rotated/sized/degraded browser fixtures, synthetic live stream, photo fallback, responsive viewport checks, and automated lifecycle/validation regressions. Browser measurements are synthetic and are not a guarantee of phone throughput. The complete local app preview requires deployment environment values that are not present in this checkout; authenticated live database lookups were not exercised. Catalogue request/response integration was covered with controlled API responses in tests.

Before a production rollout, physically test iPhone Safari, Android Chrome and a desktop webcam against several real store labels. Include close/far distances, vertical labels, glare, dim lighting, damaged labels and repeated scans. Confirm each result locates the expected product in POS, inventory and stock receiving. Barcode recognition cannot reconstruct missing bars or remove severe motion blur. Use even light, avoid glare, move slightly farther away if the camera cannot focus, or use photo/manual entry.

The earlier attached store-label image paths were unavailable during this review; those original photos were not claimed as tested. No production database writes or migrations were performed. Existing unrelated dependency audit findings should be handled separately, not by a blanket upgrade in this scanner change.

## Runtime limits and privacy

- Camera preference: rear/environment, ideal 1920×1080, up to 30 fps. Browser/device selects supported settings.
- Decode input: at most 1280 px long edge live / 1800 px photo; one worker job at a time, no more than about five live attempts per second, additional idle time after expensive reads.
- Local contrast/crop/rotation passes supplement ZXing's rotation, inversion and downscale handling. Among detected symbols, the nearest to the frame center is preferred.
- Permission timeout: 15 seconds; video startup/stall: 7 seconds; first worker job/download: 12 seconds; warm worker job: 4 seconds. Manual entry always remains available after camera failure.
- Photo limit: 20 MB. Object URLs, pending image handlers, timers, listeners, workers and camera tracks are released on cancellation. Images and raw frames are never uploaded by this scanner.
- Successful callbacks are awaited and never automatically retried. A callback failure may have partially completed a parent action, so the user is asked to close and check before retrying.

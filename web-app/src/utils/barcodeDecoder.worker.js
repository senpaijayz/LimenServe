import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// Pin and self-host the matching binary. Images never leave this worker.
prepareZXingModule({ overrides: { locateFile: () => wasmUrl } });
const formats = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39', 'Code93', 'ITF', 'Codabar', 'QRCode', 'DataMatrix', 'PDF417', 'Aztec'];
self.onmessage = async ({ data }) => {
    try {
        const results = await readBarcodes({ data: new Uint8ClampedArray(data.pixels), width: data.width, height: data.height }, {
            formats, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true,
            maxNumberOfSymbols: 4, minLineCount: 2, returnErrors: false, textMode: 'Plain',
        });
        const distance = (result) => {
            const points = Object.values(result.position);
            const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
            const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
            return Math.hypot((x - data.width / 2) / data.width, (y - data.height / 2) / data.height);
        };
        const result = results.sort((a, b) => distance(a) - distance(b))[0];
        // ZXing-C++ normalizes UPC-E to GTIN-13. Preserve the actual printed
        // eight-digit identifier for inventory lookups when metadata provides it.
        const originalUpce = result?.format === 'UPCE' && result.extra ? JSON.parse(result.extra).UPCE : '';
        const text = /^\d{8}$/.test(originalUpce) ? originalUpce : result?.text;
        self.postMessage(result ? { text, format: result.format } : { text: '' });
    } catch { self.postMessage({ error: 'Decoder unavailable' }); }
};

// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import bwip from 'bwip-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { prepareZXingModule } from 'zxing-wasm/reader';

const cases = [
    ['ean13', '5901234123457'], ['ean8', '96385074'], ['upca', '012345678905'],
    ['upce', '01234565'], ['code128', 'MD094120'], ['code39', '6370A933HA'],
    ['code93', 'MD094120'], ['interleaved2of5', '12345670'], ['rationalizedCodabar', 'A123456B'],
    ['qrcode', 'MD094120'], ['datamatrix', '6370A933HA'], ['pdf417', 'MD094120'], ['azteccode', '6370A933HA'],
];

// Independently encode symbols with BWIP, not the decoder's own writer.
function frame(bcid, text, black = 0, white = 255) {
    const raw = bwip.raw({ bcid, text, includecheck: bcid === 'code93' })[0];
    const scale = 3; const margin = 40;
    const modules = raw.pixx || raw.sbs.reduce((a, b) => a + b, 0);
    const rows = raw.pixy || 40;
    const width = Math.ceil(modules * scale) + margin * 2;
    const height = rows * scale + margin * 2;
    const pixels = new Uint8ClampedArray(width * height).fill(white);
    if (raw.pixs) {
        for (let y = 0; y < rows; y++) for (let x = 0; x < modules; x++) {
            if (raw.pixs[y * modules + x]) for (let yy = 0; yy < scale; yy++) pixels.fill(black, (margin + y * scale + yy) * width + margin + x * scale, (margin + y * scale + yy) * width + margin + (x + 1) * scale);
        }
    } else {
        let left = margin;
        raw.sbs.forEach((bar, i) => {
            const right = left + bar * scale;
            if (i % 2 === 0) for (let y = margin; y < height - margin; y++) pixels.fill(black, y * width + Math.round(left), y * width + Math.round(right));
            left = right;
        });
    }
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i++) { rgba.fill(pixels[i], i * 4, i * 4 + 3); rgba[i * 4 + 3] = 255; }
    return { pixels: rgba.buffer, width, height };
}

const postMessage = vi.fn();
beforeAll(async () => {
    vi.stubGlobal('self', { postMessage });
    await import('../utils/barcodeDecoder.worker');
    const wasm = readFileSync(createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm'));
    prepareZXingModule({ overrides: { wasmBinary: wasm } });
});
afterAll(() => vi.unstubAllGlobals());

describe('real ZXing worker decoding', () => {
    it.each(cases)('decodes %s without mocked recognition', async (bcid, text) => {
        postMessage.mockClear(); await self.onmessage({ data: frame(bcid, text) });
        const result = postMessage.mock.calls[0][0];
        expect(result.text).toBe(bcid === 'upca' ? `0${text}` : text);
        expect(result.error).toBeUndefined();
    });
    it.each([[15, 90], [130, 245]])('reads moderate low-contrast grayscale (%s/%s)', async (black, white) => {
        postMessage.mockClear(); await self.onmessage({ data: frame('code39', 'MD094120', black, white) });
        expect(postMessage.mock.calls[0][0].text).toBe('MD094120');
    });
    it('treats blank frames as normal, not camera errors', async () => {
        postMessage.mockClear(); await self.onmessage({ data: { pixels: new Uint8ClampedArray(320 * 200 * 4).fill(255).buffer, width: 320, height: 200 } });
        expect(postMessage.mock.calls[0][0]).toEqual({ text: '' });
    });
});

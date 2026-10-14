import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import bwip from 'bwip-js';

// Requires a local Vite preview and agent-browser. Does not authenticate or
// call application APIs: verifies the actual minified worker and WASM assets.
const base = process.env.SCANNER_PREVIEW_URL || 'http://127.0.0.1:4176';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Use a local preview URL.');
const binary = process.env.AGENT_BROWSER_BIN || 'agent-browser';
const session = 'scanner-built-assets';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/assets');
const workers = (await readdir(directory)).filter((file) => /^barcodeDecoder\.worker-.*\.js$/.test(file));
if (workers.length !== 1) throw new Error('Build first: expected one scanner worker.');
const workerUrl = `${base}/assets/${workers[0]}`;
const cli = (...args) => execFileSync(binary, ['--session', session, ...args], { encoding: 'utf8', timeout: 30000, ...(args[0] === 'open' ? { stdio: 'inherit' } : {}) });
const cases = [
    ['ean13', '5901234123457'], ['ean8', '96385074'], ['upca', '012345678905'], ['upce', '01234565'],
    ['code128', 'MD094120'], ['code39', '6370A933HA'], ['code93', 'MD094120'], ['interleaved2of5', '12345670'],
    ['rationalizedCodabar', 'A123456B'], ['qrcode', 'MD094120'], ['datamatrix', '6370A933HA'], ['pdf417', 'MD094120'], ['azteccode', '6370A933HA'],
];

async function probe(url, imageUrl) {
    /* global Image, document, Worker */
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = imageUrl; });
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const worker = new Worker(url);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('Built decoder timed out')); }, 15000);
        worker.onmessage = ({ data }) => { clearTimeout(timer); worker.terminate(); resolve(data); };
        worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Built worker failed')); };
        worker.postMessage({ pixels: rgba.data.buffer, width: canvas.width, height: canvas.height }, [rgba.data.buffer]);
    });
}

try {
    // An image document supplies the same origin without booting the app or
    // needing staff credentials / deployment environment variables.
    cli('open', `${base}/limen-app-icon-192.png`);
    for (const [bcid, text] of cases) {
        const png = await bwip.toBuffer({ bcid, text, scale: 3, height: 20, padding: 20, backgroundcolor: 'FFFFFF', includecheck: bcid === 'code93' });
        const code = `(${probe.toString()})(${JSON.stringify(workerUrl)},${JSON.stringify(`data:image/png;base64,${png.toString('base64')}`)})`;
        const result = JSON.parse(cli('eval', '--base64', Buffer.from(code).toString('base64')));
        const expected = bcid === 'upca' ? `0${text}` : text;
        if (result.text !== expected) throw new Error(`${bcid}: expected ${expected}, received ${JSON.stringify(result)}`);
        process.stdout.write(`${bcid}: ${result.text} — built worker passed\n`);
    }
} finally { cli('close'); }

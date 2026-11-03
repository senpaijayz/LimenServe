import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const destination = fileURLToPath(new URL('../public/part-number-reader/', import.meta.url));
const core = dirname(fileURLToPath(import.meta.resolve('tesseract.js-core/package.json')));
const engine = dirname(fileURLToPath(import.meta.resolve('tesseract.js/package.json')));
const language = dirname(fileURLToPath(import.meta.resolve('@tesseract.js-data/eng/package.json')));
await mkdir(destination, { recursive: true });
// Only LSTM cores are needed; SIMD capability is chosen by Tesseract at runtime.
for (const file of await readdir(core)) {
    if (/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm(?:\.js)?$/.test(file)) await copyFile(join(core, file), join(destination, file));
}
await copyFile(join(engine, 'dist/worker.min.js'), join(destination, 'worker.min.js'));
await copyFile(join(language, '4.0.0_best_int/eng.traineddata.gz'), join(destination, 'eng.traineddata.gz'));
console.log('Prepared same-origin, on-demand product-label text reader. Invoice scanning remains removed.');

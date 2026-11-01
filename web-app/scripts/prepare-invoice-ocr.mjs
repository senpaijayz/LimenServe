import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const destination = fileURLToPath(new URL('../public/invoice-ocr/', import.meta.url));
const core = dirname(fileURLToPath(import.meta.resolve('tesseract.js-core/package.json')));
const engine = dirname(fileURLToPath(import.meta.resolve('tesseract.js/package.json')));
const language = dirname(fileURLToPath(import.meta.resolve('@tesseract.js-data/eng/package.json')));
await mkdir(destination, { recursive: true });
for (const name of await readdir(core)) {
  if (name.endsWith('.wasm') || name.endsWith('.wasm.js')) await copyFile(join(core, name), join(destination, name));
}
await copyFile(join(engine, 'dist/worker.min.js'), join(destination, 'worker.min.js'));
await copyFile(join(language, '4.0.0_best_int/eng.traineddata.gz'), join(destination, 'eng.traineddata.gz'));
console.log('Prepared same-origin invoice OCR worker, WASM cores and English model.');

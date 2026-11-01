// Native ONNX allocations must not run in the HTTP server process.
import { readFile } from 'node:fs/promises';

process.once('message', async ({ filePath }) => {
  try {
    const { PaddleOcrService } = await import('ppu-paddle-ocr');
    const service = new PaddleOcrService({
      debugging: { debug: false, verbose: false },
      processing: { engine: 'canvas-native' },
      recognition: { strategy: 'per-line' },
      session: {
        executionProviders: ['cpu'], executionMode: 'sequential',
        interOpNumThreads: 1, intraOpNumThreads: 1,
        enableCpuMemArena: false, enableMemPattern: false,
      },
    });
    await service.initialize();
    const file = await readFile(filePath);
    const image = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const result = await service.recognize(image, { flatten: true, strategy: 'per-line', noCache: true });
    process.send({ text: result?.text || '' }, () => process.exit(0));
  } catch {
    // Do not emit invoice contents, filenames or native error details.
    process.send({ failed: true }, () => process.exit(1));
  }
});

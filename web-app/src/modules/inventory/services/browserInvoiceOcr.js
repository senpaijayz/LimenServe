let reading = false;

// Load only when requested. Invoice pixels stay on this device; no OCR provider receives them.
export async function readInvoiceOnDevice(image) {
  if (reading) throw new Error('An invoice is already being read. Wait for it to finish.');
  reading = true;
  let worker;
  let expired = false;
  let timer;
  try {
    const { createWorker } = await import('tesseract.js');
    const base = `${import.meta.env.BASE_URL}invoice-ocr`;
    const work = (async () => {
      worker = await createWorker('eng', 1, {
        workerPath: `${base}/worker.min.js`, corePath: base, langPath: base,
        workerBlobURL: false, gzip: true, errorHandler: () => {},
      });
      if (expired) { await worker.terminate(); return ''; }
      await worker.setParameters({ preserve_interword_spaces: '1' });
      const { data } = await worker.recognize(image);
      if (!data.text.trim()) throw new Error('No readable text found. Use a clear, straight photo of the invoice.');
      if (data.text.length > 128_000) throw new Error('This invoice is too long. Scan it in smaller sections.');
      return data.text;
    })();
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error('Reading took too long on this device. Crop the invoice or enter its parts manually.')); }, 75_000);
    })]);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('The on-device reader could not start. Refresh and check your connection, or enter parts manually.');
  } finally {
    expired = true;
    clearTimeout(timer);
    if (worker) await worker.terminate().catch(() => {});
    reading = false;
  }
}

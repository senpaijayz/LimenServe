import { recognizeInvoiceTable } from './invoiceTableOcr';

let reading = false;

// Load only when requested. Invoice pixels stay on this device; no OCR provider receives them.
export async function readInvoiceOnDevice(image) {
  if (reading) throw new Error('An invoice is already being read. Wait for it to finish.');
  reading = true;
  let worker;
  let bitmap;
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
      if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(image);
      const result = bitmap ? await recognizeInvoiceTable(worker, image, async (rectangle) => {
        if (expired) throw new Error('Invoice reading stopped.');
        const canvas = document.createElement('canvas');
        // White margin prevents characters touching the crop edge from disappearing.
        canvas.width = rectangle.width + 20;
        canvas.height = rectangle.height + 20;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image preparation is unavailable. Try another browser.');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, rectangle.left, rectangle.top, rectangle.width, rectangle.height, 10, 10, rectangle.width, rectangle.height);
        return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The invoice row could not be prepared.')), 'image/png'));
      }) : { ocrText: (await worker.recognize(image)).data.text };
      if (!result.ocrText.trim()) throw new Error('No readable text found. Use a clear, straight photo of the invoice.');
      if (result.ocrText.length > 128_000) throw new Error('This invoice is too long. Scan it in smaller sections.');
      return result;
    })();
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error('Reading took too long on this device. Crop the invoice or enter its parts manually.')); }, 120_000);
    })]);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('The on-device reader could not start. Refresh and check your connection, or enter parts manually.');
  } finally {
    expired = true;
    clearTimeout(timer);
    if (worker) await worker.terminate().catch(() => {});
    bitmap?.close();
    reading = false;
  }
}

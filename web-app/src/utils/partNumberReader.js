import { withTimeout } from './scannerPolicy';
import { extractPartNumberCandidates } from './partNumberText';

let active = false;
// Only explicit label capture invokes this module. No backend image request,
// continuous OCR loop, invoice parsing, or third-party model/CDN is involved.
export async function readPartNumberLabel(image, { signal, onProgress = () => {} } = {}) {
    if (active) throw new Error('The label reader is still closing. Enter the part number, or wait before trying again.');
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    if (!image?.width || !image?.height || Math.max(image.width, image.height) > 1600) throw new Error('Use a close-up of one part label.');
    active = true;
    let worker; let initialization; let settled = false; let cancelled = false;
    const stop = () => { cancelled = true; if (worker) void worker.terminate().catch(() => {}); };
    signal?.addEventListener('abort', stop, { once: true });
    try {
        const { createWorker } = await import('tesseract.js');
        if (cancelled) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
        const base = `${import.meta.env.BASE_URL}part-number-reader`;
        initialization = createWorker('eng', 1, {
            workerPath: `${base}/worker.min.js`, corePath: base, langPath: base,
            gzip: true, legacyCore: false, legacyLang: false,
            errorHandler: () => {},
            logger: ({ status, progress }) => { if (!cancelled) onProgress({ status, progress }); },
        });
        initialization.then(value => {
            settled = true; worker = value;
            if (cancelled) void worker.terminate().catch(() => {}).finally(() => { active = false; });
        }, () => { settled = true; if (cancelled) active = false; });
        await withTimeout(initialization, 45000, signal);
        if (cancelled) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
        const result = await withTimeout((async () => {
            await worker.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-./: ', preserve_interword_spaces: '1', user_defined_dpi: '300' });
            return worker.recognize(image.toDataURL('image/png'), {}, { text: true });
        })(), 20000, signal);
        if (cancelled) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
        return { candidates: extractPartNumberCandidates(result.data.text), confidence: Number(result.data.confidence) || 0 };
    } catch (error) {
        if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
        if (error?.name === 'TimeoutError') throw new Error('Reading took too long on this device. Try a closer label photo or enter the part number.');
        throw new Error('The label could not be read. Try a sharp, well-lit close-up or enter the part number.');
    } finally {
        cancelled = true; signal?.removeEventListener('abort', stop);
        if (worker) await worker.terminate().catch(() => {});
        // Never overlap an unresolved worker initialization with another worker.
        // A late initializer is terminated by its handler above, including after close.
        if (!initialization || settled) active = false;
    }
}

import { validateScan } from './scannerPolicy';

// Proposals only: never silently substitute O/0, I/1, S/5, strip suffixes,
// or add a product. The staff member must confirm a number before lookup.
export function extractPartNumberCandidates(text) {
    const candidates = [];
    const add = (value) => {
        const code = validateScan(value);
        if (!code || code.length < 5 || code.length > 24 || (code.match(/\d/g) || []).length < 3) return;
        if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(code)) return;
        if (!candidates.includes(code)) candidates.push(code);
    };
    for (const rawLine of String(text || '').slice(0, 8000).toUpperCase().split(/\r?\n/)) {
        if (/^\s*(?:TEL|PHONE|FAX|TIN|DATE|QTY|QUANTITY|PRICE|AMOUNT)\b/.test(rawLine)) continue;
        if (/:\/\/|@|[<>]/.test(rawLine)) continue;
        const line = rawLine.split(/\b(?:QTY|QUANTITY|PRICE|AMOUNT)\b/)[0].replace(/^\s*(?:PART\s*(?:NUMBER|NO\.?)|P\s*\/\s*N|STOCK\s*NO\.?|MATERIAL)\s*[:#-]?\s*/, '').trim();
        // A separated alpha prefix is common on printed Mitsubishi labels.
        if (/^[A-Z]{1,4}\s+\d[A-Z0-9-]*(?:\s+[A-Z0-9]{1,4})?$/.test(line)) add(line);
        for (const token of line.match(/[A-Z0-9][A-Z0-9./-]{4,23}/g) || []) add(token);
        if (candidates.length >= 6) break;
    }
    return candidates.slice(0, 6);
}

export function partNumberCaptureRegion(videoWidth, videoHeight, viewWidth, viewHeight) {
    if (![videoWidth, videoHeight, viewWidth, viewHeight].every(v => Number.isFinite(v) && v > 0)) throw new Error('Camera is not ready. Restart it or choose a label photo.');
    // Mirrors the shared object-fit:contain preview. Intersect the visible
    // guide with the actual video, excluding letterboxing on portrait cameras.
    const scale = Math.min(viewWidth / videoWidth, viewHeight / videoHeight);
    const left = (viewWidth - videoWidth * scale) / 2;
    const top = (viewHeight - videoHeight * scale) / 2;
    const x = Math.max(0, (viewWidth * .07 - left) / scale);
    const y = Math.max(0, (viewHeight * .19 - top) / scale);
    return {
        x, y,
        width: Math.min(videoWidth, (viewWidth * .93 - left) / scale) - x,
        height: Math.min(videoHeight, (viewHeight * .81 - top) / scale) - y,
    };
}

export function createScannerDecoder() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas unavailable');
    const worker = new Worker(new URL('./barcodeDecoder.worker.js', import.meta.url), { type: 'module' });
    let waiting = null;
    let closed = false;
    let warmed = false;
    const finish = (error, result) => {
        if (!waiting) return;
        clearTimeout(waiting.timer);
        const { resolve, reject } = waiting;
        waiting = null;
        if (error) reject(error); else { warmed = true; resolve(result); }
    };
    worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data);
    worker.onerror = () => finish(new Error('Decoder unavailable'));
    return {
        async decode(source, attempt = 0, photo = false) {
            if (closed || waiting) throw new Error('Decoder unavailable');
            const width = source.videoWidth || source.naturalWidth || source.width;
            const height = source.videoHeight || source.naturalHeight || source.height;
            if (!width || !height || !context) return { text: '' };
            // Alternate full frame, center crop, and a 90-degree rotation. This
            // reads vertical labels too, without asking users to rotate a phone.
            const rotate = attempt % 4 === 1;
            const bands = [0.18, 0.34, 0.48, 0.58];
            const band = photo && attempt >= 4;
            const fraction = attempt % 4 === 2 ? 0.65 : 1;
            const sw = width * fraction;
            const sh = band ? height * 0.3 : height * fraction;
            const sx = (width - sw) / 2;
            const sy = band ? height * bands[(attempt - 4) % bands.length] : (height - sh) / 2;
            const scale = Math.min(1, (photo ? 1800 : 1280) / Math.max(sw, sh));
            const dw = Math.round(sw * scale); const dh = Math.round(sh * scale);
            canvas.width = rotate ? dh : dw; canvas.height = rotate ? dw : dh;
            context.save();
            if (rotate) { context.translate(canvas.width, 0); context.rotate(Math.PI / 2); }
            context.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
            context.restore();
            const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
            const contrast = attempt % 4 === 3;
            if (contrast) for (let i = 0; i < rgba.length; i += 4) for (let channel = 0; channel < 3; channel++) rgba[i + channel] = (rgba[i + channel] - 128) * 1.5 + 128;
            return new Promise((resolve, reject) => {
                waiting = { resolve, reject, timer: setTimeout(() => {
                    closed = true; worker.terminate(); finish(new Error('Decoder timed out'));
                }, warmed ? 4000 : 12000) };
                worker.postMessage({ pixels: rgba.buffer, width: canvas.width, height: canvas.height }, [rgba.buffer]);
            });
        },
        close() {
            closed = true; worker.terminate(); finish(new Error('Decoder closed'));
            canvas.width = 0; canvas.height = 0;
        },
    };
}

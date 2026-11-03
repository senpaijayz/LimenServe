import { withTimeout } from './scannerPolicy';
import { partNumberCaptureRegion } from './partNumberText';

const MAX_EDGE = 1600;
function canvasFrom(source, crop) {
    const width = source.videoWidth || source.naturalWidth || source.width;
    const height = source.videoHeight || source.naturalHeight || source.height;
    if (!width || !height) throw new Error('No readable image. Try a clear label photo.');
    const area = crop || { x: 0, y: 0, width, height };
    const scale = Math.min(2, MAX_EDGE / Math.max(area.width, area.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(area.width * scale)); canvas.height = Math.max(1, Math.round(area.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot read label photos. Enter the part number instead.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
    return canvas;
}
export function capturePartNumberFrame(video) {
    const region = partNumberCaptureRegion(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight);
    return canvasFrom(video, region);
}
export async function preparePartNumberPhoto(file, signal) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP label photo smaller than 8 MB.');
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    let image; let url;
    try {
        url = URL.createObjectURL(file); image = new Image();
        await withTimeout(new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; }), 10000, signal);
        if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
        if (image.naturalWidth * image.naturalHeight > 24_000_000 || Math.max(image.naturalWidth, image.naturalHeight) > 12000) throw new Error('This photo is too large. Crop it to one product label or use the camera.');
        return canvasFrom(image);
    } finally {
        if (image) { image.onload = null; image.onerror = null; image.src = ''; }
        if (url) URL.revokeObjectURL(url);
    }
}

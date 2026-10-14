import { normalizeBarcodeToken } from './barcode';

// Product identifiers only: decoded QR content is never opened as a URL or HTML.
export function validateScan(value) {
    if (typeof value !== 'string' || value.length > 160 || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return '';
    const code = normalizeBarcodeToken(value);
    return /^[A-Z0-9][A-Z0-9._/-]{1,127}$/.test(code) ? code : '';
}

export function cameraError(error) {
    switch (error?.name) {
        case 'NotAllowedError': case 'SecurityError':
            return 'Camera permission is blocked. Allow Camera in this site’s browser settings, then retry. On iPhone, open this page in Safari if an in-app browser cannot request access.';
        case 'NotFoundError': case 'OverconstrainedError':
            return 'No compatible camera was found. Connect a camera, choose another camera, or enter the barcode manually.';
        case 'NotReadableError': case 'AbortError':
            return 'The camera is busy or unavailable. Close other apps using it, then retry.';
        case 'TimeoutError':
            return 'The camera did not respond. Check the permission prompt. You can use a photo or enter the barcode manually.';
        case 'CameraBusy':
            return 'Another scanner or camera permission request is still open. Close it first, then retry.';
        default:
            return 'Unable to start the camera. Retry, choose a photo, or enter the barcode manually.';
    }
}

export function stopTracks(stream) {
    stream?.getTracks().forEach((track) => track.stop());
}

// Browser permission requests cannot be cancelled. Keep an unresolved request
// locked even after its modal closes; late grants must release their tracks.
let owner = null;
let pending = false;
export function claimCamera() {
    if (owner || pending) throw Object.assign(new Error('Camera in use'), { name: 'CameraBusy' });
    const token = Symbol('camera');
    owner = token;
    return {
        async request(constraints) {
            if (owner !== token) throw new Error('Camera session cancelled');
            pending = true;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
                if (owner !== token) { stopTracks(stream); throw new Error('Camera session cancelled'); }
                return stream;
            } finally { pending = false; }
        },
        release() { if (owner === token) owner = null; },
    };
}

export function withTimeout(promise, milliseconds, signal) {
    let timer; let abort;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            abort = () => reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
            if (signal?.aborted) { abort(); return; }
            signal?.addEventListener('abort', abort, { once: true });
            timer = setTimeout(() => reject(Object.assign(new Error('Timed out'), { name: 'TimeoutError' })), milliseconds);
        }),
    ]).finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', abort); });
}

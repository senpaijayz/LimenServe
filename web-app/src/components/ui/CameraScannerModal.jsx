import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Check, ImageUp, Loader2, RefreshCw, ScanText, SwitchCamera, Zap, ZapOff } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import { cameraError, claimCamera, stopTracks, validateScan, withTimeout } from '../../utils/scannerPolicy';
import { createScannerDecoder } from '../../utils/scannerDecoder';
import { capturePartNumberFrame, preparePartNumberPhoto } from '../../utils/partNumberImage';
import './cameraScanner.css';

// Fresh session per open; new parent callbacks do not restart a camera.
export default function CameraScannerModal({ isOpen, onClose, onScan }) {
    return isOpen ? <ScannerSession onClose={onClose} onScan={onScan} /> : null;
}

function ScannerSession({ onClose, onScan }) {
    const id = useId();
    const videoRef = useRef(null);
    const rootRef = useRef(null);
    const callbacks = useRef({ onClose, onScan });
    useEffect(() => { callbacks.current = { onClose, onScan }; }, [onClose, onScan]);
    const alive = useRef(true);
    const session = useRef(null);
    const locked = useRef(false);
    const photoJob = useRef(null);
    const textJob = useRef(null);
    const autoText = useRef(null);
    const textUnavailable = useRef(false);
    const manualEditing = useRef(false);
    const processingTimer = useRef(null);
    const closeTimer = useRef(null);
    const [restart, setRestart] = useState(0);
    const [candidates, setCandidates] = useState([]);
    const [labelImage, setLabelImage] = useState('');
    const [cameraId, setCameraId] = useState('');
    const [cameras, setCameras] = useState([]);
    const [state, setState] = useState('initializing');
    const [message, setMessage] = useState('Preparing scanner…');
    const [detected, setDetected] = useState('');
    const [manualCode, setManualCode] = useState('');
    const [torchAvailable, setTorchAvailable] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [controlBusy, setControlBusy] = useState(false);
    const [cameraRunning, setCameraRunning] = useState(false);
    const [activeCameraId, setActiveCameraId] = useState('');

    const stop = () => session.current?.stop();
    const close = () => { alive.current = false; stop(); photoJob.current?.close(); textJob.current?.abort(); clearTimeout(closeTimer.current); callbacks.current.onClose(); };
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            session.current?.stop(); photoJob.current?.close(); textJob.current?.abort();
            clearTimeout(processingTimer.current); clearTimeout(closeTimer.current);
        };
    }, []);

    useEffect(() => {
        const previous = document.activeElement;
        const dialog = rootRef.current?.closest('[role="dialog"]');
        const keyboard = (event) => {
            if ([...document.querySelectorAll('[role="dialog"]')].at(-1) !== dialog) return;
            if (event.key === 'Escape') {
                // Camera dialogs can sit above the stock-receiving dialog.
                // Escape must close only the scanner, not discard the parent.
                event.preventDefault(); event.stopImmediatePropagation();
                dialog.querySelector('[aria-label="Close modal"]')?.click();
            } else if (event.key === 'Tab') {
                const targets = [...dialog.querySelectorAll('button, input, select, [tabindex="0"]')].filter((item) => !item.disabled && item.tabIndex >= 0);
                const first = targets[0]; const last = targets.at(-1);
                if (event.shiftKey && (document.activeElement === first || !targets.includes(document.activeElement))) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && (document.activeElement === last || !targets.includes(document.activeElement))) { event.preventDefault(); first?.focus(); }
            }
        };
        document.addEventListener('keydown', keyboard, true);
        return () => { document.removeEventListener('keydown', keyboard, true); if (previous?.isConnected) previous.focus(); };
    }, []);

    const completeRef = useRef(null);
    useEffect(() => {
        completeRef.current = async (raw) => {
            if (!alive.current || locked.current) return;
            const code = validateScan(raw);
            if (!code) {
                setState('invalid'); setMessage('Enter a valid barcode or printed part number.'); return;
            }
            locked.current = true; stop(); photoJob.current?.close(); textJob.current?.abort();
            setDetected(code); setState('processing'); setMessage(labelImage ? 'Part number confirmed. Looking up the result…' : 'Barcode detected. Looking up the result…');
            try { navigator.vibrate?.(50); } catch { /* Optional device feedback. */ }
            processingTimer.current = setTimeout(() => {
                if (alive.current) setMessage('The lookup is taking longer than expected. You can close this scanner; do not submit the same code again while it is processing.');
            }, 12000);
            try {
                const result = await callbacks.current.onScan(code);
                if (!alive.current) return;
                if (result?.found === false) {
                    setState('not-found'); setDetected(''); setMessage('Number read, but no matching part was found. Check the printed number or try another label.'); locked.current = false; return;
                }
                setState('success'); setMessage('Scan successful');
                closeTimer.current = setTimeout(() => { if (alive.current) callbacks.current.onClose(); }, 650);
            } catch {
                if (!alive.current) return;
                // Never automatically retry a parent action that may mutate data.
                setState('result-error'); setMessage('The barcode was read, but the result could not be processed. Close the scanner and check the result before trying again.');
            } finally { clearTimeout(processingTimer.current); }
        };
    });

    useEffect(() => {
        let cancelled = false; let stream; let lease; let decoder; let frameTimer; let hintTimer;
        let attempt = 0; let lastText = ''; let lastAt = 0; let repeated = 0; let lastFrameAt = Date.now(); let lastLabelAt = 0;
        const controller = new AbortController();
        const video = videoRef.current;
        const clean = () => {
            cancelled = true; controller.abort(); clearTimeout(frameTimer); clearTimeout(hintTimer);
            decoder?.close(); stream?.getVideoTracks().forEach((track) => { track.onended = null; }); stopTracks(stream); lease?.release();
            if (video?.srcObject === stream) video.srcObject = null;
            if (alive.current) setCameraRunning(false);
        };
        session.current = { stop: clean, track: null };
        const update = (next, text) => { if (!cancelled && alive.current) { setState(next); setMessage(text); } };
        const fail = (error) => {
            update(error?.name === 'NotAllowedError' ? 'permission-denied' : 'camera-error', cameraError(error)); clean();
        };
        const tick = async () => {
            if (cancelled || locked.current) return;
            if (video.readyState < 2 || !video.videoWidth) {
                if (Date.now() - lastFrameAt > 7000) { fail({ name: 'TimeoutError' }); return; }
                frameTimer = setTimeout(tick, 200); return;
            }
            lastFrameAt = Date.now();
            const start = performance.now();
            try {
                const result = await decoder.decode(video, attempt++);
                if (cancelled) return;
                if (result.text) {
                    const code = validateScan(result.text);
                    if (!code) update('invalid', 'Code detected, but it is not a product identifier. Use the printed part number instead.');
                    else {
                        const now = Date.now();
                        repeated = code === lastText && now - lastAt < 2500 ? repeated + 1 : 1;
                        lastText = code; lastAt = now;
                        update('detected', 'Barcode detected. Hold steady to confirm…');
                        if (repeated >= 2) { void completeRef.current(code); return; }
                    }
                } else if (lastText && Date.now() - lastAt > 2500) {
                    lastText = ''; repeated = 0;
                    update('scanning', 'Keep the barcode steady and entirely inside the camera view.');
                }
                if (!result.text && !lastText && attempt >= 8 && Date.now() - lastLabelAt > 8000 && !textUnavailable.current && !textJob.current) {
                    lastLabelAt = Date.now();
                    // One bounded text snapshot; barcode decoding keeps priority
                    // and continues while the on-device reader initializes.
                    autoText.current?.();
                }
            } catch {
                if (!cancelled) { update('camera-error', 'The scanner could not read camera frames. Retry or use a photo or manual entry.'); clean(); }
            }
            if (!cancelled) {
                // One job at a time, at most ~5 scans/sec; slow decodes get
                // extra idle time. ZXing decoding runs off the UI thread.
                const elapsed = performance.now() - start;
                frameTimer = setTimeout(tick, Math.max(120, 200 - elapsed, elapsed * 0.5));
            }
        };
        const start = async () => {
            if (cancelled) return;
            locked.current = false; setDetected(''); setLabelImage(''); setCandidates([]); setTorchAvailable(false); setTorchOn(false);
            if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
                update('camera-error', 'Camera scanning needs HTTPS and a compatible browser. Open this page in Safari or Chrome, or use a photo or manual entry.'); return;
            }
            try {
                lease = claimCamera();
                update('permission', 'Allow camera access when your browser asks.');
                const constraints = { ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 24, max: 30 } };
                stream = await withTimeout(lease.request(constraints), 15000, controller.signal);
                if (cancelled) { stopTracks(stream); return; }
                const track = stream.getVideoTracks()[0];
                if (!track) throw Object.assign(new Error('No camera'), { name: 'NotFoundError' });
                session.current.track = track;
                setActiveCameraId(track.getSettings?.().deviceId || '');
                track.onended = () => { if (!cancelled) fail({ name: 'NotReadableError' }); };
                video.srcObject = stream;
                update('initializing', 'Starting camera…');
                await withTimeout(Promise.resolve(video.play()), 7000, controller.signal);
                if (cancelled) return;
                const capabilities = track.getCapabilities?.() || {};
                setTorchAvailable(capabilities.torch === true); setCameraRunning(true);
                if (capabilities.focusMode?.includes('continuous')) {
                    void track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
                }
                void navigator.mediaDevices.enumerateDevices?.().then((devices) => {
                    if (!cancelled) setCameras(devices.filter((device) => device.kind === 'videoinput' && device.deviceId));
                }).catch(() => {});
                decoder = createScannerDecoder();
                lastFrameAt = Date.now();
                update('scanning', 'Ready to scan. Show a barcode or printed part number inside the frame.');
                hintTimer = setTimeout(() => update('no-code', 'No number detected yet. Hold steady, move closer, or tilt the label to reduce glare.'), 10000);
                void tick();
            } catch (error) { if (!cancelled) fail(error); }
        };
        const hidden = () => {
            if (document.hidden && !cancelled) { textJob.current?.abort(); update('paused', 'Camera paused while this page is hidden. Tap Restart scanner to continue.'); clean(); }
        };
        document.addEventListener('visibilitychange', hidden);
        window.addEventListener('pagehide', clean);
        // StrictMode may clean up an effect before its replacement is mounted.
        // Defer acquisition so the discarded effect never opens a permission request.
        void Promise.resolve().then(start);
        return () => { clean(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', clean); };
    }, [cameraId, restart]);

    const restartCamera = () => {
        if (locked.current) return;
        photoJob.current?.close(); photoJob.current = null; textJob.current?.abort(); textJob.current = null;
        textUnavailable.current = false;
        manualEditing.current = false; setManualCode('');
        setCandidates([]); setLabelImage(''); stop(); setRestart((value) => value + 1);
    };
    const toggleTorch = async () => {
        const track = session.current?.track;
        if (!track || controlBusy) return;
        setControlBusy(true);
        try {
            await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
            if (alive.current && session.current?.track === track) setTorchOn(!torchOn);
        } catch { if (alive.current && session.current?.track === track) { setTorchAvailable(false); setMessage('Flash is unavailable on this camera. Try brighter, even lighting.'); } }
        finally { if (alive.current) setControlBusy(false); }
    };

    const readLabel = async (source, background = false) => {
        if (locked.current || textJob.current || photoJob.current) return;
        const controller = new AbortController(); textJob.current = controller;
        if (!background) {
            stop(); setTorchAvailable(false); setCandidates([]); setDetected(''); setManualCode(''); setLabelImage('');
            setState('text-reading');
        }
        setMessage('Looking for a barcode or printed part number. First text read may take longer…');
        let image;
        try {
            if (source instanceof File) {
                image = await preparePartNumberPhoto(source, controller.signal);
            } else image = source;
            if (controller.signal.aborted || !alive.current) return;
            const preview = image.toDataURL('image/png');
            if (!background) setLabelImage(preview);
            const { readPartNumberLabel } = await import('../../utils/partNumberReader');
            if (controller.signal.aborted || !alive.current) return;
            const result = await readPartNumberLabel(image, { signal: controller.signal, onProgress: ({ status, progress }) => {
                if (!alive.current || controller.signal.aborted) return;
                if (!background) setMessage(status === 'recognizing text' ? `Reading label… ${Math.round((progress || 0) * 100)}%` : 'Loading the label reader on this device…');
            } });
            if (!alive.current || controller.signal.aborted || locked.current || (background && manualEditing.current)) return;
            if (background && !result.candidates.length) { setMessage('Keep the barcode or printed number steady. Move closer if needed.'); return; }
            stop(); setLabelImage(preview);
            setCandidates(result.candidates); setManualCode(result.candidates[0] || ''); setState('text-review');
            setMessage(result.candidates.length ? 'Check the number against the label. Correct any letters or digits, then confirm.' : 'No clear part number was found. Retake a close-up or enter the number below.');
        } catch (error) {
            if (alive.current && !controller.signal.aborted && !locked.current) {
                if (background) { textUnavailable.current = true; setMessage('Barcode scanning is still active. If printed text cannot be read, enter the part number below.'); }
                else { setState('text-review'); setMessage(error.message || 'Unable to read this label. Enter the part number below.'); }
            }
        } finally {
            if (image) { image.width = 0; image.height = 0; }
            if (textJob.current === controller) textJob.current = null;
        }
    };
    useEffect(() => {
        autoText.current = () => {
            if (!cameraRunning || textJob.current || locked.current || manualEditing.current) return;
            try { void readLabel(capturePartNumberFrame(videoRef.current), true); }
            catch { /* A missing video frame will be retried by a later camera tick. */ }
        };
    });
    const cancelRead = () => {
        textJob.current?.abort(); textJob.current = null;
        setState('text-review'); setMessage('Reading cancelled. Enter the part number or restart the camera.');
    };
    const scanPhoto = async (event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file || locked.current || photoJob.current) return;
        textJob.current?.abort(); textJob.current = null;
        if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) { setMessage('Choose an image smaller than 20 MB.'); return; }
        stop(); setTorchAvailable(false); setState('photo'); setMessage('Reading barcode photo…');
        let url; let decoder; let image;
        const controller = new AbortController();
        const job = { cancelled: false, close() { this.cancelled = true; controller.abort(); decoder?.close(); if (url) { URL.revokeObjectURL(url); url = null; } if (image) { image.onload = null; image.onerror = null; image.src = ''; } } };
        photoJob.current = job;
        try {
            url = URL.createObjectURL(file); image = new Image();
            await withTimeout(new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; }), 10000, controller.signal);
            if (job.cancelled) return;
            decoder = createScannerDecoder();
            for (let attempt = 0; attempt < 8; attempt++) {
                if (job.cancelled) return;
                const result = await decoder.decode(image, attempt, true);
                if (job.cancelled) return;
                if (result.text) { void completeRef.current(result.text); return; }
            }
            // Same photo, same scanner: use label text only if no barcode was decoded.
            job.close(); if (photoJob.current === job) photoJob.current = null;
            if (alive.current) await readLabel(file);
        } catch {
            if (!job.cancelled && alive.current) { setState('camera-error'); setMessage('Unable to read that photo. Try a clear JPG or PNG, or enter the code manually.'); }
        } finally { job.close(); if (photoJob.current === job) photoJob.current = null; }
    };

    const busy = ['processing', 'success', 'result-error', 'photo', 'text-reading'].includes(state);
    return <Modal isOpen onClose={close} title="Scan product" size="md" className="barcode-scanner-modal" closeOnBackdrop={false}>
        <div ref={rootRef} className="barcode-scanner" data-barcode-scanner>
            <p className="scanner-label-help"><ScanText size={17} aria-hidden="true" />Automatic barcode + part-number detection</p>
            <div className={`barcode-viewport ${detected ? 'barcode-accepted' : ''} ${labelImage ? 'barcode-label-found' : ''}`}>
                <video ref={videoRef} muted playsInline autoPlay aria-label="Barcode camera preview" className={labelImage ? 'hidden' : ''} />
                {labelImage ? <img src={labelImage} alt="Captured product label to compare with the detected number" /> : <div className="barcode-guide" aria-hidden="true"><span /></div>}
                {['initializing', 'permission'].includes(state) && <div className="barcode-camera-state"><Loader2 className="motion-safe:animate-spin" /><span>{state === 'permission' ? 'Camera permission' : 'Starting camera'}</span></div>}
                {['camera-error', 'permission-denied', 'paused'].includes(state) && <div className="barcode-camera-state"><Camera size={30} /><span>Camera unavailable</span></div>}
                {state === 'text-reading' && <div className="barcode-camera-state"><Loader2 className="motion-safe:animate-spin" /><span>Reading label on your device</span></div>}
                {detected && <div className="barcode-camera-state"><Check size={32} /><strong>{labelImage ? 'Part number confirmed' : 'Barcode detected'}</strong><code>{detected}</code></div>}
            </div>
            <p className="barcode-status" role="status" aria-live="polite">{message}</p>
            {state === 'text-reading' && <Button variant="secondary" onClick={cancelRead}>Cancel reading</Button>}
            <div className="barcode-controls">
                <Button variant="secondary" onClick={restartCamera} disabled={busy} aria-label="Restart scanner" title="Restart scanner"><RefreshCw size={20} /></Button>
                {cameras.length > 1 && <label className="barcode-camera-select"><SwitchCamera size={20} aria-hidden="true" /><select aria-label="Choose camera" value={cameraId || activeCameraId} onChange={(event) => { textJob.current?.abort(); stop(); setCameraId(event.target.value); }} disabled={busy}>
                    {cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}
                </select></label>}
                {torchAvailable && cameraRunning && <Button variant="secondary" onClick={toggleTorch} disabled={controlBusy || busy} aria-label={torchOn ? 'Turn flash off' : 'Turn flash on'} aria-pressed={torchOn}>{torchOn ? <ZapOff size={20} /> : <Zap size={20} />}</Button>}
                <label className={`barcode-photo-button ${busy ? 'opacity-50' : ''}`}><ImageUp size={20} aria-hidden="true" />Photo<input type="file" accept="image/*" capture="environment" aria-label="Take or choose a barcode photo" onChange={scanPhoto} disabled={busy} /></label>
            </div>
            {labelImage && <div className="scanner-label-review"><p>Check against the label: O / 0 and I / 1 can look alike.</p>
                {candidates.length > 1 && <label>Numbers found<select aria-label="Detected part numbers" value={candidates.includes(manualCode) ? manualCode : ''} onChange={(event) => { manualEditing.current = true; setManualCode(event.target.value); }} disabled={busy}><option value="" disabled>Choose a number from this label</option>{candidates.map(code => <option key={code} value={code}>{code}</option>)}</select></label>}
            </div>}
            <form className="barcode-manual" onSubmit={(event) => { event.preventDefault(); void completeRef.current(manualCode); }}>
                <label htmlFor={id}>{labelImage ? 'Confirm detected number' : 'Enter barcode manually'}</label>
                <div><input id={id} value={manualCode} onChange={(event) => { manualEditing.current = Boolean(event.target.value.trim()); setManualCode(event.target.value); }} placeholder="Barcode or printed part number" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={160} disabled={busy} /><Button type="submit" disabled={busy || !manualCode.trim()}>Use code</Button></div>
            </form>
        </div>
    </Modal>;
}

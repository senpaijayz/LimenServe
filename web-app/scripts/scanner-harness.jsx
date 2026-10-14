// Local verification harness only. Not imported by the application or build.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import bwip from 'bwip-js';
import CameraScannerModal from '../src/components/ui/CameraScannerModal';
import { createScannerDecoder } from '../src/utils/scannerDecoder';
import '../src/index.css';

function symbol(bcid = 'code39', text = 'MD094120') {
    const canvas = document.createElement('canvas');
    bwip.toCanvas(canvas, { bcid, text, scale: 3, height: 20, padding: 20, backgroundcolor: 'FFFFFF', includecheck: bcid === 'code93' });
    return canvas;
}
let fakeStream;
window.scannerTest = {
    async decodeCases() {
        const decoder = createScannerDecoder(); const results = [];
        try {
            for (const [name, angle, size, filter] of [
                ['normal', 0, 1, 'none'], ['vertical', 90, 1, 'none'], ['tilted', 12, 1, 'none'],
                ['small', 0, 0.5, 'none'], ['large', 0, 1.6, 'none'],
                ['dim', 0, 1, 'brightness(0.35)'], ['bright', 0, 1, 'brightness(1.7)'], ['mild blur', 0, 1, 'blur(0.6px)'],
            ]) {
                const code = symbol(); const frame = document.createElement('canvas'); frame.width = 1280; frame.height = 960;
                const ctx = frame.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1280, 960);
                ctx.translate(640, 480); ctx.rotate(angle * Math.PI / 180); ctx.scale(size, size); ctx.drawImage(code, -code.width / 2, -code.height / 2);
                const adjusted = document.createElement('canvas'); adjusted.width = frame.width; adjusted.height = frame.height;
                const output = adjusted.getContext('2d'); output.filter = filter; output.drawImage(frame, 0, 0);
                let result; const start = performance.now();
                for (let attempt = 0; attempt < 4; attempt++) { result = await decoder.decode(adjusted, attempt); if (result.text) break; }
                results.push({ name, code: result.text, ms: Math.round(performance.now() - start) });
                if (result.text !== 'MD094120') throw new Error(`${name}: expected MD094120, got ${result.text}`);
            }
        } finally { decoder.close(); }
        return results;
    },
    fakeCamera() {
        // Real MediaStream/video/worker pipeline, synthetic label source. This
        // does NOT stand in for physical iPhone/Android acceptance testing.
        const frame = symbol();
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
            fakeStream = frame.captureStream(10);
            const track = fakeStream.getVideoTracks()[0];
            const timer = setInterval(() => {
                if (track.readyState === 'ended') clearInterval(timer);
                else { frame.getContext('2d').fillRect(0, 0, 1, 1); track.requestFrame?.(); }
            }, 100);
            return fakeStream;
        } });
    },
    tracksEnded: () => fakeStream?.getTracks().every((track) => track.readyState === 'ended'),
    async photo() {
        const blob = await new Promise((resolve) => symbol('code128', '6370A933HA').toBlob(resolve));
        const input = document.querySelector('input[type=file]'); const transfer = new DataTransfer();
        transfer.items.add(new File([blob], 'barcode.png', { type: 'image/png' })); input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    },
};

export default function Harness() {
    const [open, setOpen] = useState(false); const [values, setValues] = useState([]);
    return <main style={{ padding: 24 }}><h1>Scanner verification</h1>
        <button onClick={() => setOpen(true)}>Open scanner</button>
        <output aria-label="Scanned results">{values.join(', ')}</output>
        <CameraScannerModal isOpen={open} onClose={() => setOpen(false)} onScan={async (value) => { setValues((old) => [...old, value]); return { found: true }; }} />
    </main>;
}
createRoot(document.getElementById('root')).render(<Harness />);

import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { decode, dispose, createDecoder } = vi.hoisted(() => {
    const decode = vi.fn(); const dispose = vi.fn();
    return { decode, dispose, createDecoder: vi.fn(() => ({ decode, close: dispose })) };
});
vi.mock('../utils/scannerDecoder', () => ({ createScannerDecoder: createDecoder }));
import CameraScannerModal from '../components/ui/CameraScannerModal';
import Modal from '../components/ui/Modal';

const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let track; let stream; let getUserMedia;
const props = () => ({ isOpen: true, onClose: vi.fn(), onScan: vi.fn() });
beforeEach(() => {
    track = { stop: vi.fn(), getCapabilities: () => ({ torch: true, focusMode: ['continuous'] }), getSettings: () => ({ deviceId: 'back' }), applyConstraints: vi.fn().mockResolvedValue(), onended: null };
    stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([{ kind: 'videoinput', deviceId: 'back', label: 'Rear camera' }, { kind: 'videoinput', deviceId: 'front', label: 'Front camera' }]) } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
    decode.mockReset().mockResolvedValue({ text: '' }); dispose.mockClear(); createDecoder.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const ready = () => waitFor(() => expect(screen.getByRole('status').textContent).toContain('Ready to scan'));

describe('camera scanner lifecycle', () => {
    it('prefers rear camera, uses supported autofocus, and does not restart on parent rerender', async () => {
        const p = props(); const view = render(<CameraScannerModal {...p} />); await ready();
        expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: expect.objectContaining({ facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }) });
        expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ focusMode: 'continuous' }] });
        view.rerender(<CameraScannerModal {...props()} />); await ready();
        expect(getUserMedia).toHaveBeenCalledTimes(1);
        view.unmount(); expect(track.stop).toHaveBeenCalled(); expect(dispose).toHaveBeenCalled();
    });
    it('starts only one camera in StrictMode', async () => {
        render(<StrictMode><CameraScannerModal {...props()} /></StrictMode>); await ready();
        expect(getUserMedia).toHaveBeenCalledTimes(1);
    });
    it('stops a late permission grant after close and never decodes', async () => {
        const request = deferred(); getUserMedia.mockReturnValue(request.promise);
        const view = render(<CameraScannerModal {...props()} />);
        await waitFor(() => expect(getUserMedia).toHaveBeenCalled()); view.unmount();
        await act(async () => { request.resolve(stream); await request.promise; });
        expect(track.stop).toHaveBeenCalled(); expect(createDecoder).not.toHaveBeenCalled();
    });
    it('rejects a second open scanner without taking over the first camera', async () => {
        render(<><CameraScannerModal {...props()} /><CameraScannerModal {...props()} /></>);
        await waitFor(() => expect(screen.getByText(/Another scanner/)).toBeTruthy());
        expect(getUserMedia).toHaveBeenCalledTimes(1);
    });
    it.each(['NotAllowedError', 'NotFoundError', 'NotReadableError', 'SecurityError'])('shows a useful %s message with manual fallback', async (name) => {
        getUserMedia.mockRejectedValue(Object.assign(new Error('technical'), { name }));
        const p = props(); render(<CameraScannerModal {...p} />);
        await waitFor(() => expect(screen.getByText('Camera unavailable')).toBeTruthy());
        expect(screen.queryByText('technical')).toBeNull();
        fireEvent.change(screen.getByLabelText('Enter barcode manually'), { target: { value: '* MD0941200001 *' } });
        fireEvent.click(screen.getByText('Use code'));
        await waitFor(() => expect(p.onScan).toHaveBeenCalledWith('MD0941200001'));
    });
    it('accepts only one manual submission while processing and preserves numeric suffixes', async () => {
        const processing = deferred(); const p = props(); p.onScan.mockReturnValue(processing.promise);
        render(<CameraScannerModal {...p} />); await ready();
        const input = screen.getByLabelText('Enter barcode manually');
        fireEvent.change(input, { target: { value: '12345670001' } });
        fireEvent.submit(input.closest('form')); fireEvent.submit(input.closest('form'));
        expect(p.onScan).toHaveBeenCalledTimes(1); expect(p.onScan).toHaveBeenCalledWith('12345670001');
        expect(track.stop).toHaveBeenCalled(); expect(p.onClose).not.toHaveBeenCalled();
        await act(async () => processing.resolve());
        expect(screen.getByRole('status').textContent).toBe('Scan successful');
        await waitFor(() => expect(p.onClose).toHaveBeenCalledTimes(1));
    });
    it('requires repeated live frames and stops before calling the parent', async () => {
        decode.mockResolvedValue({ text: '6370A933HA', format: 'CODE_39' });
        const p = props(); render(<CameraScannerModal {...p} />);
        await waitFor(() => expect(p.onScan).toHaveBeenCalledWith('6370A933HA'));
        expect(decode).toHaveBeenCalledTimes(2); expect(track.stop).toHaveBeenCalled();
        expect(p.onScan).toHaveBeenCalledTimes(1);
    });
    it('ignores late decode results after unmount', async () => {
        const frame = deferred(); decode.mockReturnValue(frame.promise);
        const p = props(); const view = render(<CameraScannerModal {...p} />); await ready(); view.unmount();
        await act(async () => frame.resolve({ text: 'MD094120' })); expect(p.onScan).not.toHaveBeenCalled();
    });
    it('reports parent failures without automatic resubmission', async () => {
        const p = props(); p.onScan.mockRejectedValue(new Error('database secret'));
        render(<CameraScannerModal {...p} />); await ready();
        fireEvent.change(screen.getByLabelText('Enter barcode manually'), { target: { value: 'MD094120' } }); fireEvent.click(screen.getByText('Use code'));
        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('could not be processed'));
        expect(p.onScan).toHaveBeenCalledTimes(1); expect(p.onClose).not.toHaveBeenCalled();
    });
    it('shows a no-match result rather than claiming the product was found', async () => {
        const p = props(); p.onScan.mockResolvedValue({ found: false });
        render(<CameraScannerModal {...p} />); await ready();
        fireEvent.change(screen.getByLabelText('Enter barcode manually'), { target: { value: 'UNKNOWN' } }); fireEvent.click(screen.getByText('Use code'));
        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('no matching part'));
        expect(p.onClose).not.toHaveBeenCalled();
    });
    it('switches cameras only after releasing the previous stream and toggles supported torch', async () => {
        render(<CameraScannerModal {...props()} />); await ready();
        fireEvent.click(screen.getByLabelText('Turn flash on'));
        await waitFor(() => expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] }));
        fireEvent.change(screen.getByLabelText('Choose camera'), { target: { value: 'front' } });
        await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
        expect(track.stop).toHaveBeenCalled();
        expect(getUserMedia.mock.calls[1][0].video.deviceId).toEqual({ exact: 'front' });
    });
    it('hides unsupported camera controls', async () => {
        track.getCapabilities = () => ({}); navigator.mediaDevices.enumerateDevices.mockResolvedValue([]);
        render(<CameraScannerModal {...props()} />); await ready();
        expect(screen.queryByLabelText('Turn flash on')).toBeNull(); expect(screen.queryByLabelText('Choose camera')).toBeNull();
    });
    it('releases camera when the page becomes hidden', async () => {
        render(<CameraScannerModal {...props()} />); await ready();
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        fireEvent(document, new Event('visibilitychange'));
        expect(track.stop).toHaveBeenCalled(); expect(screen.getByRole('status').textContent).toContain('paused'); hidden.mockRestore();
    });
    it('times out an unanswered permission prompt and still releases its late stream', async () => {
        vi.useFakeTimers(); const request = deferred(); getUserMedia.mockReturnValue(request.promise);
        render(<CameraScannerModal {...props()} />);
        await act(async () => { await Promise.resolve(); });
        await act(async () => { await vi.advanceTimersByTimeAsync(15001); });
        expect(screen.getByRole('status').textContent).toContain('did not respond');
        await act(async () => request.resolve(stream)); expect(track.stop).toHaveBeenCalled();
    });
    it('times out a camera which starts but never supplies frames', async () => {
        vi.useFakeTimers(); vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(0);
        render(<CameraScannerModal {...props()} />);
        await act(async () => { await vi.advanceTimersByTimeAsync(7500); });
        expect(screen.getByRole('status').textContent).toContain('did not respond');
        expect(track.stop).toHaveBeenCalled(); expect(decode).not.toHaveBeenCalled();
    });
    it('rejects invalid manual codes without calling the parent', async () => {
        const p = props(); render(<CameraScannerModal {...p} />); await ready();
        fireEvent.change(screen.getByLabelText('Enter barcode manually'), { target: { value: 'https://bad.example' } }); fireEvent.click(screen.getByText('Use code'));
        expect(screen.getByRole('status').textContent).toContain('not a valid product barcode'); expect(p.onScan).not.toHaveBeenCalled();
    });
    it('handles torch rejection without stopping scanning', async () => {
        render(<CameraScannerModal {...props()} />); await ready(); track.applyConstraints.mockRejectedValue(new Error('unsupported'));
        fireEvent.click(screen.getByLabelText('Turn flash on'));
        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Flash is unavailable'));
        expect(track.stop).not.toHaveBeenCalled();
    });
    it('releases camera before decoding a photo and revokes its URL', async () => {
        const p = props(); render(<CameraScannerModal {...p} />); await ready();
        vi.stubGlobal('Image', class { set src(value) { if (value) queueMicrotask(() => this.onload?.()); } });
        const revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: revoke });
        decode.mockResolvedValue({ text: '6370A933HA' });
        fireEvent.change(screen.getByLabelText('Take or choose a barcode photo'), { target: { files: [new File(['png'], 'label.png', { type: 'image/png' })] } });
        await waitFor(() => expect(p.onScan).toHaveBeenCalledWith('6370A933HA'));
        expect(track.stop).toHaveBeenCalled(); expect(decode).toHaveBeenCalledWith(expect.anything(), 0, true);
        expect(revoke).toHaveBeenCalledTimes(1);
    });
    it('cleans up a photo that is still loading when closed', async () => {
        const p = props(); const view = render(<CameraScannerModal {...p} />); await ready();
        vi.stubGlobal('Image', class { set src(value) { this.value = value; } });
        const revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: revoke });
        fireEvent.change(screen.getByLabelText('Take or choose a barcode photo'), { target: { files: [new File(['png'], 'label.png', { type: 'image/png' })] } });
        view.unmount(); await act(async () => {});
        expect(revoke).toHaveBeenCalledTimes(1); expect(p.onScan).not.toHaveBeenCalled();
    });
    it('closes only the top scanner on Escape and keeps keyboard focus inside it', async () => {
        const parentEscape = vi.fn(); document.addEventListener('keydown', parentEscape);
        const p = props(); render(<CameraScannerModal {...p} />); await ready();
        const first = screen.getByLabelText('Close modal'); first.focus();
        fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(screen.getByLabelText('Enter barcode manually'));
        parentEscape.mockClear(); fireEvent.keyDown(document, { key: 'Escape' });
        expect(p.onClose).toHaveBeenCalledTimes(1); expect(parentEscape).not.toHaveBeenCalled();
        document.removeEventListener('keydown', parentEscape);
    });
    it('opens a fresh camera after closing and reopening', async () => {
        const p = props(); const view = render(<CameraScannerModal {...p} />); await ready();
        view.rerender(<CameraScannerModal {...p} isOpen={false} />);
        expect(track.stop).toHaveBeenCalled();
        view.rerender(<CameraScannerModal {...p} />); await ready(); expect(getUserMedia).toHaveBeenCalledTimes(2);
    });
    it('preserves the parent dialog scroll lock after closing the scanner', async () => {
        const p = props(); const parent = (open) => <Modal isOpen title="Receive stock" onClose={() => {}}><CameraScannerModal {...p} isOpen={open} /></Modal>;
        const view = render(parent(true)); await ready(); view.rerender(parent(false));
        expect(document.body.style.overflow).toBe('hidden');
        view.unmount(); expect(document.body.style.overflow).toBe('');
    });
});

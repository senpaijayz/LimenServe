import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useBarcodeScanner from '../hooks/useBarcodeScanner';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const scan = async (code) => act(async () => {
    for (const key of [...code, 'Enter']) fireEvent.keyDown(window, { key });
    await Promise.resolve();
});
describe('hardware barcode input', () => {
    it('debounces repeats, uses the latest callback and removes listeners on unmount', async () => {
        let now = 10000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const first = vi.fn(); const second = vi.fn();
        const view = renderHook(({ cb }) => useBarcodeScanner(cb), { initialProps: { cb: first } });
        await scan('MD094120'); await scan('MD094120'); expect(first).toHaveBeenCalledTimes(1);
        now += 900; view.rerender({ cb: second }); await scan('MD094120'); expect(second).toHaveBeenCalledTimes(1);
        view.unmount(); await scan('6370A933HA'); expect(second).toHaveBeenCalledTimes(1);
    });
    it('does not intercept manual input while a camera dialog is open', async () => {
        const modal = document.createElement('div'); modal.dataset.barcodeScanner = ''; document.body.append(modal);
        const cb = vi.fn(); renderHook(() => useBarcodeScanner(cb)); await scan('MD094120');
        expect(cb).not.toHaveBeenCalled(); modal.remove();
    });
    it('discards stale typing before Enter', async () => {
        let now = 10000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const cb = vi.fn(); renderHook(() => useBarcodeScanner(cb));
        for (const key of 'MD094120') fireEvent.keyDown(window, { key });
        now += 1000; fireEvent.keyDown(window, { key: 'Enter' });
        await act(async () => {}); expect(cb).not.toHaveBeenCalled();
    });
});

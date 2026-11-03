import { afterEach, describe, expect, it, vi } from 'vitest';
import { preparePartNumberPhoto } from '../utils/partNumberImage';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('bounded, local label photos', () => {
    it('rejects unsupported or oversized files before decoding', async () => {
        await expect(preparePartNumberPhoto(new File(['text'], 'invoice.pdf', { type: 'application/pdf' }))).rejects.toThrow(/JPG, PNG or WebP/);
        await expect(preparePartNumberPhoto({ type: 'image/jpeg', size: 9 * 1024 * 1024 })).rejects.toThrow(/8 MB/);
    });
    it('limits the processed image edge and releases the source photo URL', async () => {
        const revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:label'), revokeObjectURL: revoke });
        vi.stubGlobal('Image', class { naturalWidth = 3000; naturalHeight = 2000; set src(value) { if (value) queueMicrotask(() => this.onload?.()); } });
        const draw = vi.fn(); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage: draw });
        const canvas = await preparePartNumberPhoto(new File(['png'], 'label.png', { type: 'image/png' }));
        expect(canvas.width).toBe(1600); expect(canvas.height).toBe(1067); expect(draw).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce();
    });
    it('releases a photo still loading when the scanner is closed', async () => {
        const revoke = vi.fn(); const image = { set src(value) { this.currentSource = value; } };
        vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:label'), revokeObjectURL: revoke });
        vi.stubGlobal('Image', class { constructor() { return image; } });
        const controller = new AbortController(); const result = preparePartNumberPhoto(new File(['png'], 'label.png', { type: 'image/png' }), controller.signal);
        controller.abort(); await expect(result).rejects.toMatchObject({ name: 'AbortError' });
        expect(revoke).toHaveBeenCalledOnce(); expect(image.currentSource).toBe(''); expect(image.onload).toBeNull();
    });
});

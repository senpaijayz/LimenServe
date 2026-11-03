import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createWorker: vi.fn() }));
vi.mock('tesseract.js', () => ({ createWorker: mocks.createWorker }));
const image = () => ({ width: 1600, height: 300, toDataURL: vi.fn(() => 'data:image/png;base64,label') });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const worker = () => ({ setParameters: vi.fn().mockResolvedValue({}), recognize: vi.fn().mockResolvedValue({ data: { text: 'PART NO: MR446308', confidence: 95 } }), terminate: vi.fn().mockResolvedValue() });
afterEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.useRealTimers(); });
describe('on-device product label worker', () => {
    it('uses same-origin assets only and terminates after one read', async () => {
        const w = worker(); mocks.createWorker.mockResolvedValue(w);
        const { readPartNumberLabel } = await import('../utils/partNumberReader');
        expect(await readPartNumberLabel(image())).toEqual({ candidates: ['MR446308'], confidence: 95 });
        expect(mocks.createWorker).toHaveBeenCalledWith('eng', 1, expect.objectContaining({ workerPath: '/part-number-reader/worker.min.js', corePath: '/part-number-reader', langPath: '/part-number-reader', legacyCore: false }));
        expect(w.recognize).toHaveBeenCalledTimes(1); expect(w.terminate).toHaveBeenCalledTimes(1);
    });
    it('rejects overlapping jobs and disposes a worker initialized after abort', async () => {
        const delayed = deferred(); mocks.createWorker.mockReturnValue(delayed.promise);
        const { readPartNumberLabel } = await import('../utils/partNumberReader');
        const controller = new AbortController();
        const first = readPartNumberLabel(image(), { signal: controller.signal });
        await vi.waitFor(() => expect(mocks.createWorker).toHaveBeenCalled());
        await expect(readPartNumberLabel(image())).rejects.toThrow(/still closing/);
        controller.abort(); await expect(first).rejects.toMatchObject({ name: 'AbortError' });
        const late = worker(); delayed.resolve(late); await vi.waitFor(() => expect(late.terminate).toHaveBeenCalled());
        expect(late.recognize).not.toHaveBeenCalled();
    });
    it('times out recognition and terminates rather than automatically retrying', async () => {
        vi.useFakeTimers(); const w = worker(); w.recognize.mockReturnValue(new Promise(() => {})); mocks.createWorker.mockResolvedValue(w);
        const { readPartNumberLabel } = await import('../utils/partNumberReader');
        const result = expect(readPartNumberLabel(image())).rejects.toThrow(/too long/);
        await vi.advanceTimersByTimeAsync(20001); await result;
        expect(w.terminate).toHaveBeenCalled(); expect(w.recognize).toHaveBeenCalledTimes(1);
    });
    it('rejects oversized images before loading a worker', async () => {
        const { readPartNumberLabel } = await import('../utils/partNumberReader');
        await expect(readPartNumberLabel({ width: 5000, height: 5000 })).rejects.toThrow(/close-up/);
        expect(mocks.createWorker).not.toHaveBeenCalled();
    });
});

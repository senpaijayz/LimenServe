import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/apiClient', () => ({ default: { post: vi.fn() } }));
import api from '../services/apiClient';
import { assignProductLocation, getProductLocations, loadStoreLayout, saveStoreLayout, setStoreLayoutPriority } from '../modules/locator3d/services/locator3DApi';
const row = { id: 'layout-a', name: 'Workshop', store_id: 'store-a', revision: 5, status: 'published', metadata: { scene: { objects: [] }, locations: [{ productId: 'part-a', shelfObjectId: 'shelf-a', layoutId: 'layout-a' }] } };
describe('normalized locator API', () => {
    beforeEach(() => { vi.resetAllMocks(); api.post.mockResolvedValue({ data: { result: row } }); });
    it('loads a layout and its mappings together', async () => {
        expect(await loadStoreLayout('Workshop')).toMatchObject({ id: 'layout-a', revision: 5, locations: row.metadata.locations });
        expect(api.post).toHaveBeenCalledWith('/locator/command', { action: 'load', payload: { name: 'Workshop' } });
    });
    it('sends the revision seen by the editor, not a cached newer revision', async () => {
        await saveStoreLayout([], 'Workshop', { layoutId: 'layout-a', expectedRevision: 3 });
        expect(api.post.mock.calls[0][1]).toEqual({ action: 'save', payload: { name: 'Workshop', objects: [], layoutId: 'layout-a', expectedRevision: 3 } });
    });
    it('publishes explicitly rather than updating priorities in parallel', async () => {
        await setStoreLayoutPriority('Workshop', { layoutId: 'layout-a', expectedRevision: 5 });
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(api.post.mock.calls[0][1].action).toBe('publish');
    });
    it('uses only the published snapshot for inventory assignments', async () => {
        const location = await assignProductLocation({ productId: 'part-a', shelfObjectId: 'shelf-a' });
        expect(api.post.mock.calls[0][1].payload.publishedOnly).toBe(true);
        expect(api.post.mock.calls[1][1].payload.expectedRevision).toBe(5);
        expect(location.layoutRevision).toBe(5);
    });
    it('never fetches global unscoped legacy locations', async () => {
        expect(await getProductLocations()).toEqual(row.metadata.locations);
        expect(api.post.mock.calls[0][1]).toEqual({ action: 'load', payload: { name: '', publishedOnly: true } });
    });
    it('retains conflicts for the caller without retrying the write', async () => {
        api.post.mockRejectedValue({ response: { status: 409, data: { error: 'Reload before saving.' } } });
        await expect(saveStoreLayout([], 'Workshop')).rejects.toMatchObject({ status: 409, message: 'Reload before saving.' });
        expect(api.post).toHaveBeenCalledTimes(1);
    });
});

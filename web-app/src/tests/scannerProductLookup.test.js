import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/catalogApi', () => ({ getProductCatalog: vi.fn() }));
import { getProductCatalog } from '../services/catalogApi';
import useDataStore from '../store/useDataStore';

afterEach(() => { useDataStore.setState({ products: [] }); vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('scanner catalogue integration', () => {
    it('keeps the exact full identifier before legacy alternatives', async () => {
        const exact = { id: 'two', sku: 'MD0941200001' };
        useDataStore.setState({ products: [{ id: 'one', sku: 'MD094120' }, exact] });
        expect(await useDataStore.getState().findProduct('MD0941200001')).toBe(exact);
        expect(getProductCatalog).not.toHaveBeenCalled();
    });
    it('looks up the validated value remotely and returns the matching product', async () => {
        getProductCatalog.mockResolvedValue({ products: [{ id: 'one', sku: '6370A933HA', name: 'Lock', stock: 4 }] });
        const result = await useDataStore.getState().findProduct('6370A933HA', { throwOnError: true });
        expect(getProductCatalog).toHaveBeenCalledWith(expect.objectContaining({ q: '6370A933HA', includeCategories: false }));
        expect(result.sku).toBe('6370A933HA'); expect(result.quantity).toBe(4);
    });
    it('distinguishes lookup failure from no matching part without changing legacy callers', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        getProductCatalog.mockRejectedValue(new Error('Network failed'));
        await expect(useDataStore.getState().findProduct('MD094120', { throwOnError: true })).rejects.toThrow('Network failed');
        expect(await useDataStore.getState().findProduct('MD094120')).toBeNull();
        getProductCatalog.mockResolvedValue({ products: [] });
        expect(await useDataStore.getState().findProduct('MD094120', { throwOnError: true })).toBeNull();
    });
});

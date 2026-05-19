import { describe, expect, it } from 'vitest';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

describe('stock receipt to 3D locator handoff', () => {
    it('stores recently received items and exposes highlight lookups', () => {
        resetLocator3DStore();

        useLocator3DStore.getState().setRecentlyReceivedStock({
            receiptId: 'receipt-1',
            source: 'stock_receipt',
            returnTo: '/inventory',
            items: [
                { productId: 'product-1', partNumber: 'MD360935', description: 'FILTER, OIL', quantity: 12 },
                { productId: 'product-2', partNumber: 'MR984204', description: 'ELEMENT, AIR CLEANER', quantity: 6 },
            ],
        });

        const state = useLocator3DStore.getState();
        expect(state.recentlyReceivedStock.items).toHaveLength(2);
        expect(state.isRecentlyReceivedProduct('product-1')).toBe(true);
        expect(state.getRecentlyReceivedProduct('product-2')).toEqual(expect.objectContaining({
            partNumber: 'MR984204',
            quantity: 6,
        }));

        useLocator3DStore.getState().clearRecentlyReceivedStock();
        expect(useLocator3DStore.getState().recentlyReceivedStock.items).toEqual([]);
    });
});

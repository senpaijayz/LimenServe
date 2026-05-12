import { beforeEach, describe, expect, it, vi } from 'vitest';

const chains = [];

function createChain(table) {
    const chain = {
        table,
        calls: [],
        data: table === 'store_layouts'
            ? {
                id: 'layout-1',
                layout_name: 'main-store',
                layout_data: { objects: [{ id: 'floor-main' }] },
                updated_at: '2026-05-12T00:00:00.000Z',
            }
            : {
                product_id: 'product-1',
                product_name: 'Oil Filter',
                sku: 'OF-1',
                aisle: 'C',
                shelf_number: 3,
                bin_number: 4,
                floor: 2,
                shelf_object_id: 'shelf-4-b',
            },
        delete: vi.fn(() => chain),
        eq: vi.fn((column, value) => {
            chain.calls.push(['eq', column, value]);
            return chain;
        }),
        limit: vi.fn((value) => {
            chain.calls.push(['limit', value]);
            return chain;
        }),
        order: vi.fn((column, options) => {
            chain.calls.push(['order', column, options]);
            return chain;
        }),
        select: vi.fn((columns) => {
            chain.calls.push(['select', columns]);
            return chain;
        }),
        single: vi.fn(async () => ({ data: chain.data, error: null })),
        upsert: vi.fn((payload, options) => {
            chain.calls.push(['upsert', payload, options]);
            return chain;
        }),
    };

    chains.push(chain);
    return chain;
}

vi.mock('../services/supabase', () => ({
    supabase: {
        from: vi.fn((table) => createChain(table)),
    },
}));

import {
    assignProductLocation,
    getProductLocation,
    loadStoreLayout,
    saveStoreLayout,
} from '../modules/locator3d/services/locator3DApi';

describe('3D Locator Supabase API', () => {
    beforeEach(() => {
        chains.length = 0;
    });

    it('saves the full scene layout as jsonb data', async () => {
        const layout = await saveStoreLayout([{ id: 'shelf-1', position: [1, 0, 1] }]);
        const chain = chains[0];

        expect(chain.table).toBe('store_layouts');
        expect(chain.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                layout_name: 'main-store',
                layout_data: expect.objectContaining({
                    objects: [{ id: 'shelf-1', position: [1, 0, 1] }],
                    version: 1,
                }),
            }),
            { onConflict: 'layout_name' },
        );
        expect(layout.layoutData.objects[0].id).toBe('floor-main');
    });

    it('loads the latest saved layout', async () => {
        const layout = await loadStoreLayout();
        const chain = chains[0];

        expect(chain.table).toBe('store_layouts');
        expect(chain.eq).toHaveBeenCalledWith('layout_name', 'main-store');
        expect(layout.layoutData.objects[0].id).toBe('floor-main');
    });

    it('upserts and reads product shelf locations', async () => {
        const location = await assignProductLocation({
            productId: 'product-1',
            productName: 'Oil Filter',
            sku: 'OF-1',
            aisle: 'C',
            shelfNumber: 3,
            binNumber: 4,
            floor: 2,
            shelfObjectId: 'shelf-4-b',
        });

        expect(chains[0].table).toBe('product_locations');
        expect(chains[0].upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                product_id: 'product-1',
                aisle: 'C',
                shelf_number: 3,
                bin_number: 4,
            }),
            { onConflict: 'product_id' },
        );
        expect(location.shelfNumber).toBe(3);

        const loaded = await getProductLocation('product-1');
        expect(chains[1].eq).toHaveBeenCalledWith('product_id', 'product-1');
        expect(loaded.binNumber).toBe(4);
    });
});

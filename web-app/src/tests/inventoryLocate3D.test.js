import { describe, expect, it } from 'vitest';
import { buildLocator3DUrl } from '../modules/locator3d/utils/locatorNavigation';

describe('inventory Locate in 3D navigation', () => {
    it('builds a locator route with product context', () => {
        expect(buildLocator3DUrl({
            id: 'product-1',
            sku: 'OF-1',
            name: 'Oil Filter',
        })).toBe('/locator-3d?productId=product-1&sku=OF-1&name=Oil+Filter');
    });
});

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ProductCard from '../modules/inventory/components/ProductCard';
import { buildLocator3DUrl } from '../modules/locator3d/utils/locatorNavigation';

describe('inventory Locate in 3D navigation', () => {
    it('builds a locator route with product context', () => {
        expect(buildLocator3DUrl({
            id: 'product-1',
            sku: 'OF-1',
            name: 'Oil Filter',
        })).toBe('/locator-3d?productId=product-1&sku=OF-1&name=Oil+Filter');
    });

    it('renders a focused Locate in 3D action on inventory product cards', () => {
        const onLocate = vi.fn();
        const product = {
            id: 'product-1',
            name: 'Oil Filter',
            price: 850,
            quantity: 12,
            sku: 'OF-1',
        };

        render(React.createElement(ProductCard, { product, onLocate }));

        fireEvent.click(screen.getByRole('button', { name: /Locate Oil Filter in 3D/i }));

        expect(onLocate).toHaveBeenCalledWith(product);
    });
});

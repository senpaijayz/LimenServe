import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

vi.mock('../modules/locator3d/components/Locator3DScene', () => ({
    default: () => <div data-testid="locator-3d-scene" />,
}));

vi.mock('../services/catalogApi', () => ({
    getFullProductCatalog: vi.fn(async () => [
        { id: 'product-1', name: 'Oil Filter', sku: 'OF-1' },
        { id: 'product-2', name: 'Brake Pad', sku: 'BP-2' },
    ]),
}));

vi.mock('../modules/locator3d/services/locator3DApi', () => ({
    assignProductLocation: vi.fn(async (location) => location),
    getProductLocation: vi.fn(async () => null),
    getProductLocations: vi.fn(async () => [
        {
            aisle: 'B',
            binNumber: 4,
            floor: 1,
            productId: 'product-1',
            productName: 'Oil Filter',
            shelfNumber: 2,
            shelfObjectId: 'shelf-4-a',
            sku: 'OF-1',
        },
    ]),
    loadStoreLayout: vi.fn(async () => ({ layoutData: { objects: useLocator3DStore.getState().sceneObjects } })),
    listStoreLayouts: vi.fn(async () => [{ layoutName: 'main-store' }]),
    saveStoreLayout: vi.fn(async () => ({ id: 'layout-1' })),
}));

import { saveStoreLayout } from '../modules/locator3d/services/locator3DApi';
import Locator3DAdmin from '../modules/locator3d/pages/Locator3DAdmin';

function renderLocator(route = '/locator-3d') {
    return render(
        <MemoryRouter initialEntries={[route]}>
            <ToastProvider>
                <Locator3DAdmin />
            </ToastProvider>
        </MemoryRouter>,
    );
}

describe('3D Locator premium redesign', () => {
    it('uses a spacious view-mode layout with product search and no heavy object chrome', async () => {
        resetLocator3DStore();

        renderLocator();

        expect(screen.getByText('3D Locator')).toBeTruthy();
        expect(screen.getByRole('switch', { name: 'Design Mode' }).getAttribute('aria-checked')).toBe('false');
        expect(screen.getByTestId('locator-3d-scene')).toBeTruthy();
        expect(screen.getByLabelText('Product Search')).toBeTruthy();
        expect(screen.getByText('How to locate products')).toBeTruthy();
        expect(screen.queryByText('Object Library')).toBeNull();
        expect(screen.queryByText('Properties')).toBeNull();

        fireEvent.change(screen.getByLabelText('Product Search'), { target: { value: 'OF-1' } });
        fireEvent.click(await screen.findByRole('button', { name: /Oil Filter/i }));

        await waitFor(() => expect(useLocator3DStore.getState().locatedProduct?.productId).toBe('product-1'));
        expect(screen.getAllByText(/Product located/i).length).toBeGreaterThan(0);
    });

    it('shows design controls only in design mode and supports layout names, object adds, and property edits', async () => {
        resetLocator3DStore();
        renderLocator();

        fireEvent.click(screen.getByRole('switch', { name: 'Design Mode' }));
        expect(screen.getByText('Design mode tips')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Object Library' })).toBeTruthy();

        const initialCount = useLocator3DStore.getState().sceneObjects.length;
        fireEvent.click(screen.getByRole('button', { name: 'Object Library' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add 2-Layer Shelf' }));
        expect(useLocator3DStore.getState().sceneObjects).toHaveLength(initialCount + 1);

        act(() => {
            useLocator3DStore.getState().forceSelectObject('shelf-4-a');
        });

        const properties = screen.getByRole('complementary', { name: 'Properties' });
        fireEvent.change(within(properties).getByLabelText('Width'), { target: { value: '4.5' } });
        fireEvent.change(within(properties).getByLabelText('Position X'), { target: { value: '-3.5' } });
        fireEvent.change(within(properties).getByLabelText('Rotation Y'), { target: { value: '45' } });
        fireEvent.change(within(properties).getByLabelText('Aisle name'), { target: { value: 'Electronics' } });

        const shelf = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a');
        expect(shelf.dimensions.width).toBe(4.5);
        expect(shelf.position[0]).toBe(-3.5);
        expect(shelf.rotation[1]).toBeCloseTo(Math.PI / 4, 3);
        expect(shelf.aisle).toBe('Electronics');

        fireEvent.click(screen.getByRole('button', { name: 'Save Layout' }));
        fireEvent.change(screen.getByLabelText('Layout name'), { target: { value: 'Flagship Store' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Save Layout' }));

        await waitFor(() => expect(saveStoreLayout).toHaveBeenCalledWith(expect.any(Array), 'Flagship Store'));
    });
});

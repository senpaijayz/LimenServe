import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import AuthContext from '../context/auth-context';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

vi.mock('../modules/locator3d/components/Locator3DScene', () => ({
    default: () => <div data-testid="locator-3d-scene" />,
}));

vi.mock('../services/catalogApi', () => ({
    getFullProductCatalog: vi.fn(async () => [
        { id: 'product-1', name: 'Oil Filter', quantity: 12, sku: 'OF-1', stock: 12 },
        { id: 'product-2', name: 'Brake Pad', quantity: 0, sku: 'BP-2', stock: 0 },
    ]),
}));

vi.mock('../modules/locator3d/services/locator3DApi', () => ({
    assignProductLocation: vi.fn(async (location) => location),
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
            <AuthContext.Provider value={{ isAdmin: true }}>
                <ToastProvider>
                    <Locator3DAdmin />
                </ToastProvider>
            </AuthContext.Provider>
        </MemoryRouter>,
    );
}

describe('3D Locator rebuild', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses a search-first interface with no permanent finder or location panels', async () => {
        resetLocator3DStore();
        useLocator3DStore.getState().setProductLocations([{
            aisle: 'B',
            binNumber: 4,
            floor: 1,
            productId: 'product-1',
            productName: 'Oil Filter',
            shelfNumber: 2,
            shelfObjectId: 'shelf-4-a',
            sku: 'OF-1',
        }]);
        renderLocator();

        expect(screen.getByRole('heading', { name: '3D Stockroom' })).toBeTruthy();
        expect(screen.getByTestId('locator-3d-scene').closest('main')?.getAttribute('aria-label')).toBe('3D stockroom canvas');
        expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Reset camera' })).toBeTruthy();
        expect(screen.queryByLabelText('Design toolbar')).toBeNull();
        expect(screen.queryByText('Located Products')).toBeNull();
        expect(screen.queryByText('Product Location')).toBeNull();

        const search = screen.getByRole('combobox', { name: 'Search products, material codes, shelves, or barcodes' });
        fireEvent.change(search, { target: { value: 'Oil Filter' } });
        fireEvent.click(await screen.findByRole('button', { name: 'Locate Oil Filter' }));

        await waitFor(() => expect(useLocator3DStore.getState().locatedProduct?.productId).toBe('product-1'));
        expect(screen.getByText(/Located Oil Filter/i)).toBeTruthy();
        expect(useLocator3DStore.getState().activeFloor).toBe(1);
    });

    it('deep-links to a mapped product and shows a compact location marker', async () => {
        resetLocator3DStore();
        renderLocator('/locator-3d?productId=product-1');

        await waitFor(() => expect(useLocator3DStore.getState().locatedProduct?.productId).toBe('product-1'));
        expect(screen.getByText('Oil Filter')).toBeTruthy();
        expect(screen.getByText(/Floor 1 · Aisle B · Shelf 2 · Bin 4/i)).toBeTruthy();
        expect(useLocator3DStore.getState().selectedObjectId).toBe('shelf-4-a');
    });

    it('keeps an unmapped deep-linked product safe and explains what is missing', async () => {
        resetLocator3DStore();
        renderLocator('/locator-3d?productId=product-2&sku=BP-2&name=Brake+Pad');

        await screen.findByText(/Brake Pad has no saved shelf and bin location yet/i);
        expect(useLocator3DStore.getState().locatedProduct).toBeNull();
        expect(useLocator3DStore.getState().selectedProductForLocation?.id).toBe('product-2');
    });

    it('keeps design mode canvas-first while supporting add, direct transforms, and save', async () => {
        resetLocator3DStore();
        renderLocator();

        fireEvent.click(screen.getByRole('button', { name: 'Design Mode' }));
        expect(screen.getByRole('heading', { name: '3D Stockroom · Design' })).toBeTruthy();
        expect(screen.getByLabelText('Design toolbar')).toBeTruthy();
        expect(screen.queryByText('Properties')).toBeNull();

        const initialCount = useLocator3DStore.getState().sceneObjects.length;
        fireEvent.click(screen.getByRole('button', { name: 'Add Object' }));
        fireEvent.click(screen.getByRole('button', { name: '2-Layer Shelf' }));
        expect(useLocator3DStore.getState().sceneObjects).toHaveLength(initialCount + 1);

        act(() => {
            useLocator3DStore.getState().forceSelectObject('shelf-4-a');
            useLocator3DStore.getState().updateObjectDimensions('shelf-4-a', { width: 4.5 });
            useLocator3DStore.getState().updateObjectTransform('shelf-4-a', { position: [-3.5, 0, 1], rotation: [0, Math.PI / 4, 0] });
        });

        const shelf = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a');
        expect(shelf.dimensions.width).toBe(4.5);
        expect(shelf.position[0]).toBe(-3.5);
        expect(shelf.rotation[1]).toBeCloseTo(Math.PI / 4, 3);

        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(saveStoreLayout).toHaveBeenCalledWith(expect.any(Array), 'main-store'));
    });

    it('protects mapped shelves from accidental deletion', async () => {
        resetLocator3DStore();
        useLocator3DStore.getState().setProductLocations([{
            floor: 1,
            productId: 'product-1',
            shelfObjectId: 'shelf-4-a',
        }]);
        useLocator3DStore.getState().forceSelectObject('shelf-4-a');
        renderLocator();

        fireEvent.click(screen.getByRole('button', { name: 'Design Mode' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete selected object' }));

        expect(screen.getByText(/This shelf contains 1 mapped product/i)).toBeTruthy();
        expect(useLocator3DStore.getState().sceneObjects.some((object) => object.id === 'shelf-4-a')).toBe(true);
    });
});

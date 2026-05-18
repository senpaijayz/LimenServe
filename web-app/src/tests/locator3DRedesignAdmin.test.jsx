import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
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

import { getProductLocation, saveStoreLayout } from '../modules/locator3d/services/locator3DApi';
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
    beforeEach(() => {
        vi.clearAllMocks();
        getProductLocation.mockResolvedValue(null);
    });

    it('uses a professional locator workspace with sidebar search, floor tabs, and scene controls', async () => {
        resetLocator3DStore();

        renderLocator();

        expect(screen.getByText('3D Stockroom Locator')).toBeTruthy();
        expect(screen.getByText('Current layout')).toBeTruthy();
        expect(screen.getAllByText('main-store').length).toBeGreaterThan(0);
        expect(screen.getByRole('switch', { name: 'Design Mode' }).getAttribute('aria-checked')).toBe('false');
        expect(screen.getByTestId('locator-3d-scene')).toBeTruthy();
        expect(screen.getByTestId('locator-3d-scene').closest('main')?.getAttribute('aria-label')).toBe('3D stockroom canvas');
        expect(screen.getByTestId('locator-3d-scene').closest('main')?.className).toContain('bg-slate-950');
        expect(screen.getByText('3D Stockroom Locator').closest('header')?.className).toContain('bg-slate-950');
        expect(screen.getByRole('button', { name: 'Go to Floor 1' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Go to Floor 2' })).toBeTruthy();
        expect(screen.getByLabelText('Product Search')).toBeTruthy();
        expect(screen.getByText('Located Products')).toBeTruthy();
        expect(screen.getByRole('region', { name: 'Camera and scene controls' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Overview camera' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Counter View camera' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Focus on Selected camera' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Show Labels' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Show Paths' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Show Grid' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.queryByText('Object Library')).toBeNull();
        expect(screen.queryByText('Properties')).toBeNull();

        fireEvent.click(await screen.findByRole('button', { name: 'Locate Oil Filter in 3D' }));

        await waitFor(() => expect(useLocator3DStore.getState().locatedProduct?.productId).toBe('product-1'));
        expect(screen.getAllByText(/Product Location/i).length).toBeGreaterThan(0);
        expect(screen.getByRole('link', { name: 'View Full Details' })).toBeTruthy();
    });

    it('loads a deep-linked product into a product location card and focuses the mapped shelf', async () => {
        resetLocator3DStore();
        getProductLocation.mockResolvedValueOnce({
            aisle: 'B',
            binNumber: 4,
            floor: 1,
            productId: 'product-1',
            productName: 'Oil Filter',
            shelfNumber: 2,
            shelfObjectId: 'shelf-4-a',
            sku: 'OF-1',
        });

        renderLocator('/locator-3d?productId=product-1');

        await waitFor(() => expect(useLocator3DStore.getState().locatedProduct?.productId).toBe('product-1'));
        expect(screen.getByText('Product Location')).toBeTruthy();
        expect(screen.getAllByText('Oil Filter').length).toBeGreaterThan(0);
        expect(screen.getAllByText('OF-1').length).toBeGreaterThan(0);
        expect(screen.getByText('12 in stock')).toBeTruthy();
        expect(screen.getByText('In Stock')).toBeTruthy();
        expect(screen.getAllByText('Aisle B - Shelf 2 - Bin 4').length).toBeGreaterThan(0);
        expect(screen.getByRole('link', { name: 'View Full Details' }).getAttribute('href')).toContain('/inventory');
        const pathSequence = useLocator3DStore.getState().pathAnimationRequest;
        fireEvent.click(screen.getByRole('button', { name: 'Animate Path from Counter' }));
        expect(useLocator3DStore.getState().pathAnimationRequest).toBe(pathSequence + 1);
        expect(useLocator3DStore.getState().selectedObjectId).toBe('shelf-4-a');
    });

    it('shows a helpful empty state when a deep-linked product has no mapped location', async () => {
        resetLocator3DStore();
        getProductLocation.mockResolvedValueOnce(null);

        renderLocator('/locator-3d?productId=product-2&sku=BP-2&name=Brake+Pad');

        await screen.findByText('This product has no stockroom location assigned yet');
        expect(screen.getByText('Brake Pad')).toBeTruthy();
        expect(screen.getByText('BP-2')).toBeTruthy();
        expect(useLocator3DStore.getState().locatedProduct).toBeNull();
    });

    it('shows design controls only in design mode and supports layout names, object adds, and property edits', async () => {
        resetLocator3DStore();
        renderLocator();

        fireEvent.click(screen.getByRole('switch', { name: 'Design Mode' }));
        expect(screen.getAllByText('Edit Layout mode').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'Object Library' })).toBeTruthy();

        const initialCount = useLocator3DStore.getState().sceneObjects.length;
        fireEvent.click(screen.getByRole('button', { name: 'Object Library' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add 2-Layer Shelf' }));
        expect(useLocator3DStore.getState().sceneObjects).toHaveLength(initialCount + 1);

        act(() => {
            useLocator3DStore.getState().forceSelectObject('shelf-4-a');
        });

        const properties = await screen.findByRole('complementary', { name: 'Properties' });
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

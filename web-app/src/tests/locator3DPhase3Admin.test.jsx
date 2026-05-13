import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    ]),
}));

vi.mock('../modules/locator3d/services/locator3DApi', () => ({
    assignProductLocation: vi.fn(async (location) => location),
    getProductLocation: vi.fn(async () => null),
    getProductLocations: vi.fn(async () => []),
    listStoreLayouts: vi.fn(async () => [{ layoutName: 'main-store' }]),
    loadStoreLayout: vi.fn(async () => ({ layoutData: { objects: useLocator3DStore.getState().sceneObjects } })),
    saveStoreLayout: vi.fn(async () => ({ id: 'layout-1' })),
}));

import { assignProductLocation, loadStoreLayout, saveStoreLayout } from '../modules/locator3d/services/locator3DApi';
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

describe('3D Locator Phase 3 admin integration', () => {
    it('saves, loads, resets, centers, and assigns a product to a shelf bin', async () => {
        resetLocator3DStore();
        useLocator3DStore.getState().forceSelectObject('shelf-4-a');

        renderLocator();

        fireEvent.click(screen.getByRole('button', { name: 'Save Layout' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Save Layout' }));
        await waitFor(() => expect(saveStoreLayout).toHaveBeenCalled());

        saveStoreLayout.mockClear();
        fireEvent.keyDown(window, { key: 's', ctrlKey: true });
        await waitFor(() => expect(saveStoreLayout).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('button', { name: 'Load Layout' }));
        await waitFor(() => expect(loadStoreLayout).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('button', { name: 'Reset to Default' }));
        expect(useLocator3DStore.getState().sceneObjects.length).toBeGreaterThan(7);

        act(() => {
            useLocator3DStore.getState().forceSelectObject('shelf-4-a');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Center Camera on Selected Object' }));
        expect(useLocator3DStore.getState().cameraFocusRequest.objectId).toBe('shelf-4-a');

        fireEvent.click(screen.getByRole('button', { name: 'Assign Product to Shelf' }));
        fireEvent.change(await screen.findByLabelText('Product'), { target: { value: 'product-1' } });
        fireEvent.change(screen.getByLabelText('Bin Number'), { target: { value: '4' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Product Location' }));

        await waitFor(() => expect(assignProductLocation).toHaveBeenCalledWith(expect.objectContaining({
            productId: 'product-1',
            aisle: 'B',
            shelfNumber: 2,
            binNumber: 4,
        })));
        expect(useLocator3DStore.getState().productLocations[0].productId).toBe('product-1');
    });
});

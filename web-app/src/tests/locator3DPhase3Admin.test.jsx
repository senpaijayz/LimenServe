import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import AuthContext from '../context/auth-context';
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
            <AuthContext.Provider value={{ isAdmin: true }}>
                <ToastProvider>
                    <Locator3DAdmin />
                </ToastProvider>
            </AuthContext.Provider>
        </MemoryRouter>,
    );
}

describe('3D Locator admin integration', () => {
    it('saves, loads, focuses, and assigns a real product to a stable shelf/bin location', async () => {
        resetLocator3DStore();
        useLocator3DStore.getState().forceSelectObject('shelf-4-a');
        renderLocator();

        fireEvent.click(screen.getByRole('button', { name: 'Design Mode' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(saveStoreLayout).toHaveBeenCalled());

        saveStoreLayout.mockClear();
        fireEvent.keyDown(window, { key: 's', ctrlKey: true });
        await waitFor(() => expect(saveStoreLayout).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('button', { name: 'More stockroom actions' }));
        fireEvent.click(screen.getByRole('button', { name: 'Load selected layout' }));
        await waitFor(() => expect(loadStoreLayout).toHaveBeenCalled());

        act(() => {
            useLocator3DStore.getState().forceSelectObject('shelf-4-a');
            useLocator3DStore.getState().setSelectedProductForLocation({
                id: 'product-1',
                name: 'Oil Filter',
                sku: 'OF-1',
            });
        });
        fireEvent.click(screen.getByRole('button', { name: 'Focus selected object' }));
        expect(useLocator3DStore.getState().cameraFocusRequest.objectId).toBe('shelf-4-a');

        fireEvent.click(screen.getByRole('button', { name: 'Assign Part' }));
        await act(async () => {});
        fireEvent.change(screen.getByLabelText('Bin'), { target: { value: '4' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save location' }));

        await waitFor(() => expect(assignProductLocation).toHaveBeenCalledWith(expect.objectContaining({
            aisle: 'B',
            binNumber: 4,
            productId: 'product-1',
            shelfNumber: 2,
            shelfObjectId: 'shelf-4-a',
        })));
        expect(useLocator3DStore.getState().productLocations[0].productId).toBe('product-1');
    });
});

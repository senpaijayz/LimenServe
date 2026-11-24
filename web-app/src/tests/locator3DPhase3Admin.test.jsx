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
    getProductCatalog: vi.fn(async () => ({ products: [
        { id: 'product-1', name: 'Oil Filter', sku: 'OF-1' },
    ] })),
}));

vi.mock('../modules/locator3d/services/locator3DApi', () => ({
    assignProductLocation: vi.fn(async (location) => location),
    getProductLocations: vi.fn(async () => []),
    listStoreLayouts: vi.fn(async () => [{ layoutName: 'main-store' }]),
    loadStoreLayout: vi.fn(async () => ({ id: 'layout-1', revision: 2, status: 'draft', locations: [], layoutData: { objects: useLocator3DStore.getState().sceneObjects } })),
    saveStoreLayout: vi.fn(async () => ({ id: 'layout-1', revision: 3, status: 'draft', locations: [] })),
    getLayoutHistory: vi.fn(), getLayoutRevision: vi.fn(), restoreLayoutRevision: vi.fn(), setStoreLayoutPriority: vi.fn(),
}));

import { assignProductLocation, getLayoutHistory, getLayoutRevision, loadStoreLayout, saveStoreLayout, setStoreLayoutPriority } from '../modules/locator3d/services/locator3DApi';
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
        await waitFor(() => expect(screen.queryByText('Loading stockroom…')).toBeNull());

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
        }), expect.objectContaining({ layoutId: 'layout-1', expectedRevision: expect.any(Number) })));
        expect(useLocator3DStore.getState().productLocations[0].productId).toBe('product-1');
    });

    it('disables the design save action while a save is in flight', async () => {
        resetLocator3DStore();
        saveStoreLayout.mockClear();
        let releaseSave;
        saveStoreLayout.mockImplementationOnce(() => new Promise((resolve) => {
            releaseSave = resolve;
        }));
        renderLocator();
        await waitFor(() => expect(screen.queryByText('Loading stockroom…')).toBeNull());

        fireEvent.click(screen.getByRole('button', { name: 'Design Mode' }));
        const saveButton = screen.getByRole('button', { name: 'Save' });
        fireEvent.click(saveButton);

        await waitFor(() => expect(saveStoreLayout).toHaveBeenCalledTimes(1));
        expect(screen.getByRole('button', { name: 'Saving…' }).disabled).toBe(true);
        expect(saveButton.disabled).toBe(true);

        fireEvent.click(saveButton);
        expect(saveStoreLayout).toHaveBeenCalledTimes(1);

        releaseSave({ id: 'layout-1' });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(false));
    });

    it('views a published revision read-only and restores the exact unsaved editor session on return', async () => {
        resetLocator3DStore();
        getLayoutHistory.mockResolvedValueOnce([{ revision: 2, event_type: 'updated', created_at: '2026-11-24T10:00:00.000Z' }]);
        const historicalObjects = useLocator3DStore.getState().sceneObjects.map((object) => object.id === 'shelf-4-a'
            ? { ...object, layerCapacities: { 1: 3 } }
            : object);
        getLayoutRevision.mockResolvedValueOnce({
            id: 'layout-1', layoutName: 'main-store', revision: 2, status: 'draft', locations: [],
            layoutData: { objects: historicalObjects },
        });
        renderLocator();
        await waitFor(() => expect(screen.queryByText('Loading stockroom…')).toBeNull());
        act(() => {
            useLocator3DStore.getState().setDesignMode(true);
            useLocator3DStore.getState().forceSelectObject('shelf-4-a');
            useLocator3DStore.getState().updateShelfProperties('shelf-4-a', { layerCapacities: { 1: 4 } });
        });
        expect(useLocator3DStore.getState().hasUnsavedChanges).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
        fireEvent.click(await screen.findByRole('button', { name: 'View Revision' }));
        expect(await screen.findByText('Viewing historical Revision 2 · read-only')).toBeTruthy();
        expect(getLayoutRevision).toHaveBeenCalledWith('layout-1', 2);
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a').layerCapacities[1]).toBe(3);
        fireEvent.click(screen.getByRole('button', { name: 'Return to Current Draft' }));
        await waitFor(() => expect(screen.queryByText('Viewing historical Revision 2 · read-only')).toBeNull());
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a').layerCapacities[1]).toBe(4);
        expect(useLocator3DStore.getState().hasUnsavedChanges).toBe(true);
        expect(useLocator3DStore.getState().isDesignMode).toBe(true);
    });

    it('keeps an editable draft after publishing a layout', async () => {
        resetLocator3DStore();
        setStoreLayoutPriority.mockResolvedValueOnce({ id: 'published-layout', layoutName: 'main-store', revision: 3, status: 'published', locations: [] });
        saveStoreLayout.mockResolvedValueOnce({ id: 'next-draft', layoutName: 'main-store', revision: 1, status: 'draft', locations: [] });
        renderLocator();
        await waitFor(() => expect(screen.queryByText('Loading stockroom…')).toBeNull());

        fireEvent.click(screen.getByRole('button', { name: 'Publish for staff' }));
        await waitFor(() => expect(setStoreLayoutPriority).toHaveBeenCalledWith('main-store', { layoutId: 'layout-1', expectedRevision: 2 }));
        await waitFor(() => expect(saveStoreLayout).toHaveBeenCalledWith(expect.any(Array), 'main-store', { layoutId: 'published-layout', expectedRevision: 3 }));
        expect(await screen.findByText(/Design draft · Revision 1/)).toBeTruthy();
        expect(await screen.findByRole('button', { name: 'View published layout' })).toBeTruthy();
    });
});

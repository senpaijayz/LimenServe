import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import AuthContext from '../context/auth-context';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';
import { LOCATOR_SCENE_OBJECTS } from '../modules/locator3d/data/locatorScene';

vi.mock('../modules/locator3d/components/Locator3DScene', () => ({ default: () => <div data-testid="scene" /> }));
vi.mock('../services/catalogApi', () => ({ getFullProductCatalog: vi.fn(async () => [{ id: 'part-1', name: 'Oil Filter', sku: 'OF-1' }]) }));
vi.mock('../modules/locator3d/services/locator3DApi', () => ({
    assignProductLocation: vi.fn(async (location) => location),
    getProductLocations: vi.fn(async () => [{ productId: 'part-1', productName: 'Oil Filter', shelfObjectId: 'shelf-4-a', aisle: 'B', shelfNumber: 2, floor: 1, binNumber: 4 }]),
    listStoreLayouts: vi.fn(), loadStoreLayout: vi.fn(), saveStoreLayout: vi.fn(), setStoreLayoutPriority: vi.fn(),
}));
import { listStoreLayouts, loadStoreLayout, saveStoreLayout } from '../modules/locator3d/services/locator3DApi';
import Locator3DAdmin from '../modules/locator3d/pages/Locator3DAdmin';

function mount(isAdmin = true) {
    return render(<MemoryRouter><AuthContext.Provider value={{ isAdmin }}><ToastProvider><Locator3DAdmin /></ToastProvider></AuthContext.Provider></MemoryRouter>);
}
async function loaded() {
    await waitFor(() => expect(loadStoreLayout).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Loading stockroom…')).toBeNull());
}

describe('Stockroom workspace workflows', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        resetLocator3DStore();
        listStoreLayouts.mockResolvedValue([{ layoutName: 'main-store' }, { layoutName: 'Workshop', isPriority: true }]);
        loadStoreLayout.mockImplementation(async (name) => ({ layoutName: name, layoutData: { objects: LOCATOR_SCENE_OBJECTS } }));
        saveStoreLayout.mockResolvedValue({ id: 'saved' });
    });

    it('loads the priority saved design when opened without a product link', async () => {
        mount(); await loaded();
        expect(loadStoreLayout).toHaveBeenCalledWith('Workshop');
        expect(screen.getByText('Workshop')).toBeTruthy();
    });

    it('locates a product with the keyboard and closes results on Escape', async () => {
        mount(); await loaded();
        const input = screen.getByRole('combobox', { name: /Search products/ });
        fireEvent.change(input, { target: { value: 'OF-1' } });
        await screen.findByRole('button', { name: 'Locate Oil Filter' });
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(useLocator3DStore.getState().locatedProduct?.productId).toBe('part-1');
        fireEvent.focus(input);
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('preserves the recovery copy after the saved design finishes loading', async () => {
        useLocator3DStore.getState().addSceneObject('shelf');
        const recoveredIds = useLocator3DStore.getState().sceneObjects.map((object) => object.id);
        useLocator3DStore.getState().loadLayoutData({ objects: LOCATOR_SCENE_OBJECTS });
        mount(); await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Recover', exact: true }));
        expect(useLocator3DStore.getState().sceneObjects.map((object) => object.id)).toEqual(recoveredIds);
        expect(useLocator3DStore.getState().hasUnsavedChanges).toBe(true);
    });

    it('supports shelf lookup and stair navigation in the floor plan without selecting design objects', async () => {
        mount(false); await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Top-down 2D floor view' }));
        fireEvent.keyDown(screen.getByRole('button', { name: 'Aisle B 4-Layer Shelf' }), { key: 'Enter' });
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText(/Oil Filter/)).toBeTruthy();
        expect(within(dialog).queryByRole('button', { name: 'Save location' })).toBeNull();
        expect(useLocator3DStore.getState().selectedObjectId).toBeNull();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Stairs to Floor 2' }));
        expect(screen.getByRole('region', { name: 'Floor 2 floor plan' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Aisle B 4-Layer Shelf' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Stairs to Floor 1' }));
        expect(useLocator3DStore.getState().activeFloor).toBe(1);
    });

    it('does not overwrite edits started while the saved layout is loading', async () => {
        let release;
        loadStoreLayout.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        mount();
        await waitFor(() => expect(loadStoreLayout).toHaveBeenCalled());
        act(() => { useLocator3DStore.getState().addSceneObject('shelf'); });
        const edited = useLocator3DStore.getState().sceneObjects;
        await act(async () => release({ layoutName: 'Workshop', layoutData: { objects: LOCATOR_SCENE_OBJECTS } }));
        expect(useLocator3DStore.getState().sceneObjects).toBe(edited);
        expect(useLocator3DStore.getState().hasUnsavedChanges).toBe(true);
    });

    it('keeps newer edits dirty and prevents duplicate saves while a request is running', async () => {
        mount(); await loaded();
        let release;
        saveStoreLayout.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        fireEvent.click(screen.getByRole('button', { name: 'Design Mode' }));
        fireEvent.keyDown(window, { key: 's', ctrlKey: true });
        fireEvent.keyDown(window, { key: 's', ctrlKey: true });
        expect(saveStoreLayout).toHaveBeenCalledTimes(1);
        act(() => { useLocator3DStore.getState().addSceneObject('shelf'); });
        await act(async () => release({ id: 'saved' }));
        expect(useLocator3DStore.getState().hasUnsavedChanges).toBe(true);
    });

    it('protects product mappings when a shelf is deleted with the keyboard', async () => {
        mount(); await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Design Mode' }));
        act(() => useLocator3DStore.getState().forceSelectObject('shelf-4-a'));
        const before = useLocator3DStore.getState().sceneObjects;
        fireEvent.keyDown(window, { key: 'Delete' });
        expect(useLocator3DStore.getState().sceneObjects).toBe(before);
        expect(screen.getByText(/Move the product mappings/)).toBeTruthy();
    });

    it('asks before replacing unsaved edits and leaves the active save name unchanged', async () => {
        mount(); await loaded();
        act(() => { useLocator3DStore.getState().addSceneObject('shelf'); });
        fireEvent.click(screen.getByRole('button', { name: 'More stockroom actions' }));
        fireEvent.change(screen.getByLabelText('Select saved layout'), { target: { value: 'main-store' } });
        fireEvent.click(screen.getByRole('button', { name: 'Load selected layout' }));
        expect(screen.getByRole('dialog', { name: 'Load a different layout?' })).toBeTruthy();
        expect(loadStoreLayout).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.getByText('Workshop')).toBeTruthy();
        expect(useLocator3DStore.getState().hasUnsavedChanges).toBe(true);
    });

    it('exposes device quality controls and keeps save shortcuts inactive for viewing staff', async () => {
        mount(false); await loaded();
        fireEvent.click(screen.getByRole('button', { name: 'Display settings' }));
        fireEvent.change(screen.getByLabelText('3D quality'), { target: { value: 'low' } });
        expect(useLocator3DStore.getState().qualityPreference).toBe('low');
        fireEvent.keyDown(window, { key: 's', ctrlKey: true });
        expect(saveStoreLayout).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'More stockroom actions' }));
        expect(screen.queryByRole('button', { name: 'Save As' })).toBeNull();
    });
});

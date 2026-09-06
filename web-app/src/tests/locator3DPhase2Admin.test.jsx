import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import AuthContext from '../context/auth-context';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

vi.mock('../modules/locator3d/components/Locator3DScene', () => ({
    default: () => <div data-testid="locator-3d-scene" />,
}));

vi.mock('../services/catalogApi', () => ({ getFullProductCatalog: vi.fn(async () => []) }));
vi.mock('../modules/locator3d/services/locator3DApi', () => ({
    assignProductLocation: vi.fn(), getProductLocations: vi.fn(async () => []),
    listStoreLayouts: vi.fn(async () => []), loadStoreLayout: vi.fn(async () => null),
    saveStoreLayout: vi.fn(), setStoreLayoutPriority: vi.fn(),
}));

import Locator3DAdmin from '../modules/locator3d/pages/Locator3DAdmin';

function renderLocator() {
    return render(
        <MemoryRouter>
            <AuthContext.Provider value={{ isAdmin: true }}>
                <ToastProvider>
                    <Locator3DAdmin />
                </ToastProvider>
            </AuthContext.Provider>
        </MemoryRouter>,
    );
}

describe('3D Locator design controls', () => {
    it('exposes direct manipulation controls and clears selection when switching floors', async () => {
        resetLocator3DStore();
        useLocator3DStore.getState().forceSelectObject('shelf-4-a');
        renderLocator();

        fireEvent.click(screen.getByRole('button', { name: 'Design Mode' }));
        expect(useLocator3DStore.getState().isDesignMode).toBe(true);
        expect(screen.getByLabelText('Design toolbar')).toBeTruthy();
        expect(screen.queryByText('Properties')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Lock selected object' }));
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a').isLocked).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Unlock selected object' }));
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a').isLocked).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: 'Floor 2' }));
        expect(useLocator3DStore.getState().activeFloor).toBe(2);
        expect(useLocator3DStore.getState().selectedObjectId).toBeNull();
        expect(screen.queryByRole('button', { name: 'Delete selected object' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Floor 1' }));
        act(() => useLocator3DStore.getState().forceSelectObject('shelf-4-a'));

        fireEvent.click(screen.getByRole('button', { name: 'Delete selected object' }));
        expect(useLocator3DStore.getState().sceneObjects.some((object) => object.id === 'shelf-4-a')).toBe(false);
        await act(async () => {});
    });
});

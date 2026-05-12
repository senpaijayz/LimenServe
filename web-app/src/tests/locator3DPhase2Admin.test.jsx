import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

vi.mock('../modules/locator3d/components/Locator3DScene', () => ({
    default: () => <div data-testid="locator-3d-scene" />,
}));

import Locator3DAdmin from '../modules/locator3d/pages/Locator3DAdmin';

describe('3D Locator Phase 2 admin controls', () => {
    it('exposes design mode, lock, delete, floor navigation, and shelf editing controls', () => {
        resetLocator3DStore();

        useLocator3DStore.getState().forceSelectObject('shelf-4-a');

        render(
            <MemoryRouter>
                <ToastProvider>
                    <Locator3DAdmin />
                </ToastProvider>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('switch', { name: 'Design Mode' }));
        expect(useLocator3DStore.getState().isDesignMode).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Lock selected object' }));
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a').isLocked).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Unlock All Objects' }));
        expect(useLocator3DStore.getState().sceneObjects.every((object) => !object.isLocked)).toBe(true);

        fireEvent.change(screen.getByLabelText('Aisle name'), { target: { value: 'Electronics' } });
        fireEvent.change(screen.getByLabelText('Shelf Number'), { target: { value: '9' } });
        fireEvent.change(screen.getByLabelText('Number of Bins'), { target: { value: '10' } });

        const updatedShelf = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a');

        expect(updatedShelf.aisle).toBe('Electronics');
        expect(updatedShelf.shelfNumber).toBe(9);
        expect(updatedShelf.binCount).toBe(10);

        fireEvent.click(screen.getByRole('button', { name: 'Go to Floor 2' }));
        expect(useLocator3DStore.getState().activeFloor).toBe(2);

        fireEvent.click(screen.getByRole('button', { name: 'Delete selected object' }));
        expect(useLocator3DStore.getState().sceneObjects.some((object) => object.id === 'shelf-4-a')).toBe(false);
    });
});

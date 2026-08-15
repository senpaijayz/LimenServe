import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import AuthContext from '../context/auth-context';

vi.mock('../modules/locator3d/components/Locator3DScene', () => ({
    default: () => <div data-testid="locator-3d-scene" />,
}));

import {
    LOCATOR_OBJECT_LIBRARY,
    LOCATOR_SCENE_OBJECTS,
    getLocatorObjectSummary,
} from '../modules/locator3d/data/locatorScene';
import Locator3DAdmin from '../modules/locator3d/pages/Locator3DAdmin';
import { useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

const REQUIRED_OBJECT_TYPES = [
    'floor',
    'walls',
    'shelf-2-layer',
    'shelf-4-layer',
    'stairs',
    'counter-computer',
    'entrance-door',
    'parts-cabinet',
];

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

describe('3D Locator foundation', () => {
    it('defines the object library and seed scene', () => {
        expect(LOCATOR_OBJECT_LIBRARY.map((object) => object.type)).toEqual([
            'floor',
            'walls',
            ...REQUIRED_OBJECT_TYPES.slice(2),
        ]);
        expect(LOCATOR_SCENE_OBJECTS.map((object) => object.type)).toEqual(expect.arrayContaining(REQUIRED_OBJECT_TYPES));
    });

    it('summarizes the initial two-floor store layout', () => {
        expect(getLocatorObjectSummary(LOCATOR_SCENE_OBJECTS)).toEqual({
            floors: 2,
            objects: 12,
            shelves: 6,
        });
    });

    it('tracks selected objects in the locator store', () => {
        useLocator3DStore.setState({ activeTool: 'select', selectedObjectId: null });

        act(() => {
            useLocator3DStore.getState().selectObject('shelf-4-a');
        });
        expect(useLocator3DStore.getState().selectedObjectId).toBe('shelf-4-a');

        act(() => {
            useLocator3DStore.getState().clearSelection();
        });
        expect(useLocator3DStore.getState().selectedObjectId).toBeNull();
    });

    it('renders a search-first locator with the 3D scene as the primary workspace', () => {
        renderLocator();

        expect(screen.getByRole('heading', { name: '3D Stockroom' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Design Mode' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Search products, material codes, shelves, or barcodes' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Floor 1' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Floor 2' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Top-down 2D floor view' })).toBeTruthy();
        expect(screen.getByTestId('locator-3d-scene')).toBeTruthy();
        expect(screen.getByTestId('locator-3d-scene').closest('main')?.getAttribute('aria-label')).toBe('3D stockroom canvas');
        expect(screen.queryByText('Located Products')).toBeNull();
    });
});

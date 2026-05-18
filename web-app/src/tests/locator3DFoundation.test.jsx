import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';

vi.mock('../modules/locator3d/components/Locator3DScene', () => ({
    default: () => <div data-testid="locator-3d-scene" />,
}));

import {
    LOCATOR_OBJECT_LIBRARY,
    LOCATOR_SCENE_OBJECTS,
    getLocatorObjectSummary,
} from '../modules/locator3d/data/locatorScene';
import { useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';
import Locator3DAdmin from '../modules/locator3d/pages/Locator3DAdmin';

const REQUIRED_OBJECT_TYPES = [
    'floor',
    'walls',
    'shelf-2-layer',
    'shelf-4-layer',
    'stairs',
    'counter-computer',
    'entrance-door',
];

describe('3D Locator foundation', () => {
    it('defines the Phase 1 object library and seed scene', () => {
        expect(LOCATOR_OBJECT_LIBRARY.map((object) => object.type)).toEqual(REQUIRED_OBJECT_TYPES);
        expect(LOCATOR_SCENE_OBJECTS.map((object) => object.type)).toEqual(expect.arrayContaining(REQUIRED_OBJECT_TYPES));
    });

    it('summarizes the initial two-floor store layout', () => {
        expect(getLocatorObjectSummary(LOCATOR_SCENE_OBJECTS)).toEqual({
            floors: 2,
            objects: 9,
            shelves: 4,
        });
    });

    it('tracks selected objects in the locator store', () => {
        useLocator3DStore.setState({
            selectedObjectId: null,
            activeTool: 'select',
        });

        act(() => {
            useLocator3DStore.getState().selectObject('shelf-4-a');
        });

        expect(useLocator3DStore.getState().selectedObjectId).toBe('shelf-4-a');

        act(() => {
            useLocator3DStore.getState().clearSelection();
        });

        expect(useLocator3DStore.getState().selectedObjectId).toBeNull();
    });

    it('renders the premium one-page locator workspace with the 3D scene mounted', () => {
        render(
            <MemoryRouter>
                <ToastProvider>
                    <Locator3DAdmin />
                </ToastProvider>
            </MemoryRouter>,
        );

        expect(screen.getByText('3D Stockroom Locator')).toBeTruthy();
        expect(screen.getByRole('switch', { name: 'Design Mode' })).toBeTruthy();
        expect(screen.getByLabelText('Product Search')).toBeTruthy();
        expect(screen.getByText('Located Products')).toBeTruthy();
        expect(screen.getByRole('region', { name: 'Camera and scene controls' })).toBeTruthy();
        expect(screen.getByTestId('locator-3d-scene')).toBeTruthy();
        expect(screen.queryByText('Object List')).toBeNull();
    });
});

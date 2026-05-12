import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children, onPointerMissed }) => (
        <div data-testid="mock-canvas" onClick={onPointerMissed}>
            {children}
        </div>
    ),
    useFrame: () => {},
    useThree: () => ({
        camera: {
            position: {
                lerp: () => {},
            },
        },
    }),
}));

vi.mock('@react-three/drei', () => ({
    ContactShadows: () => null,
    Edges: () => <span data-testid="selected-edge" />,
    Environment: () => null,
    Grid: () => null,
    Html: ({ children }) => <span>{children}</span>,
    Line: () => null,
    OrbitControls: () => null,
    Text: ({ children }) => <span>{children}</span>,
    TransformControls: () => null,
}));

vi.mock('@react-three/postprocessing', () => ({
    Bloom: () => null,
    EffectComposer: ({ children }) => <>{children}</>,
}));

import Locator3DScene from '../modules/locator3d/components/Locator3DScene';

describe('Locator3DScene selection', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('selects a scene object when its 3D group is clicked', () => {
        resetLocator3DStore();

        render(<Locator3DScene />);

        fireEvent.click(screen.getByTestId('locator-object-shelf-4-a'));

        expect(useLocator3DStore.getState().selectedObjectId).toBe('shelf-4-a');
    });

    it('ignores locked objects during scene selection', () => {
        resetLocator3DStore();
        useLocator3DStore.getState().toggleObjectLock('shelf-4-a');

        render(<Locator3DScene />);

        fireEvent.click(screen.getByTestId('locator-object-shelf-4-a'));

        expect(useLocator3DStore.getState().selectedObjectId).toBeNull();
    });

    it('clicking stairs changes the active floor camera target', () => {
        resetLocator3DStore();

        render(<Locator3DScene />);

        fireEvent.click(screen.getByTestId('locator-object-stairs-a'));

        expect(useLocator3DStore.getState().activeFloor).toBe(2);
    });
});

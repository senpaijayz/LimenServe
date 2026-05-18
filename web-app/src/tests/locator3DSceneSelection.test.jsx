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
    Html: ({ children, ...props }) => <span data-testid={props['data-testid']}>{children}</span>,
    Line: ({ dashed, ...props }) => (
        <span data-dashed={dashed ? 'true' : 'false'} data-testid={props['data-testid'] || 'locator-path-line'} />
    ),
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

    it('shows selected shelf info in locate mode when an object is clicked', () => {
        resetLocator3DStore();

        render(<Locator3DScene />);

        fireEvent.click(screen.getByTestId('locator-object-shelf-4-a'));

        expect(useLocator3DStore.getState().selectedObjectId).toBe('shelf-4-a');
        expect(screen.getByText('Aisle B 4-Layer Shelf')).toBeTruthy();
        expect(screen.getByText('Shelf 2 / 8 bins')).toBeTruthy();
    });

    it('renders only objects for the active floor while keeping shared structure visible', () => {
        resetLocator3DStore();
        const { rerender } = render(<Locator3DScene />);

        expect(screen.getByTestId('locator-object-floor-main')).toBeTruthy();
        expect(screen.getByTestId('locator-object-shelf-4-a')).toBeTruthy();
        expect(screen.queryByTestId('locator-object-shelf-4-b')).toBeNull();

        useLocator3DStore.getState().goToFloor(2);
        rerender(<Locator3DScene />);

        expect(screen.getByTestId('locator-object-floor-main')).toBeTruthy();
        expect(screen.getByTestId('locator-object-shelf-4-b')).toBeTruthy();
        expect(screen.queryByTestId('locator-object-shelf-4-a')).toBeNull();
    });

    it('renders a high-contrast highlight halo and dashed route for located products', () => {
        resetLocator3DStore();
        useLocator3DStore.getState().setProductLocations([
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
        ]);
        useLocator3DStore.getState().locateProduct({
            aisle: 'B',
            binNumber: 4,
            floor: 1,
            productId: 'product-1',
            productName: 'Oil Filter',
            shelfNumber: 2,
            shelfObjectId: 'shelf-4-a',
            sku: 'OF-1',
        });

        render(<Locator3DScene />);

        expect(screen.getByTestId('locator-highlight-shelf-4-a')).toBeTruthy();
        expect(screen.getByTestId('locator-path-dashed').getAttribute('data-dashed')).toBe('true');
        expect(screen.getByTestId('locator-label-shelf-4-a')).toBeTruthy();
        expect(screen.getByText('Aisle B Shelf 2')).toBeTruthy();
        expect(screen.getByText('Bin 4')).toBeTruthy();
    });
});

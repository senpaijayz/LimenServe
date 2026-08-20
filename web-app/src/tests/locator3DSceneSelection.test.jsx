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

import Locator3DScene, { Locator2DFallback } from '../modules/locator3d/components/Locator3DScene';

describe('Locator3DScene selection', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps scene selection and blue highlighting scoped to design mode', () => {
        resetLocator3DStore();

        const { rerender } = render(<Locator3DScene />);

        fireEvent.click(screen.getByTestId('locator-object-shelf-4-a'));

        expect(useLocator3DStore.getState().selectedObjectId).toBeNull();

        useLocator3DStore.getState().setDesignMode(true);
        rerender(<Locator3DScene />);
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

    it('clicking stairs navigates up and back down through the stair opening', () => {
        resetLocator3DStore();

        render(<Locator3DScene />);

        fireEvent.click(screen.getByTestId('locator-object-stairs-a'));

        expect(useLocator3DStore.getState().activeFloor).toBe(2);
        expect(screen.getByText(/STRAIGHT STAIRS/)).toBeTruthy();

        fireEvent.click(screen.getByTestId('locator-object-stairs-a'));

        expect(useLocator3DStore.getState().activeFloor).toBe(1);
    });

    it('selects stairs without changing floors in Design Mode', () => {
        resetLocator3DStore();
        useLocator3DStore.getState().setDesignMode(true);

        render(<Locator3DScene />);

        fireEvent.click(screen.getByTestId('locator-object-stairs-a'));

        expect(useLocator3DStore.getState().selectedObjectId).toBe('stairs-a');
        expect(useLocator3DStore.getState().activeFloor).toBe(1);
    });

    it('opens the shelf assignment callback in view mode without selecting the shelf', () => {
        resetLocator3DStore();
        const onShelfClick = vi.fn();

        render(<Locator3DScene onShelfClick={onShelfClick} />);

        fireEvent.click(screen.getByTestId('locator-object-shelf-4-a'));

        expect(useLocator3DStore.getState().selectedObjectId).toBeNull();
        expect(onShelfClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'shelf-4-a' }));
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
        expect(screen.getByTestId('locator-object-stairs-a')).toBeTruthy();
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

    it('keeps an accessible location table available when WebGL cannot be used', () => {
        resetLocator3DStore();
        useLocator3DStore.getState().setProductLocations([{
            aisle: 'B',
            binNumber: 4,
            floor: 1,
            productId: 'product-1',
            productName: 'Oil Filter',
            shelfNumber: 2,
        }]);

        render(<Locator2DFallback />);

        expect(screen.getByTestId('locator-2d-fallback')).toBeTruthy();
        expect(screen.getByRole('table')).toBeTruthy();
        expect(screen.getByText('Oil Filter')).toBeTruthy();
        expect(screen.getByText('2D stockroom fallback')).toBeTruthy();
    });
});

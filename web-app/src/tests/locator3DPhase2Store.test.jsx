import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

describe('3D Locator Phase 2 store behavior', () => {
    it('manages design mode, object locks, and selected object deletion', () => {
        resetLocator3DStore();

        expect(useLocator3DStore.getState().isDesignMode).toBe(false);

        act(() => {
            useLocator3DStore.getState().setDesignMode(true);
            useLocator3DStore.getState().forceSelectObject('shelf-2-a');
            useLocator3DStore.getState().toggleObjectLock('shelf-2-a');
        });

        expect(useLocator3DStore.getState().isDesignMode).toBe(true);
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').isLocked).toBe(true);

        act(() => {
            useLocator3DStore.getState().clearSelection();
            useLocator3DStore.getState().selectObject('shelf-2-a');
        });

        expect(useLocator3DStore.getState().selectedObjectId).toBeNull();

        act(() => {
            useLocator3DStore.getState().forceSelectObject('shelf-2-a');
            useLocator3DStore.getState().deleteSelectedObject();
        });

        expect(useLocator3DStore.getState().sceneObjects.some((object) => object.id === 'shelf-2-a')).toBe(true);

        act(() => {
            useLocator3DStore.getState().unlockAllObjects();
            useLocator3DStore.getState().forceSelectObject('shelf-2-a');
            useLocator3DStore.getState().deleteSelectedObject();
        });

        expect(useLocator3DStore.getState().sceneObjects.some((object) => object.id === 'shelf-2-a')).toBe(false);
        expect(useLocator3DStore.getState().selectedObjectId).toBeNull();
    });

    it('updates shelf properties and clamps bin count to the allowed range', () => {
        resetLocator3DStore();

        act(() => {
            useLocator3DStore.getState().updateShelfProperties('shelf-4-a', {
                aisle: 'Electronics',
                shelfNumber: 7,
                binCount: 18,
            });
        });

        const shelf = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a');

        expect(shelf.aisle).toBe('Electronics');
        expect(shelf.shelfNumber).toBe(7);
        expect(shelf.binCount).toBe(12);
        expect(shelf.name).toBe('Aisle Electronics Shelf 7');
    });

    it('updates object transforms on the 0.5 unit snap grid', () => {
        resetLocator3DStore();

        act(() => {
            useLocator3DStore.getState().updateObjectTransform('shelf-4-a', {
                position: [-1.28, 0.03, 2.26],
                rotation: [0, 1.124, 0],
            });
        });

        const shelf = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a');

        expect(shelf.position).toEqual([-1.5, 0, 2.5]);
        expect(shelf.rotation).toEqual([0, 1.124, 0]);
    });

    it('switches between floor camera targets', () => {
        resetLocator3DStore();

        act(() => {
            useLocator3DStore.getState().goToFloor(2);
        });

        expect(useLocator3DStore.getState().activeFloor).toBe(2);

        act(() => {
            useLocator3DStore.getState().toggleFloorFocus();
        });

        expect(useLocator3DStore.getState().activeFloor).toBe(1);
    });
});

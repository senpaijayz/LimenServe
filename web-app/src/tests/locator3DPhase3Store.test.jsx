import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FLOOR_HEIGHT, getShelfLayerCapacity, getShelfLayerSlotCount, getShelfLayerSpacing, getShelfSlotLocalPosition, getShelfSlotWorldPosition } from '../modules/locator3d/data/locatorScene';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

describe('3D Locator Phase 3 store behavior', () => {
    it('keeps per-layer capacity and spacing in the editable shelf metadata and preserves mappings', () => {
        resetLocator3DStore();
        const mapping = { productId: 'part-1', shelfObjectId: 'shelf-4-a', floor: 1, aisle: 'B', shelfNumber: 2, layerNumber: 1, binNumber: 8 };
        act(() => {
            useLocator3DStore.getState().setProductLocations([mapping]);
            useLocator3DStore.getState().updateShelfProperties('shelf-4-a', { layerCapacities: { 1: 4 }, layerSpacingByNumber: { 1: 0.85 } });
        });
        const shelf = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a');
        expect(shelf.layerCapacities).toEqual({ 1: 4 });
        expect(shelf.layerSpacingByNumber).toEqual({ 1: 0.85 });
        expect(getShelfLayerCapacity(shelf, 1)).toBe(4);
        expect(getShelfLayerSpacing(shelf, 1)).toBe(0.85);
        expect(useLocator3DStore.getState().productLocations).toEqual([mapping]);
        expect(useLocator3DStore.getState().hasUnsavedChanges).toBe(true);
    });

    it('spreads shelf locations evenly while keeping the configured gaps and legacy bin positions', () => {
        const shelf = { type: 'shelf', binCount: 10, layerSpacingByNumber: { 1: 0.8 }, dimensions: { width: 4, depth: 1, height: 1.6 } };
        const positions = [1, 2, 3, 4].map((bin) => Number(getShelfSlotLocalPosition(shelf, 1, bin, 4)[0].toFixed(1)));
        expect(positions).toEqual([-1.2, -0.4, 0.4, 1.2]);
        expect(positions[0] + positions[3]).toBe(0);
        expect(positions.slice(1).map((position, index) => Number((position - positions[index]).toFixed(2)))).toEqual([0.8, 0.8, 0.8]);
        expect(getShelfSlotLocalPosition(shelf, 1, 8, 4)).toBeNull();
    });

    it('uses the configured layer capacity for camera focus while preserving existing higher bin assignments', () => {
        const shelf = {
            id: 'focus-shelf',
            type: 'shelf-4-layer',
            binCount: 10,
            layerCount: 4,
            layerCapacities: { 1: 4, 2: 4 },
            position: [0, 0, 0],
            dimensions: { width: 4, depth: 1, height: 2.2 },
        };
        const existingAssignments = [{ shelfObjectId: 'focus-shelf', layerNumber: 1, binNumber: 8 }];
        const slotCount = getShelfLayerSlotCount(shelf, 1, existingAssignments);

        expect(slotCount).toBe(8);
        expect(getShelfSlotWorldPosition(shelf, 1, 4, slotCount)).toEqual(
            getShelfSlotWorldPosition(shelf, 1, 4, 8),
        );
        expect(getShelfSlotWorldPosition(shelf, 1, 4, slotCount)).not.toEqual(
            getShelfSlotWorldPosition(shelf, 1, 4, 10),
        );
        expect(getShelfLayerSlotCount(shelf, 2, [], { shelfObjectId: 'focus-shelf', layerNumber: 2, binNumber: 4 })).toBe(4);
    });

    it('loads saved layout data and resets to the professional default layout', () => {
        resetLocator3DStore();

        act(() => {
            useLocator3DStore.getState().loadLayoutData({
                objects: [
                    {
                        id: 'custom-shelf',
                        type: 'shelf-2-layer',
                        name: 'Aisle Z Shelf 12',
                        aisle: 'Z',
                        shelfNumber: 12,
                        binCount: 4,
                        floor: 2,
                        isLocked: false,
                        layerCount: 2,
                        position: [2, FLOOR_HEIGHT, -2],
                        rotation: [0, 0, 0],
                        dimensions: { width: 3.2, depth: 0.9, height: 1.35 },
                    },
                ],
            });
        });

        expect(useLocator3DStore.getState().sceneObjects).toHaveLength(1);
        expect(useLocator3DStore.getState().sceneObjects[0].id).toBe('custom-shelf');

        act(() => {
            useLocator3DStore.getState().resetToDefaultLayout();
        });

        expect(useLocator3DStore.getState().sceneObjects.length).toBeGreaterThan(7);
        expect(useLocator3DStore.getState().sceneObjects.some((object) => object.floor === 2 && object.type.includes('shelf'))).toBe(true);
    });

    it('tracks product assignments and locates the target shelf and bin', () => {
        resetLocator3DStore();

        act(() => {
            useLocator3DStore.getState().setProductLocations([
                {
                    productId: 'product-1',
                    productName: 'Oil Filter',
                    sku: 'OF-1',
                    aisle: 'C',
                    shelfNumber: 3,
                    binNumber: 4,
                    floor: 2,
                    layerNumber: 1,
                    shelfObjectId: 'shelf-4-b',
                },
            ]);
            useLocator3DStore.getState().locateProduct({
                productId: 'product-1',
                productName: 'Oil Filter',
                sku: 'OF-1',
                aisle: 'C',
                shelfNumber: 3,
                binNumber: 4,
                floor: 2,
                layerNumber: 1,
                shelfObjectId: 'shelf-4-b',
            });
        });

        expect(useLocator3DStore.getState().activeFloor).toBe(2);
        expect(useLocator3DStore.getState().selectedObjectId).toBe('shelf-4-b');
        expect(useLocator3DStore.getState().locatedProduct.locationLabel).toBe('Floor 2 → Aisle C → Shelf 3 → Layer 1 → Bin 4');
    });

    it('requests camera centering for the selected object', () => {
        resetLocator3DStore();

        act(() => {
            useLocator3DStore.getState().forceSelectObject('shelf-4-a');
            useLocator3DStore.getState().centerCameraOnSelected();
        });

        expect(useLocator3DStore.getState().cameraFocusRequest).toMatchObject({
            objectId: 'shelf-4-a',
            sequence: 1,
        });
    });
});

import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FLOOR_HEIGHT } from '../modules/locator3d/data/locatorScene';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

describe('3D Locator Phase 3 store behavior', () => {
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
                shelfObjectId: 'shelf-4-b',
            });
        });

        expect(useLocator3DStore.getState().activeFloor).toBe(2);
        expect(useLocator3DStore.getState().selectedObjectId).toBe('shelf-4-b');
        expect(useLocator3DStore.getState().locatedProduct.locationLabel).toBe('Product located → Aisle C • Shelf 3 • Bin 4');
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

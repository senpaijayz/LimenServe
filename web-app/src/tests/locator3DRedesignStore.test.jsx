import { describe, expect, it } from 'vitest';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

describe('3D Locator redesign store behavior', () => {
    it('stores scene visibility toggles and camera preset requests', () => {
        resetLocator3DStore();

        expect(useLocator3DStore.getState().showLabels).toBe(true);
        expect(useLocator3DStore.getState().showPaths).toBe(true);
        expect(useLocator3DStore.getState().showGrid).toBe(true);

        useLocator3DStore.getState().toggleSceneOption('showLabels');
        useLocator3DStore.getState().toggleSceneOption('showPaths');
        useLocator3DStore.getState().requestCameraPreset('counter');

        expect(useLocator3DStore.getState().showLabels).toBe(false);
        expect(useLocator3DStore.getState().showPaths).toBe(false);
        expect(useLocator3DStore.getState().showGrid).toBe(true);
        expect(useLocator3DStore.getState().cameraPresetRequest).toEqual({
            preset: 'counter',
            sequence: 1,
        });

        useLocator3DStore.getState().resetCamera();

        expect(useLocator3DStore.getState().cameraPresetRequest).toEqual({
            preset: 'overview',
            sequence: 2,
        });

        useLocator3DStore.getState().requestCameraPreset('topDown');

        expect(useLocator3DStore.getState().cameraPresetRequest).toEqual({
            preset: 'topDown',
            sequence: 3,
        });
    });

    it('adds objects from the library and selects the new object', () => {
        resetLocator3DStore();
        const initialCount = useLocator3DStore.getState().sceneObjects.length;

        useLocator3DStore.getState().addSceneObject('shelf-2-layer');

        const state = useLocator3DStore.getState();
        expect(state.sceneObjects).toHaveLength(initialCount + 1);
        expect(state.selectedObjectId).toMatch(/^shelf-2-layer-/);
        expect(state.sceneObjects.at(-1)).toEqual(expect.objectContaining({
            type: 'shelf-2-layer',
            floor: state.activeFloor,
            dimensions: expect.objectContaining({ width: 3.2, depth: 0.9, height: 1.35 }),
        }));
    });

    it('updates editable dimensions and transforms from the properties panel', () => {
        resetLocator3DStore();
        useLocator3DStore.getState().forceSelectObject('shelf-4-a');

        useLocator3DStore.getState().updateObjectDimensions('shelf-4-a', {
            width: 4.4,
            height: 2.8,
            depth: 1.2,
        });
        useLocator3DStore.getState().updateObjectTransform('shelf-4-a', {
            position: [-2.26, 0, 1.24],
            rotation: [0, 0.785, 0],
        });

        const shelf = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-a');
        expect(shelf.dimensions).toEqual({ width: 4.4, height: 2.8, depth: 1.2 });
        expect(shelf.position).toEqual([-2.5, 0, 1]);
        expect(shelf.rotation).toEqual([0, 0.785, 0]);
    });
});

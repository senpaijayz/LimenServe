import { describe, expect, it } from 'vitest';
import { cloneLocatorSceneObjects } from '../modules/locator3d/data/locatorScene';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

describe('3D Design Mode layout safety', () => {
    it('keeps default, saved, and working layouts distinct and discards only working edits', () => {
        resetLocator3DStore();
        const saved = cloneLocatorSceneObjects();
        saved.find((object) => object.id === 'shelf-2-a').position = [-6.5, 0, -1.5];

        useLocator3DStore.getState().loadLayoutData({ objects: saved });
        const store = useLocator3DStore.getState();
        store.updateObjectTransform('shelf-2-a', { position: [-4.12, 0, -1.62] });

        expect(useLocator3DStore.getState().savedLayoutObjects.find((object) => object.id === 'shelf-2-a').position).toEqual([-6.5, 0, -1.5]);
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').position).toEqual([-4, 0, -1.5]);
        expect(useLocator3DStore.getState().defaultLayoutObjects.find((object) => object.id === 'shelf-2-a').position).toEqual([-7.2, 0, -2.2]);

        store.discardUnsavedChanges();
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').position).toEqual([-6.5, 0, -1.5]);
        expect(useLocator3DStore.getState().hasUnsavedChanges).toBe(false);
    });

    it('resets only the current floor and never mutates product locations', () => {
        resetLocator3DStore();
        const store = useLocator3DStore.getState();
        store.setProductLocations([{ productId: 'brake-pad', shelfObjectId: 'shelf-2-b', floor: 1 }]);
        store.updateObjectTransform('shelf-2-a', { position: [-4, 0, -1.5] });
        store.goToFloor(2);
        store.addSceneObject('shelf-2-layer');
        const addedFloorTwoId = useLocator3DStore.getState().selectedObjectId;
        const floorOnePosition = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').position;

        store.resetCurrentFloor();

        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').position).toEqual(floorOnePosition);
        expect(useLocator3DStore.getState().sceneObjects.some((object) => object.id === addedFloorTwoId)).toBe(false);
        expect(useLocator3DStore.getState().productLocations).toEqual([{ productId: 'brake-pad', shelfObjectId: 'shelf-2-b', floor: 1 }]);
    });

    it('creates snapped wall segments and records one undoable interaction per completed wall', () => {
        resetLocator3DStore();
        const store = useLocator3DStore.getState();
        store.setDesignMode(true);
        store.beginWallDrawing([-1.13, 0, -1.12]);
        store.previewWallDrawing([1.12, 0, -1.12]);
        store.completeWallDrawing([1.12, 0, -1.12]);

        const wall = useLocator3DStore.getState().sceneObjects.find((object) => object.type === 'wall');
        expect(wall.wallStart).toEqual([-1.25, 0, -1]);
        expect(wall.wallEnd).toEqual([1, 0, -1]);
        expect(wall.position[1]).toBe(0);
        expect(useLocator3DStore.getState().history.past).toHaveLength(1);

        store.undo();
        expect(useLocator3DStore.getState().sceneObjects.some((object) => object.id === wall.id)).toBe(false);
        store.redo();
        expect(useLocator3DStore.getState().sceneObjects.some((object) => object.id === wall.id)).toBe(true);
    });

    it('commits a live transform as one history step and supports keyboard-sized nudges', () => {
        resetLocator3DStore();
        const store = useLocator3DStore.getState();
        store.forceSelectObject('shelf-2-a');
        store.beginObjectTransform('shelf-2-a');
        store.previewObjectTransform('shelf-2-a', { position: [-5.11, 0, -1.62], rotation: [0, 0, 0] });
        store.previewObjectTransform('shelf-2-a', { position: [-4.86, 0, -1.62], rotation: [0, 0, 0] });
        store.commitObjectTransform('shelf-2-a');

        expect(useLocator3DStore.getState().history.past).toHaveLength(1);
        store.nudgeSelectedObjects('ArrowRight');
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').position[0]).toBe(-4.5);
    });

    it('keeps wall endpoints in sync when a wall is dragged or rotated', () => {
        resetLocator3DStore();
        const store = useLocator3DStore.getState();
        store.beginWallDrawing([0, 0, 0]);
        store.completeWallDrawing([2, 0, 0]);
        const wall = useLocator3DStore.getState().sceneObjects.find((object) => object.type === 'wall');

        store.beginObjectTransform(wall.id);
        store.previewObjectTransform(wall.id, { position: [2, 0, 2], rotation: [0, Math.PI / 2, 0] });
        store.commitObjectTransform(wall.id);

        const movedWall = useLocator3DStore.getState().sceneObjects.find((object) => object.id === wall.id);
        expect(movedWall.wallStart).toEqual([2, 0, 3]);
        expect(movedWall.wallEnd).toEqual([2, 0, 1]);
    });

    it('keeps the two floor footprints aligned when the shared floor is resized', () => {
        resetLocator3DStore();
        const store = useLocator3DStore.getState();

        store.updateObjectDimensions('floor-main', { width: 28, depth: 19, height: 6 });

        const floor = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'floor-main');
        const upperShelf = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-4-b');
        const stairs = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'stairs-a');

        expect(floor.dimensions).toEqual({ width: 28, depth: 19, height: 6 });
        expect(upperShelf.position[1]).toBe(6);
        expect(stairs.dimensions.height).toBe(6);
    });

    it('migrates legacy front-to-back stairs to the left-to-right axis', () => {
        const legacy = cloneLocatorSceneObjects();
        const stairs = legacy.find((object) => object.id === 'stairs-a');
        delete stairs.layoutOrientation;
        stairs.dimensions = { width: 2.8, depth: 6.2, height: 6 };

        resetLocator3DStore();
        useLocator3DStore.getState().loadLayoutData({ objects: legacy });

        const migrated = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'stairs-a');
        expect(migrated.layoutOrientation).toBe('left-to-right');
        expect(migrated.dimensions.width).toBe(6.2);
        expect(migrated.dimensions.depth).toBe(2.8);
    });
});

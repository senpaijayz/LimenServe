import { describe, expect, it } from 'vitest';
import { cloneLocatorSceneObjects } from '../modules/locator3d/data/locatorScene';
import { validateLayoutObjects } from '../modules/locator3d/utils/layoutValidation';
import { getLocatorAutosave, resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

describe('3D layout integrity and editor history', () => {
    it('detects collisions and floor-boundary violations', () => {
        const objects = cloneLocatorSceneObjects();
        objects.push({
            ...objects.find((object) => object.id === 'shelf-2-a'),
            id: 'shelf-collision',
            name: 'Collision shelf',
            position: [-4.8, 0, -1.6],
        });
        objects.push({
            ...objects.find((object) => object.id === 'shelf-2-a'),
            id: 'shelf-outside',
            name: 'Outside shelf',
            position: [12, 0, 8],
        });

        const issues = validateLayoutObjects(objects);

        expect(issues.some((issue) => issue.code === 'collision' && issue.objectIds.includes('shelf-collision'))).toBe(true);
        expect(issues.some((issue) => issue.code === 'out_of_bounds' && issue.objectIds.includes('shelf-outside'))).toBe(true);
    });

    it('supports undo, redo, duplicate, multiselect, and alignment', () => {
        resetLocator3DStore();
        const store = useLocator3DStore.getState();
        store.forceSelectObject('shelf-2-a');
        const originalX = useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').position[0];

        store.updateObjectTransform('shelf-2-a', { position: [-2.2, 0, -1.6] });
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').position[0]).toBe(-2);
        store.undo();
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').position[0]).toBe(originalX);
        store.redo();
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').position[0]).toBe(-2);

        store.forceSelectObject('shelf-4-a');
        store.duplicateSelectedObject();
        const duplicateId = useLocator3DStore.getState().selectedObjectId;
        expect(duplicateId).toMatch(/^shelf-4-layer-.*-copy-1$/);

        store.selectObject('shelf-2-a');
        store.selectObject('shelf-4-a', { additive: true });
        store.alignSelectedObjects('x', 'center');
        const selected = useLocator3DStore.getState().sceneObjects.filter((object) => ['shelf-2-a', 'shelf-4-a'].includes(object.id));
        expect(selected[0].position[0]).toBe(selected[1].position[0]);
    });

    it('writes and recovers a local autosave snapshot', () => {
        localStorage.clear();
        resetLocator3DStore();
        useLocator3DStore.getState().forceSelectObject('shelf-2-a');
        useLocator3DStore.getState().updateObjectTransform('shelf-2-a', { position: [-2.2, 0, -1.6] });

        expect(getLocatorAutosave()?.objects).toHaveLength(useLocator3DStore.getState().sceneObjects.length);
        useLocator3DStore.getState().loadLayoutData({ objects: cloneLocatorSceneObjects() });
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').position[0]).toBe(-7.2);
        expect(useLocator3DStore.getState().recoverAutosave()).toBe(true);
        expect(useLocator3DStore.getState().sceneObjects.find((object) => object.id === 'shelf-2-a').position[0]).toBe(-2);
        useLocator3DStore.getState().discardAutosave();
        expect(getLocatorAutosave()).toBeNull();
    });
});

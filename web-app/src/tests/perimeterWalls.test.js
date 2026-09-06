import { beforeEach, describe, expect, it } from 'vitest';
import {
    FLOOR_HEIGHT,
    LOCATOR_SCENE_OBJECTS,
    buildPerimeterWallSegments,
    normalizeLayoutObjects,
} from '../modules/locator3d/data/locatorScene';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';
import { validateLayoutObjects } from '../modules/locator3d/utils/layoutValidation';

const length = (wall) => Math.hypot(wall.wallEnd[0] - wall.wallStart[0], wall.wallEnd[2] - wall.wallStart[2]);

describe('Independent perimeter walls', () => {
    beforeEach(() => resetLocator3DStore());

    it('seeds one independently addressable wall for every side of each floor', () => {
        const walls = LOCATOR_SCENE_OBJECTS.filter((object) => object.type === 'wall' && object.isPerimeterWall);
        expect(walls).toHaveLength(8);
        expect(new Set(walls.map((wall) => wall.id)).size).toBe(8);
        expect(walls.map((wall) => `${wall.floor}:${wall.perimeterSide}`).sort()).toEqual([
            '1:east', '1:north', '1:south', '1:west', '2:east', '2:north', '2:south', '2:west',
        ]);
        expect(walls.find((wall) => wall.id === 'perimeter-floor-1-south').opening).toEqual({ offset: 0, width: 6.24 });
        expect(walls.find((wall) => wall.id === 'perimeter-floor-2-south').opening).toBeNull();
    });

    it('keeps a side edit independent and synchronizes its endpoints to the entered length', () => {
        const store = useLocator3DStore.getState();
        const targetId = 'perimeter-floor-1-south';
        const otherId = 'perimeter-floor-1-west';
        const otherBefore = store.sceneObjects.find((wall) => wall.id === otherId);
        store.updateObjectDimensions(targetId, { width: 9.5, height: 3.2, depth: 0.35 });
        const target = useLocator3DStore.getState().sceneObjects.find((wall) => wall.id === targetId);
        const otherAfter = useLocator3DStore.getState().sceneObjects.find((wall) => wall.id === otherId);
        expect(target.dimensions).toMatchObject({ width: 9.5, height: 3.2, depth: 0.35 });
        expect(length(target)).toBeCloseTo(9.5, 3);
        expect(target.opening).toEqual({ offset: 0, width: 2.47 });
        expect(otherAfter).toEqual(otherBefore);
    });

    it('converts a legacy whole-perimeter layout to side walls without losing its dimensions or rotation', () => {
        const angle = Math.PI / 4;
        const legacy = [
            { id: 'floor-main', type: 'floor', floors: [1, 2], position: [4, 0, -3], rotation: [0, angle, 0], dimensions: { width: 30, depth: 18, height: 6 } },
            { id: 'walls-main', type: 'walls', floors: [1, 2], position: [4, 0, -3], rotation: [0, angle, 0], dimensions: { width: 30, depth: 18, height: 3.4 }, isLocked: true },
        ];
        const converted = normalizeLayoutObjects(legacy);
        const walls = converted.filter((object) => object.type === 'wall');
        expect(converted.some((object) => object.type === 'walls')).toBe(false);
        expect(walls).toHaveLength(8);
        expect(walls.every((wall) => wall.isLocked)).toBe(true);
        expect(walls.filter((wall) => wall.floor === 2).every((wall) => wall.position[1] === 6)).toBe(true);
        expect(walls.find((wall) => wall.perimeterSide === 'north' && wall.floor === 1).dimensions.width).toBeCloseTo(30);
        expect(walls.find((wall) => wall.perimeterSide === 'east' && wall.floor === 1).dimensions.width).toBeCloseTo(18);
        expect(walls.find((wall) => wall.perimeterSide === 'south' && wall.floor === 1).opening.width).toBeCloseTo(6.24);
    });

    it('uses the selected floor height for newly converted upper walls', () => {
        const walls = buildPerimeterWallSegments({ dimensions: { width: 20, depth: 12, height: 3 }, floorHeight: 6.25 });
        expect(walls.filter((wall) => wall.floor === 2).every((wall) => wall.position[1] === 6.25)).toBe(true);
        expect(walls.filter((wall) => wall.floor === 1).every((wall) => wall.position[1] === 0)).toBe(true);
        expect(walls.find((wall) => wall.floor === 1 && wall.perimeterSide === 'east').dimensions.width).toBe(12);
        expect(FLOOR_HEIGHT).toBe(4.5);
    });

    it('does not report permanent perimeter walls as movable-fixture collisions', () => {
        const perimeterIds = new Set(LOCATOR_SCENE_OBJECTS.filter((object) => object.isPerimeterWall).map((object) => object.id));
        const issues = validateLayoutObjects(LOCATOR_SCENE_OBJECTS);
        expect(issues.every((issue) => issue.objectIds.every((id) => !perimeterIds.has(id)))).toBe(true);
    });
});

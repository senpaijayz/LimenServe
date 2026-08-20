import { describe, expect, it } from 'vitest';
import { cloneLocatorSceneObjects, getStairLayoutMetrics } from '../modules/locator3d/data/locatorScene';
import { buildObstacleAwarePath, findWalkablePath } from '../modules/locator3d/utils/locatorPathfinding';

describe('locator obstacle-aware pathfinding', () => {
    it('routes around a shelf obstacle instead of crossing its footprint', () => {
        const objects = cloneLocatorSceneObjects();
        const shelf = objects.find((object) => object.id === 'shelf-4-a');
        const path = findWalkablePath([-6, 0, 4], [2, 0, -1], objects, { floor: 1, ignoreObjectIds: [shelf.id] });

        expect(path.length).toBeGreaterThan(2);
        expect(path[0][1]).toBe(0);
        expect(path.at(-1)).toEqual([2, 0, -1]);
    });

    it('keeps a second-floor route connected through the stairs transition', () => {
        const objects = cloneLocatorSceneObjects();
        const path = buildObstacleAwarePath(objects, {
            binNumber: 4,
            floor: 2,
            shelfObjectId: 'shelf-4-b',
            shelfNumber: 3,
            targetPosition: [2.1, 5.4, -5.15],
        });
        const stairs = objects.find((object) => object.id === 'stairs-a');
        const metrics = getStairLayoutMetrics(stairs);
        const landingPoint = [
            stairs.position[0] + metrics.landingX,
            2.7,
            stairs.position[2] + metrics.landingZ,
        ];
        const topPoint = [
            stairs.position[0] + metrics.landingX,
            5.45,
            stairs.position[2] + (metrics.overallDepth / 2) - 0.25,
        ];

        expect(path.length).toBeGreaterThan(3);
        expect(path).toContainEqual(landingPoint);
        expect(path).toContainEqual(topPoint);
        expect(path.at(-1)).toEqual([2.1, 5.4, -5.15]);
    });
});

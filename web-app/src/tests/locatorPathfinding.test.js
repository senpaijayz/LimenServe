import { describe, expect, it } from 'vitest';
import { cloneLocatorSceneObjects, getStairLayoutMetrics } from '../modules/locator3d/data/locatorScene';
import { buildObstacleAwarePath, findWalkablePath, localToWorld } from '../modules/locator3d/utils/locatorPathfinding';

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
            2.25,
            stairs.position[2] + metrics.landingZ,
        ];
        const topPoint = [
            stairs.position[0] + metrics.landingX,
            4.5,
            stairs.position[2] + (metrics.overallDepth / 2) + 0.55,
        ];

        expect(path.length).toBeGreaterThan(3);
        expect(path).toContainEqual(landingPoint);
        expect(path).toContainEqual(topPoint);
        expect(path.at(-1)[1]).toBe(4.5);
        expect(path.at(-1)).not.toEqual([2.1, 5.4, -5.15]); // Stops in the aisle, not inside the shelf.
    });

    const base = { id: 'floor', type: 'floor', position: [0, 0, 0], dimensions: { width: 10, depth: 8, height: 6 } };
    const partition = { id: 'wall', type: 'wall', floor: 1, position: [0.23, 0, 0], rotation: [0, Math.PI / 2, 0], dimensions: { width: 8, depth: 0.1, height: 3 } };
    it('cannot hop over a thin wall between grid cells', () => {
        expect(findWalkablePath([-2, 0, 0], [2, 0, 0], [base, partition])).toEqual([]);
    });
    it('routes through the actual opening in a rotated wall', () => {
        const path = findWalkablePath([-2, 0, 2], [2, 0, 2], [base, { ...partition, opening: { width: 1.8, offset: 0 } }]);
        expect(path.length).toBeGreaterThan(3);
        expect(path.some(([x, , z]) => Math.abs(x) < 0.6 && Math.abs(z) < 0.6)).toBe(true);
    });
    it('rejects outside endpoints after resizing and moving the floor', () => {
        expect(findWalkablePath([-2, 0, 0], [4, 0, 0], [{ ...base, dimensions: { width: 4, depth: 4, height: 6 } }])).toEqual([]);
        expect(findWalkablePath([19, 0, 0], [21, 0, 0], [{ ...base, position: [20, 0, 0] }]).length).toBeGreaterThan(1);
    });
    it('does not relocate an endpoint through a closed wall', () => {
        expect(findWalkablePath([0.23, 0, 0], [2, 0, 0], [base, partition])).toEqual([]);
    });
    it('returns no route when the second floor has no stairs', () => {
        expect(buildObstacleAwarePath(cloneLocatorSceneObjects().filter((o) => o.type !== 'stairs'), { floor: 2, shelfObjectId: 'shelf-4-b' })).toEqual([]);
    });
    it('transforms stair access points by the mesh yaw', () => {
        const stairs = { position: [5, 0, 3], rotation: [0, Math.PI / 2, 0] };
        const point = localToWorld(stairs, -2, 1, 6);
        expect(point[0]).toBeCloseTo(6);
        expect(point[1]).toBe(6);
        expect(point[2]).toBeCloseTo(5);
    });
});

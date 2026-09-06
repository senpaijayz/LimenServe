import { describe, expect, it } from 'vitest';
import { getFloorBounds, getOverviewCamera } from '../modules/locator3d/utils/locatorViewport';
import { getShelfObjectByLocation, locationBelongsToShelf } from '../modules/locator3d/data/locatorScene';

const floor = { id: 'floor', type: 'floor', floors: [1, 2], position: [10, 0, -5], dimensions: { width: 24, depth: 16, height: 4.5 } };

describe('Room-aware locator camera', () => {
    it('keeps a resized room centred and fits further away on portrait screens', () => {
        const desktop = getOverviewCamera([floor], 1, 4.5, 1.8);
        const mobile = getOverviewCamera([floor], 1, 4.5, 0.5);
        const bigger = getOverviewCamera([{ ...floor, dimensions: { ...floor.dimensions, width: 48 } }], 1, 4.5, 1.8);
        const distance = (target) => Math.hypot(...target.position.map((value, index) => value - target.lookAt[index]));
        expect(desktop.lookAt[0]).toBe(10);
        expect(desktop.lookAt[2]).toBe(-5);
        expect(distance(mobile)).toBeGreaterThan(distance(desktop));
        expect(distance(bigger)).toBeGreaterThan(distance(desktop));
    });
    it('accounts for rotated footprints without including objects from the hidden floor', () => {
        const rack = { type: 'shelf', floor: 1, position: [0, 0, 0], dimensions: { width: 8, depth: 2 }, rotation: [0, Math.PI / 2, 0] };
        const bounds = getFloorBounds([rack, { ...rack, floor: 2, position: [100, 0, 100] }], 1);
        expect(bounds.width).toBeCloseTo(2);
        expect(bounds.depth).toBeCloseTo(8);
        expect(bounds.x).toBe(0);
    });
    it('moves the top-down view to the selected floor height', () => {
        const first = getOverviewCamera([floor], 1, 6, 1, true);
        const second = getOverviewCamera([floor], 2, 6, 1, true);
        expect(second.lookAt[1] - first.lookAt[1]).toBe(6);
        expect(second.position[1] - first.position[1]).toBeCloseTo(6);
        expect(second.position[0]).toBe(second.lookAt[0]);
    });
});

describe('Shelf identity across floors and designs', () => {
    const first = { id: 'first', type: 'shelf', aisle: 'B', shelfNumber: 2, floor: 1 };
    const second = { ...first, id: 'second', floor: 2 };
    it('does not show a mapped product on another shelf with the same aisle and number', () => {
        const location = { shelfObjectId: 'first', floor: 1, aisle: 'B', shelfNumber: 2 };
        expect(locationBelongsToShelf(location, first)).toBe(true);
        expect(locationBelongsToShelf(location, second)).toBe(false);
        expect(getShelfObjectByLocation(location, [second])).toBeNull();
    });
    it('scopes older locations without an object ID to their floor', () => {
        const location = { floor: 2, aisle: 'B', shelfNumber: 2 };
        expect(locationBelongsToShelf(location, first)).toBe(false);
        expect(getShelfObjectByLocation(location, [first, second])).toEqual(second);
    });
});

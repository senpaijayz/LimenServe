import { describe, expect, it } from 'vitest';
import { ExtrudeGeometry, Mesh, MeshBasicMaterial, Raycaster, Shape, Vector2, Vector3 } from 'three';
import { getStairLayoutMetrics } from '../modules/locator3d/data/locatorScene';
import { getFloorSurface, getStairOpeningPolygon, rectanglePolygon, subtractFloorOpenings } from '../modules/locator3d/utils/stairOpening';

const floor = { type: 'floor', position: [0, 0, 0], rotation: [0, 0, 0], dimensions: { width: 24, depth: 20 } };
const stair = { type: 'stairs', position: [-3, 0, -2], rotation: [0, 0, 0], dimensions: { width: 5.6, depth: 5.6 } };
const area = (polygon) => Math.abs(polygon.reduce((sum, [x, z], i) => {
    const next = polygon[(i + 1) % polygon.length];
    return sum + x * next[1] - z * next[0];
}, 0)) / 2;
const surfaceArea = (panels) => panels.reduce((sum, polygon) => sum + area(polygon), 0);
const inPolygon = ([x, z], polygon) => polygon.every(([ax, az], i) => {
    const [bx, bz] = polygon[(i + 1) % polygon.length];
    return (bx - ax) * (z - az) - (bz - az) * (x - ax) >= -1e-7;
});

describe('Stair-aligned upstairs opening', () => {
    it.each([0, 15, 45, 90, 180, 270])('follows %s° rotation without opening the empty side', (degrees) => {
        const angle = degrees * Math.PI / 180;
        const rotated = { ...stair, rotation: [0, angle, 0] };
        const { flightWidth, landingX, overallDepth } = getStairLayoutMetrics(rotated);
        const { panels, openings } = getFloorSurface(floor, [rotated], 2);
        const centre = [stair.position[0] + Math.cos(angle) * landingX, stair.position[2] - Math.sin(angle) * landingX];
        const emptySide = [stair.position[0] - Math.cos(angle) * landingX, stair.position[2] + Math.sin(angle) * landingX];
        expect(inPolygon(centre, openings[0])).toBe(true);
        expect(panels.some((polygon) => inPolygon(centre, polygon))).toBe(false);
        expect(panels.some((polygon) => inPolygon(emptySide, polygon))).toBe(true);
        expect(surfaceArea(panels)).toBeCloseTo(480 - (flightWidth + 0.48) * (overallDepth + 0.48), 6);
    });

    it('uses floor-local coordinates when the floor and stair move or rotate together', () => {
        const angle = Math.PI / 3;
        const movedFloor = { ...floor, position: [5, 0, 8], rotation: [0, angle, 0] };
        const [x, , z] = stair.position;
        const movedStair = { ...stair, position: [5 + Math.cos(angle) * x + Math.sin(angle) * z, 0, 8 - Math.sin(angle) * x + Math.cos(angle) * z], rotation: [0, angle, 0] };
        const original = getStairOpeningPolygon(stair, floor);
        getStairOpeningPolygon(movedStair, movedFloor).forEach((point, index) => point.forEach((value, axis) => expect(value).toBeCloseTo(original[index][axis])));
    });

    it('changes the opening size with the stair dimensions', () => {
        const resized = { ...stair, dimensions: { width: 8, depth: 9 } };
        const metrics = getStairLayoutMetrics(resized);
        expect(area(getStairOpeningPolygon(resized, floor))).toBeCloseTo((metrics.flightWidth + 0.48) * (metrics.overallDepth + 0.48));
    });

    it('keeps Floor 1 solid and does not make a hole when there are no stairs', () => {
        expect(surfaceArea(getFloorSurface(floor, [stair], 1).panels)).toBe(480);
        expect(surfaceArea(getFloorSurface(floor, [], 2).panels)).toBe(480);
        expect(surfaceArea(getFloorSurface(floor, [{ ...stair, position: [100, 0, 100] }], 2).panels)).toBeCloseTo(480);
    });

    it('clips at the floor edge without stretching a cut across the room', () => {
        const panels = subtractFloorOpenings(rectanglePolygon(10, 10), [rectanglePolygon(4, 4, 5, 0)]);
        expect(surfaceArea(panels)).toBeCloseTo(92);
        expect(panels.every((polygon) => polygon.every(([x, z]) => Math.abs(x) <= 5 && Math.abs(z) <= 5))).toBe(true);
    });

    it('handles multiple and overlapping openings without doubled cuts', () => {
        const panels = subtractFloorOpenings(rectanglePolygon(10, 10), [rectanglePolygon(4, 4), rectanglePolygon(4, 4, 2, 0)]);
        expect(surfaceArea(panels)).toBeCloseTo(76);
    });

    it('cuts floor markings too, so a stripe cannot cover the stair access', () => {
        expect(subtractFloorOpenings(rectanglePolygon(0.1, 4), [rectanglePolygon(2, 6)])).toEqual([]);
    });

    it('renders a real pass-through hole while the adjacent floor still receives ray hits', () => {
        const rotated = { ...stair, position: [0, 0, 0], rotation: [0, Math.PI / 2, 0] };
        const { panels } = getFloorSurface(floor, [rotated], 2);
        const shapes = panels.map((polygon) => new Shape(polygon.map(([x, z]) => new Vector2(x, -z))));
        const geometry = new ExtrudeGeometry(shapes, { depth: 0.18, bevelEnabled: false });
        const material = new MeshBasicMaterial();
        const mesh = new Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.updateMatrixWorld(true);
        const ray = (x, z) => new Raycaster(new Vector3(x, 10, z), new Vector3(0, -1, 0)).intersectObject(mesh).length;
        const { landingX } = getStairLayoutMetrics(rotated);
        expect(ray(0, -landingX)).toBe(0);
        expect(ray(0, landingX)).toBeGreaterThan(0);
        geometry.dispose();
        material.dispose();
    });
});

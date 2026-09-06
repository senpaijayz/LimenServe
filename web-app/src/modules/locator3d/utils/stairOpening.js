import { getStairLayoutMetrics } from '../data/locatorScene';

const EPSILON = 1e-8;

export function rectanglePolygon(width, depth, x = 0, z = 0) {
    return [[x - width / 2, z - depth / 2], [x + width / 2, z - depth / 2],
        [x + width / 2, z + depth / 2], [x - width / 2, z + depth / 2]];
}

// Match the L-stair mesh: landing and upper flight lie along local +Z,
// offset toward local +X. Transform that footprint into the floor's space.
export function getStairOpeningPolygon(stairs, floor) {
    const { flightWidth, landingX, overallDepth } = getStairLayoutMetrics(stairs);
    const stairAngle = Number(stairs.rotation?.[1] || 0);
    const floorAngle = Number(floor.rotation?.[1] || 0);
    return rectanglePolygon(flightWidth + 0.48, overallDepth + 0.48, landingX).map(([x, z]) => {
        const dx = Math.cos(stairAngle) * x + Math.sin(stairAngle) * z
            + Number(stairs.position?.[0] || 0) - Number(floor.position?.[0] || 0);
        const dz = -Math.sin(stairAngle) * x + Math.cos(stairAngle) * z
            + Number(stairs.position?.[2] || 0) - Number(floor.position?.[2] || 0);
        return [Math.cos(floorAngle) * dx - Math.sin(floorAngle) * dz,
            Math.sin(floorAngle) * dx + Math.cos(floorAngle) * dz];
    });
}

const side = ([x, z], [ax, az], [bx, bz]) => (bx - ax) * (z - az) - (bz - az) * (x - ax);

function clipHalfPlane(polygon, a, b, direction) {
    const result = [];
    for (let i = 0; i < polygon.length; i += 1) {
        const previous = polygon[(i + polygon.length - 1) % polygon.length];
        const current = polygon[i];
        const before = direction * side(previous, a, b);
        const after = direction * side(current, a, b);
        if ((before >= -EPSILON) !== (after >= -EPSILON)) {
            const ratio = before / (before - after);
            result.push(previous.map((value, axis) => value + ratio * (current[axis] - value)));
        }
        if (after >= -EPSILON) result.push(current);
    }
    return result.filter((point, i) => {
        const previous = result[(i + result.length - 1) % result.length];
        return Math.hypot(point[0] - previous[0], point[1] - previous[1]) > EPSILON;
    });
}

function hasArea(polygon) {
    return polygon.length >= 3 && Math.abs(polygon.reduce((area, [x, z], i) => {
        const next = polygon[(i + 1) % polygon.length];
        return area + x * next[1] - z * next[0];
    }, 0)) > EPSILON;
}

// Partition the floor outside each convex opening, not outside its axis-aligned
// bounding box. This also handles openings crossing a wall or multiple stairs.
export function subtractFloorOpenings(polygon, openings) {
    return openings.reduce((panels, opening) => panels.flatMap((panel) => {
        let remaining = panel;
        const outside = [];
        for (let i = 0; i < opening.length && hasArea(remaining); i += 1) {
            const a = opening[i];
            const b = opening[(i + 1) % opening.length];
            const piece = clipHalfPlane(remaining, a, b, -1);
            if (hasArea(piece)) outside.push(piece);
            remaining = clipHalfPlane(remaining, a, b, 1);
        }
        return outside;
    }), [polygon]);
}

export function getFloorSurface(floor, sceneObjects, activeFloor) {
    const openings = activeFloor === 2
        ? sceneObjects.filter((object) => object.type === 'stairs').map((stairs) => getStairOpeningPolygon(stairs, floor))
        : [];
    return {
        openings,
        panels: subtractFloorOpenings(rectanglePolygon(Number(floor.dimensions?.width || 18), Number(floor.dimensions?.depth || 14)), openings),
    };
}

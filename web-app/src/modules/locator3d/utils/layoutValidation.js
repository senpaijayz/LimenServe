import { FLOOR_HEIGHT } from '../data/locatorScene';

const FLOOR_BOUNDS = { width: 24, depth: 16 };
const STRUCTURE_TYPES = new Set(['floor', 'walls']);

function numberOr(value, fallback = 0) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function getObjectFootprint(object) {
    const width = Math.max(0.1, numberOr(object?.dimensions?.width, 1));
    const depth = Math.max(0.1, numberOr(object?.dimensions?.depth, 1));
    const rotation = numberOr(object?.rotation?.[1], 0);
    const cosine = Math.abs(Math.cos(rotation));
    const sine = Math.abs(Math.sin(rotation));

    return {
        depth: (width * sine + depth * cosine) / 2,
        height: Math.max(0.1, numberOr(object?.dimensions?.height, 1)),
        width: (width * cosine + depth * sine) / 2,
    };
}

function objectFloorSet(object) {
    if (Array.isArray(object?.floors) && object.floors.length) {
        return object.floors.map(Number);
    }

    return [Number(object?.floor) === 2 ? 2 : 1];
}

function overlaps(first, second) {
    const firstFootprint = getObjectFootprint(first);
    const secondFootprint = getObjectFootprint(second);
    const firstX = numberOr(first.position?.[0]);
    const firstZ = numberOr(first.position?.[2]);
    const secondX = numberOr(second.position?.[0]);
    const secondZ = numberOr(second.position?.[2]);

    return Math.abs(firstX - secondX) < firstFootprint.width + secondFootprint.width
        && Math.abs(firstZ - secondZ) < firstFootprint.depth + secondFootprint.depth;
}

export function validateLayoutObjects(objects = []) {
    const issues = [];

    for (const object of objects) {
        if (STRUCTURE_TYPES.has(object.type)) {
            continue;
        }

        const footprint = getObjectFootprint(object);
        const x = numberOr(object.position?.[0]);
        const z = numberOr(object.position?.[2]);
        const halfWidth = FLOOR_BOUNDS.width / 2;
        const halfDepth = FLOOR_BOUNDS.depth / 2;

        if (x - footprint.width < -halfWidth || x + footprint.width > halfWidth
            || z - footprint.depth < -halfDepth || z + footprint.depth > halfDepth) {
            issues.push({
                code: 'out_of_bounds',
                message: `${object.name || object.id} extends beyond the floor boundary.`,
                objectIds: [object.id],
            });
        }

        if (numberOr(object.position?.[1]) < -0.01 || numberOr(object.position?.[1]) > FLOOR_HEIGHT + 0.01) {
            issues.push({
                code: 'invalid_floor_height',
                message: `${object.name || object.id} has an invalid floor height.`,
                objectIds: [object.id],
            });
        }
    }

    for (let index = 0; index < objects.length; index += 1) {
        const first = objects[index];
        if (STRUCTURE_TYPES.has(first.type)) {
            continue;
        }

        for (let nextIndex = index + 1; nextIndex < objects.length; nextIndex += 1) {
            const second = objects[nextIndex];
            if (STRUCTURE_TYPES.has(second.type)) {
                continue;
            }

            const sameFloor = objectFloorSet(first).some((floor) => objectFloorSet(second).includes(floor));
            if (sameFloor && overlaps(first, second)) {
                issues.push({
                    code: 'collision',
                    message: `${first.name || first.id} overlaps ${second.name || second.id}.`,
                    objectIds: [first.id, second.id],
                });
            }
        }
    }

    return issues;
}

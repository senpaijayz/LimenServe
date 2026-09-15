import { FLOOR_HEIGHT, isShelfObject, normalizeAisle } from '../data/locatorScene';

const FLOOR_BOUNDS = { width: 24, depth: 16 };
// Walls define the room boundary; they are not movable inventory fixtures and
// must not produce false collision or out-of-bounds warnings.
const STRUCTURE_TYPES = new Set(['floor', 'wall', 'walls']);

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

export function validateShelfIdentifiers(objects = []) {
    const issues = [];
    const used = new Map();
    for (const object of objects.filter(isShelfObject)) {
        const aisle = normalizeAisle(object.aisle);
        const number = Number(object.shelfNumber);
        if (!aisle || aisle.length > 24 || !Number.isInteger(number) || number < 1 || number > 9999) {
            issues.push({ code: 'invalid_shelf_identifier', message: 'Each shelf needs an aisle and a shelf number from 1 to 9999.', objectIds: [object.id] });
        }
        const key = `${Number(object.floor || 1)}:${aisle}:${number}`;
        if (used.has(key)) issues.push({ code: 'duplicate_shelf_identifier', message: `Floor ${object.floor || 1}, aisle ${aisle}, shelf ${number} is used twice. Give each shelf a unique number.`, objectIds: [used.get(key), object.id] });
        used.set(key, object.id);
    }
    return issues;
}

export function nextShelfNumber(objects, shelf) {
    const used = new Set(objects.filter((object) => isShelfObject(object) && Number(object.floor || 1) === Number(shelf.floor || 1) && normalizeAisle(object.aisle) === normalizeAisle(shelf.aisle)).map((object) => Number(object.shelfNumber)));
    let number = 1;
    while (used.has(number)) number += 1;
    return number;
}

export function validateLayoutObjects(objects = []) {
    const issues = validateShelfIdentifiers(objects);
    const floor = objects.find((object) => object.type === 'floor');
    const floorYaw = numberOr(floor?.rotation?.[1]);
    const floorHeight = numberOr(floor?.dimensions?.height, FLOOR_HEIGHT);

    for (const object of objects) {
        if (STRUCTURE_TYPES.has(object.type)) {
            continue;
        }

        const footprint = getObjectFootprint({ ...object, rotation: [0, numberOr(object.rotation?.[1]) - floorYaw, 0] });
        const dx = numberOr(object.position?.[0]) - numberOr(floor?.position?.[0]);
        const dz = numberOr(object.position?.[2]) - numberOr(floor?.position?.[2]);
        const x = Math.cos(floorYaw) * dx - Math.sin(floorYaw) * dz;
        const z = Math.sin(floorYaw) * dx + Math.cos(floorYaw) * dz;
        const halfWidth = numberOr(floor?.dimensions?.width, FLOOR_BOUNDS.width) / 2;
        const halfDepth = numberOr(floor?.dimensions?.depth, FLOOR_BOUNDS.depth) / 2;

        if (x - footprint.width < -halfWidth || x + footprint.width > halfWidth
            || z - footprint.depth < -halfDepth || z + footprint.depth > halfDepth) {
            issues.push({
                code: 'out_of_bounds',
                message: `${object.name || object.id} extends beyond the floor boundary.`,
                objectIds: [object.id],
            });
        }

        if (numberOr(object.position?.[1]) < -0.01 || numberOr(object.position?.[1]) > floorHeight + 0.01) {
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

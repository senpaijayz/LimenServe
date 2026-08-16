import { FLOOR_HEIGHT } from '../data/locatorScene';
import { getObjectFootprint } from './layoutValidation';

const GRID_STEP = 0.5;
const BOUNDS = { maxX: 11.5, maxZ: 7.5, minX: -11.5, minZ: -7.5 };
const OBSTACLE_TYPES = new Set(['counter-computer', 'entrance-door', 'parts-cabinet', 'shelf', 'shelf-2-layer', 'shelf-4-layer']);

function key(x, z) {
    return `${x}:${z}`;
}

function roundGrid(value) {
    return Number((Math.round(value / GRID_STEP) * GRID_STEP).toFixed(2));
}

function toGridPoint(point) {
    return { x: roundGrid(Number(point?.[0] || 0)), z: roundGrid(Number(point?.[2] || 0)) };
}

function distance(first, second) {
    return Math.abs(first.x - second.x) + Math.abs(first.z - second.z);
}

function isBlocked(point, obstacles) {
    return obstacles.some((obstacle) => {
        const footprint = getObjectFootprint(obstacle);
        const x = Number(obstacle.position?.[0] || 0);
        const z = Number(obstacle.position?.[2] || 0);
        return Math.abs(point.x - x) <= footprint.width + 0.35
            && Math.abs(point.z - z) <= footprint.depth + 0.35;
    });
}

function neighbors(point) {
    return [
        { x: point.x + GRID_STEP, z: point.z },
        { x: point.x - GRID_STEP, z: point.z },
        { x: point.x, z: point.z + GRID_STEP },
        { x: point.x, z: point.z - GRID_STEP },
    ].filter((candidate) => (
        candidate.x >= BOUNDS.minX
        && candidate.x <= BOUNDS.maxX
        && candidate.z >= BOUNDS.minZ
        && candidate.z <= BOUNDS.maxZ
    ));
}

function nearestWalkable(point, obstacles) {
    const candidate = toGridPoint(point);
    if (!isBlocked(candidate, obstacles)) {
        return candidate;
    }

    for (let radius = 1; radius <= 8; radius += 1) {
        const candidates = [];
        for (let x = -radius; x <= radius; x += 1) {
            for (let z = -radius; z <= radius; z += 1) {
                if (Math.max(Math.abs(x), Math.abs(z)) !== radius) continue;
                candidates.push({ x: candidate.x + x * GRID_STEP, z: candidate.z + z * GRID_STEP });
            }
        }
        const valid = candidates.filter((item) => (
            item.x >= BOUNDS.minX && item.x <= BOUNDS.maxX
            && item.z >= BOUNDS.minZ && item.z <= BOUNDS.maxZ
            && !isBlocked(item, obstacles)
        ));
        if (valid.length) {
            return valid.sort((first, second) => distance(first, candidate) - distance(second, candidate))[0];
        }
    }

    return candidate;
}

function reconstruct(cameFrom, current) {
    const path = [current];
    let currentKey = key(current.x, current.z);
    while (cameFrom.has(currentKey)) {
        const previous = cameFrom.get(currentKey);
        path.unshift(previous);
        currentKey = key(previous.x, previous.z);
    }
    return path;
}

export function findWalkablePath(start, target, objects = [], { floor = 1, ignoreObjectIds = [] } = {}) {
    const floorObjects = objects.filter((object) => {
        const floors = Array.isArray(object.floors) ? object.floors.map(Number) : [Number(object.floor || 1)];
        return floors.includes(Number(floor)) && OBSTACLE_TYPES.has(object.type) && !ignoreObjectIds.includes(object.id);
    });
    const obstacles = floorObjects;
    const startPoint = nearestWalkable(start, obstacles);
    const targetPoint = nearestWalkable(target, obstacles);
    const open = [startPoint];
    const openKeys = new Set([key(startPoint.x, startPoint.z)]);
    const cameFrom = new Map();
    const scores = new Map([[key(startPoint.x, startPoint.z), 0]]);
    const estimates = new Map([[key(startPoint.x, startPoint.z), distance(startPoint, targetPoint)]]);

    while (open.length) {
        open.sort((first, second) => estimates.get(key(first.x, first.z)) - estimates.get(key(second.x, second.z)));
        const current = open.shift();
        const currentKey = key(current.x, current.z);
        openKeys.delete(currentKey);
        if (current.x === targetPoint.x && current.z === targetPoint.z) {
            const floorY = Number(floor) === 2 ? FLOOR_HEIGHT : 0;
            const path = reconstruct(cameFrom, current).map((point) => [point.x, floorY, point.z]);
            path[path.length - 1] = [
                Number(target?.[0] || current.x),
                Number(target?.[1] ?? floorY),
                Number(target?.[2] || current.z),
            ];
            return path;
        }

        for (const neighbor of neighbors(current)) {
            if (isBlocked(neighbor, obstacles)) continue;
            const neighborKey = key(neighbor.x, neighbor.z);
            const tentative = (scores.get(currentKey) ?? Infinity) + 1;
            if (tentative >= (scores.get(neighborKey) ?? Infinity)) continue;
            cameFrom.set(neighborKey, current);
            scores.set(neighborKey, tentative);
            estimates.set(neighborKey, tentative + distance(neighbor, targetPoint));
            if (!openKeys.has(neighborKey)) {
                open.push(neighbor);
                openKeys.add(neighborKey);
            }
        }
    }

    return [];
}

export function buildObstacleAwarePath(sceneObjects = [], locatedProduct = null) {
    if (!locatedProduct) return [];
    const counter = sceneObjects.find((object) => object.type === 'counter-computer');
    const stairs = sceneObjects.find((object) => object.type === 'stairs');
    const shelf = sceneObjects.find((object) => object.id === locatedProduct.shelfObjectId)
        ?? sceneObjects.find((object) => object.type?.startsWith('shelf') && Number(object.shelfNumber) === Number(locatedProduct.shelfNumber));
    if (!counter || !shelf) return [];

    const target = locatedProduct.targetPosition || shelf.position;
    const targetFloor = Number(locatedProduct.floor || shelf.floor || 1) === 2 ? 2 : 1;
    const start = [counter.position[0], counter.position[1] + 1.25, counter.position[2]];
    const ignoreTarget = shelf.id ? [shelf.id] : [];

    if (targetFloor !== 2 || !stairs) {
        return findWalkablePath(start, target, sceneObjects, { floor: 1, ignoreObjectIds: ignoreTarget });
    }

    const bottomStair = [stairs.position[0], 1.05, stairs.position[2] + 2.2];
    const topStair = [stairs.position[0], FLOOR_HEIGHT + 0.95, stairs.position[2] - 2.2];
    const first = findWalkablePath(start, bottomStair, sceneObjects, { floor: 1, ignoreObjectIds: [stairs.id] });
    const second = findWalkablePath(topStair, target, sceneObjects, { floor: 2, ignoreObjectIds: ignoreTarget });
    if (!first.length || !second.length) return [start, bottomStair, topStair, target];
    return [...first, topStair, ...second.slice(1)];
}

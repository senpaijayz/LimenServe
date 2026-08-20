export const FLOOR_HEIGHT = 4.5;
export const LOCATOR_LAYOUT_NAME = 'main-store';
export const SNAP_STEP = 0.25;
export const STAIR_LAYOUT_ORIENTATION = 'l-turn-right';
export const SHELF_BIN_RANGE = {
    MIN: 2,
    MAX: 12,
};

export const LOCATOR_OBJECT_LIBRARY = [
    {
        type: 'floor',
        label: 'Floor',
        category: 'Structure',
        icon: 'Store',
        color: '#94a3b8',
        description: 'Two-level base plane',
    },
    {
        type: 'walls',
        label: 'Walls',
        category: 'Structure',
        icon: 'BrickWall',
        color: '#64748b',
        description: 'Store perimeter walls',
    },
    {
        type: 'shelf',
        label: 'Shelf',
        category: 'Storage',
        icon: 'Boxes',
        color: '#1d4ed8',
        description: 'Editable product rack (1–12 layers)',
    },
    {
        type: 'stairs',
        label: 'Stairs',
        category: 'Access',
        icon: 'Waypoints',
        color: '#a16207',
        description: 'L-shaped floor connector with a turning landing',
    },
    {
        type: 'counter-computer',
        label: 'Counter / Computer',
        category: 'Checkout',
        icon: 'Monitor',
        color: '#dc2626',
        description: 'Cashier start point',
    },
    {
        type: 'entrance-door',
        label: 'Entrance Door',
        category: 'Access',
        icon: 'DoorOpen',
        color: '#f59e0b',
        description: 'Customer entrance',
    },
    {
        type: 'parts-cabinet',
        label: 'Parts Cabinet',
        category: 'Storage',
        icon: 'Archive',
        color: '#7c3aed',
        description: 'Back-wall drawers for small parts',
    },
];

export const LOCATOR_SCENE_OBJECTS = [
    {
        id: 'floor-main',
        type: 'floor',
        name: 'Two-Floor Base',
        floor: 1,
        floors: [1, 2],
        isLocked: false,
        position: [0, 0, 0],
        dimensions: { width: 24, depth: 16, height: FLOOR_HEIGHT },
    },
    {
        id: 'walls-main',
        type: 'walls',
        name: 'Perimeter Walls',
        floor: 1,
        floors: [1, 2],
        isLocked: false,
        position: [0, 0, 0],
        dimensions: { width: 24, depth: 16, height: FLOOR_HEIGHT },
    },
    {
        id: 'shelf-2-a',
        type: 'shelf-2-layer',
        name: 'Aisle A 2-Layer Shelf',
        aisle: 'A',
        binCount: 8,
        floor: 1,
        isLocked: false,
        layerCount: 2,
        position: [-7.2, 0, -2.2],
        rotation: [0, 0, 0],
        shelfNumber: 1,
        dimensions: { width: 3.5, depth: 1.05, height: 1.55 },
    },
    {
        id: 'shelf-4-a',
        type: 'shelf-4-layer',
        name: 'Aisle B 4-Layer Shelf',
        aisle: 'B',
        binCount: 10,
        floor: 1,
        isLocked: false,
        layerCount: 4,
        position: [-2.8, 0, -2.2],
        rotation: [0, 0, 0],
        shelfNumber: 2,
        dimensions: { width: 4.2, depth: 1.05, height: 2.55 },
    },
    {
        id: 'shelf-4-c',
        type: 'shelf-4-layer',
        name: 'Aisle C 4-Layer Shelf',
        aisle: 'C',
        binCount: 10,
        floor: 1,
        isLocked: false,
        layerCount: 4,
        position: [2.2, 0, -2.2],
        rotation: [0, 0, 0],
        shelfNumber: 3,
        dimensions: { width: 4.2, depth: 1.05, height: 2.55 },
    },
    {
        id: 'shelf-2-c',
        type: 'shelf-2-layer',
        name: 'Aisle D 2-Layer Shelf',
        aisle: 'D',
        binCount: 8,
        floor: 1,
        isLocked: false,
        layerCount: 2,
        position: [6.9, 0, -2.2],
        rotation: [0, 0, 0],
        shelfNumber: 4,
        dimensions: { width: 3.5, depth: 1.05, height: 1.55 },
    },
    {
        id: 'stairs-a',
        type: 'stairs',
        name: 'Upper Floor Stairs',
        description: 'L-shaped access with a left-to-right lower flight and 90° landing',
        floor: 1,
        isLocked: false,
        layoutOrientation: STAIR_LAYOUT_ORIENTATION,
        position: [9.1, 0, 0.5],
        rotation: [0, 0, 0],
        dimensions: { width: 5.6, depth: 5.6, height: FLOOR_HEIGHT },
    },
    {
        id: 'shelf-4-b',
        type: 'shelf-4-layer',
        name: 'Aisle C 4-Layer Shelf',
        aisle: 'C',
        binCount: 10,
        floor: 2,
        isLocked: false,
        layerCount: 4,
        position: [-3.5, FLOOR_HEIGHT, -5.2],
        rotation: [0, 0, 0],
        shelfNumber: 3,
        dimensions: { width: 3.2, depth: 0.9, height: 2.35 },
    },
    {
        id: 'shelf-2-b',
        type: 'shelf-2-layer',
        name: 'Aisle D 2-Layer Shelf',
        aisle: 'D',
        binCount: 6,
        floor: 2,
        isLocked: false,
        layerCount: 2,
        position: [3.1, FLOOR_HEIGHT, -5.2],
        rotation: [0, Math.PI / 2, 0],
        shelfNumber: 4,
        dimensions: { width: 3.2, depth: 0.9, height: 1.35 },
    },
    {
        id: 'counter-computer-a',
        type: 'counter-computer',
        name: 'Cashier Counter',
        floor: 1,
        isLocked: false,
        position: [-6.4, 0, 5.6],
        rotation: [0, 0, 0],
        dimensions: { width: 3.4, depth: 1.35, height: 1.55 },
    },
    {
        id: 'entrance-door-a',
        type: 'entrance-door',
        name: 'Front Entrance',
        floor: 1,
        isLocked: false,
        position: [1.2, 0, 7.82],
        rotation: [0, 0, 0],
        dimensions: { width: 2.2, depth: 0.16, height: 2.45 },
    },
    {
        id: 'parts-cabinet-a',
        type: 'parts-cabinet',
        name: 'Back Wall Parts Cabinet',
        aisle: 'Back Wall',
        binCount: 12,
        floor: 1,
        isLocked: false,
        position: [9.1, 0, -5.9],
        rotation: [0, 0, 0],
        shelfNumber: 5,
        dimensions: { width: 3.2, depth: 0.9, height: 2.35 },
    },
];

export const WALL_OBJECT_TEMPLATE = {
    type: 'wall',
    name: 'Wall',
    isLocked: false,
    dimensions: { width: 3, depth: 0.18, height: 2.7 },
    rotation: [0, 0, 0],
};

export function getLocatorObjectSummary(objects = LOCATOR_SCENE_OBJECTS) {
    const floors = new Set();

    objects.forEach((object) => {
        if (Array.isArray(object.floors)) {
            object.floors.forEach((floor) => floors.add(floor));
            return;
        }

        floors.add(object.floor);
    });

    return {
        floors: floors.size,
        objects: objects.length,
        shelves: objects.filter((object) => object.type.includes('shelf')).length,
    };
}

export function getLocatorObjectById(id, objects = LOCATOR_SCENE_OBJECTS) {
    return objects.find((object) => object.id === id) ?? null;
}

export function isShelfObject(object) {
    return object?.type === 'shelf' || object?.type === 'shelf-2-layer' || object?.type === 'shelf-4-layer' || object?.type === 'parts-cabinet';
}

export function normalizeAisle(value) {
    return String(value || '').replace(/^aisle\s+/i, '').trim().toUpperCase();
}

export function cloneSceneObject(object) {
    return {
        ...object,
        dimensions: object.dimensions ? { ...object.dimensions } : undefined,
        floors: object.floors ? [...object.floors] : undefined,
        position: Array.isArray(object.position) ? [...object.position] : [0, 0, 0],
        rotation: object.rotation ? [...object.rotation] : [0, 0, 0],
    };
}

export function cloneLocatorSceneObjects() {
    return LOCATOR_SCENE_OBJECTS.map(cloneSceneObject);
}

function normalizeWallPoint(point, fallback = [0, 0, 0]) {
    return [
        Number(Number(point?.[0] ?? fallback[0]).toFixed(3)),
        Number(Number(point?.[1] ?? fallback[1]).toFixed(3)),
        Number(Number(point?.[2] ?? fallback[2]).toFixed(3)),
    ];
}

export function buildWallObjectFromEndpoints({
    end,
    floor = 1,
    id = `wall-${Date.now().toString(36)}`,
    name = 'Wall',
    start,
} = {}) {
    const safeFloor = Number(floor) === 2 ? 2 : 1;
    const floorY = safeFloor === 2 ? FLOOR_HEIGHT : 0;
    const wallStart = normalizeWallPoint(start, [-1.5, floorY, 0]);
    const wallEnd = normalizeWallPoint(end, [1.5, floorY, 0]);
    const deltaX = wallEnd[0] - wallStart[0];
    const deltaZ = wallEnd[2] - wallStart[2];
    const length = Math.max(0.25, Math.hypot(deltaX, deltaZ));

    return {
        ...cloneSceneObject(WALL_OBJECT_TEMPLATE),
        id,
        name,
        floor: safeFloor,
        position: [
            Number(((wallStart[0] + wallEnd[0]) / 2).toFixed(3)),
            floorY,
            Number(((wallStart[2] + wallEnd[2]) / 2).toFixed(3)),
        ],
        rotation: [0, Number(Math.atan2(-deltaZ, deltaX).toFixed(3)), 0],
        dimensions: { ...WALL_OBJECT_TEMPLATE.dimensions, width: Number(length.toFixed(3)) },
        wallStart,
        wallEnd,
    };
}

function getDefaultObjectName(object, count) {
    if (isShelfObject(object)) {
        const shelfNumber = count + 1;
        return `Aisle ${object.aisle || 'A'} Shelf ${shelfNumber}`;
    }

    return `${object.name || object.type} ${count + 1}`;
}

function getDefaultObjectPosition(object, activeFloor, count) {
    const floorY = Number(activeFloor) === 2 ? FLOOR_HEIGHT : 0;
    const offset = (count % 4) * 1.25;

    if (object.type === 'floor' || object.type === 'walls') {
        return [0, floorY, 0];
    }

    if (object.type === 'stairs') {
        return [4.6 + offset, 0, 1.8];
    }

    if (object.type === 'counter-computer') {
        return [-5.8 + offset, floorY, 4.6];
    }

    if (object.type === 'entrance-door') {
        return [1.2 + offset, floorY, 6.8];
    }

    if (object.type === 'parts-cabinet') {
        return [8.7, floorY, -5.9 + (count % 2) * 1.2];
    }

    if (object.type === 'wall') {
        return [-2 + offset, floorY, 2.5];
    }

    return [-2 + offset, floorY, -1.2];
}

export function createLocatorSceneObject(type, { activeFloor = 1, count = 0 } = {}) {
    if (type === 'wall') {
        const floor = Number(activeFloor) === 2 ? 2 : 1;
        const floorY = floor === 2 ? FLOOR_HEIGHT : 0;
        const startX = -2 + ((count % 4) * 1.25);
        return buildWallObjectFromEndpoints({
            floor,
            id: `wall-${Date.now().toString(36)}-${count + 1}`,
            name: `Wall ${count + 1}`,
            start: [startX, floorY, 2.5],
            end: [startX + 3, floorY, 2.5],
        });
    }

    // New shelves use the proven 4-layer dimensions as a starting point, while
    // retaining the generic type so the layer count can be edited in Design Mode.
    const source = type === 'shelf'
        ? LOCATOR_SCENE_OBJECTS.find((object) => object.type === 'shelf-4-layer')
        : LOCATOR_SCENE_OBJECTS.find((object) => object.type === type);
    const resolvedSource = source ?? LOCATOR_SCENE_OBJECTS[0];
    const object = cloneSceneObject(resolvedSource);
    const floor = Number(activeFloor) === 2 ? 2 : 1;
    const id = `${type}-${Date.now().toString(36)}-${count + 1}`;

    return {
        ...object,
        id,
        type: type === 'shelf' ? 'shelf' : object.type,
        floor: object.type === 'stairs' ? 1 : floor,
        floors: object.type === 'floor' || object.type === 'walls' ? [1, 2] : object.floors,
        isLocked: false,
        name: getDefaultObjectName(object, count),
        position: getDefaultObjectPosition(object, floor, count),
        rotation: object.rotation ?? [0, 0, 0],
    };
}

export function normalizeLayoutObjects(objects) {
    if (!Array.isArray(objects)) {
        return cloneLocatorSceneObjects();
    }

    return objects.map((object) => {
        if (object?.type === 'wall' && Array.isArray(object.wallStart) && Array.isArray(object.wallEnd)) {
            return {
                ...buildWallObjectFromEndpoints({
                    ...object,
                    end: object.wallEnd,
                    start: object.wallStart,
                }),
                isLocked: Boolean(object.isLocked),
            };
        }

        const normalized = cloneSceneObject(object);

        // Earlier layouts stored a single straight flight. Migrate them once
        // to a square footprint that can contain both L-shaped flights and
        // their turning landing.
        if (normalized.type === 'stairs' && normalized.layoutOrientation !== STAIR_LAYOUT_ORIENTATION) {
            normalized.dimensions = {
                ...normalized.dimensions,
                width: 5.6,
                depth: 5.6,
            };
            normalized.layoutOrientation = STAIR_LAYOUT_ORIENTATION;
        }

        return normalized;
    });
}

export function buildDefaultLayoutData() {
    return {
        layoutName: LOCATOR_LAYOUT_NAME,
        objects: cloneLocatorSceneObjects(),
        version: 1,
    };
}

export function formatProductLocationLabel(location) {
    if (!location) {
        return '';
    }

    return `Product located \u2192 Aisle ${normalizeAisle(location.aisle)} \u2022 Shelf ${location.shelfNumber} \u2022 Bin ${location.binNumber}`;
}

export function getShelfObjectByLocation(location, objects = LOCATOR_SCENE_OBJECTS) {
    if (!location) {
        return null;
    }

    const shelfObjectId = location.shelfObjectId || location.shelf_object_id;
    if (shelfObjectId) {
        const directMatch = objects.find((object) => object.id === shelfObjectId);
        if (directMatch) {
            return directMatch;
        }
    }

    const aisle = normalizeAisle(location.aisle);
    const shelfNumber = Number(location.shelfNumber ?? location.shelf_number);

    return objects.find((object) => (
        isShelfObject(object)
        && normalizeAisle(object.aisle) === aisle
        && Number(object.shelfNumber) === shelfNumber
    )) ?? null;
}

export function getCounterObject(objects = LOCATOR_SCENE_OBJECTS) {
    return objects.find((object) => object.type === 'counter-computer') ?? null;
}

export function getStairsObject(objects = LOCATOR_SCENE_OBJECTS) {
    return objects.find((object) => object.type === 'stairs') ?? null;
}

export function getStairLayoutMetrics(object) {
    const overallWidth = Math.max(5.6, Number(object?.dimensions?.width || 5.6));
    const overallDepth = Math.max(5.6, Number(object?.dimensions?.depth || 5.6));
    const flightWidth = Math.min(2.4, Math.max(1.8, Math.min(overallWidth, overallDepth) * 0.38));
    const firstRun = overallWidth - flightWidth;
    const secondRun = overallDepth - flightWidth;
    const landingX = (overallWidth / 2) - (flightWidth / 2);
    const landingZ = (-overallDepth / 2) + (flightWidth / 2);

    return {
        firstRun,
        flightWidth,
        landingX,
        landingZ,
        overallDepth,
        overallWidth,
        secondRun,
        secondStartZ: (-overallDepth / 2) + flightWidth,
    };
}

function roundPoint(value) {
    return Number(Number(value || 0).toFixed(3));
}

export function getShelfBinWorldPosition(shelf, binNumber = 1) {
    if (!shelf) {
        return [0, 0, 0];
    }

    const binCount = Math.max(1, Number(shelf.binCount || 1));
    const safeBin = Math.min(binCount, Math.max(1, Math.round(Number(binNumber) || 1)));
    const shelfWidth = Number(shelf.dimensions?.width || 3.2);
    const slotWidth = shelfWidth / binCount;
    const localX = (-shelfWidth / 2) + (slotWidth / 2) + ((safeBin - 1) * slotWidth);
    const localY = Math.min(Number(shelf.dimensions?.height || 1.4), 0.9);
    const localZ = -0.35;
    const angle = Number(shelf.rotation?.[1] || 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotatedX = (localX * cos) + (localZ * sin);
    const rotatedZ = (-localX * sin) + (localZ * cos);

    return [
        roundPoint((shelf.position?.[0] || 0) + rotatedX),
        roundPoint((shelf.position?.[1] || 0) + localY),
        roundPoint((shelf.position?.[2] || 0) + rotatedZ),
    ];
}

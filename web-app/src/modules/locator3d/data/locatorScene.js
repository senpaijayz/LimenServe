export const FLOOR_HEIGHT = 4.5;
export const LOCATOR_LAYOUT_NAME = 'main-store';
export const SNAP_STEP = 0.5;
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
        type: 'shelf-2-layer',
        label: '2-Layer Shelf',
        category: 'Storage',
        icon: 'Package',
        color: '#0f766e',
        description: 'Low product rack',
    },
    {
        type: 'shelf-4-layer',
        label: '4-Layer Shelf',
        category: 'Storage',
        icon: 'Boxes',
        color: '#1d4ed8',
        description: 'Tall product rack',
    },
    {
        type: 'stairs',
        label: 'Stairs',
        category: 'Access',
        icon: 'Waypoints',
        color: '#a16207',
        description: 'Floor connector',
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
        dimensions: { width: 18, depth: 14, height: FLOOR_HEIGHT },
    },
    {
        id: 'walls-main',
        type: 'walls',
        name: 'Perimeter Walls',
        floor: 1,
        floors: [1, 2],
        isLocked: false,
        position: [0, 0, 0],
        dimensions: { width: 18, depth: 14, height: FLOOR_HEIGHT },
    },
    {
        id: 'shelf-2-a',
        type: 'shelf-2-layer',
        name: 'Aisle A 2-Layer Shelf',
        aisle: 'A',
        binCount: 6,
        floor: 1,
        isLocked: false,
        layerCount: 2,
        position: [-4.8, 0, -1.6],
        rotation: [0, Math.PI / 2, 0],
        shelfNumber: 1,
        dimensions: { width: 3.2, depth: 0.9, height: 1.35 },
    },
    {
        id: 'shelf-4-a',
        type: 'shelf-4-layer',
        name: 'Aisle B 4-Layer Shelf',
        aisle: 'B',
        binCount: 8,
        floor: 1,
        isLocked: false,
        layerCount: 4,
        position: [-1.2, 0, -1.8],
        rotation: [0, Math.PI / 2, 0],
        shelfNumber: 2,
        dimensions: { width: 3.2, depth: 0.9, height: 2.35 },
    },
    {
        id: 'stairs-a',
        type: 'stairs',
        name: 'Upper Floor Stairs',
        floor: 1,
        isLocked: false,
        position: [5.5, 0, 1.6],
        rotation: [0, 0, 0],
        dimensions: { width: 2.3, depth: 5.4, height: FLOOR_HEIGHT },
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
        position: [2.1, FLOOR_HEIGHT, -4.8],
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
        position: [6.1, FLOOR_HEIGHT, -2.1],
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
        position: [-6.1, 0, 4.7],
        rotation: [0, -0.2, 0],
        dimensions: { width: 2.8, depth: 1.15, height: 1.45 },
    },
    {
        id: 'entrance-door-a',
        type: 'entrance-door',
        name: 'Front Entrance',
        floor: 1,
        isLocked: false,
        position: [1.3, 0, 7.08],
        rotation: [0, 0, 0],
        dimensions: { width: 1.7, depth: 0.16, height: 2.35 },
    },
];

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
    return object?.type === 'shelf-2-layer' || object?.type === 'shelf-4-layer';
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

function getDefaultObjectName(object, count) {
    if (object.type === 'shelf-2-layer' || object.type === 'shelf-4-layer') {
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

    return [-2 + offset, floorY, -1.2];
}

export function createLocatorSceneObject(type, { activeFloor = 1, count = 0 } = {}) {
    const source = LOCATOR_SCENE_OBJECTS.find((object) => object.type === type) ?? LOCATOR_SCENE_OBJECTS[0];
    const object = cloneSceneObject(source);
    const floor = Number(activeFloor) === 2 ? 2 : 1;
    const id = `${type}-${Date.now().toString(36)}-${count + 1}`;

    return {
        ...object,
        id,
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

    return objects.map(cloneSceneObject);
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

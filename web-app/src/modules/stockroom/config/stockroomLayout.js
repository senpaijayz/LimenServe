export const FLOOR_HEIGHT = 4.8;
export const STOCKROOM_LAYOUT_STORAGE_KEY = 'stockroom.layout.v3';

export const OBJECT_LIBRARY = {
    shelf: {
        label: '4-Layer Shelf',
        icon: 'SH4',
        size: [2.2, 3.4, 1],
    },
    shelf2: {
        label: '2-Layer Shelf',
        icon: 'SH2',
        size: [2.2, 2.3, 1],
    },
    counter: {
        label: 'Service Counter',
        icon: 'CTR',
        size: [3.4, 1.25, 1.3],
    },
    stairs: {
        label: 'Stairs',
        icon: 'STR',
        size: [2.8, 2.5, 3.6],
    },
    room: {
        label: 'Utility Room',
        icon: 'ROM',
        size: [4.4, 2.9, 3.6],
    },
    entrance: {
        label: 'Entrance',
        icon: 'ENT',
        size: [3.2, 3.2, 0.6],
    },
    wall: {
        label: 'Wall',
        icon: 'WAL',
        size: [6, 3.4, 0.3],
    },
    floor: {
        label: 'Floor Plate',
        icon: 'FLR',
        size: [10, 0.35, 10],
    },
    table: {
        label: 'Display Table',
        icon: 'TBL',
        size: [2.6, 0.95, 1.4],
    },
    signage: {
        label: 'Signage',
        icon: 'SIG',
        size: [1.2, 2.6, 0.25],
    },
    label: {
        label: 'Label Marker',
        icon: 'LBL',
        size: [0.7, 1.6, 0.7],
    },
};

const createObject = (object) => ({
    locked: false,
    rotation: 0,
    ...object,
});

export const createDefaultLayout = () => ({
    objects: [
        createObject({
            id: 'floor-1-main',
            type: 'floor',
            floor: 1,
            x: 0,
            z: 0,
            label: 'Ground Floor',
            size: [26, 0.35, 24],
            locked: true,
        }),
        createObject({
            id: 'floor-2-mezzanine',
            type: 'floor',
            floor: 2,
            x: 7,
            z: -1,
            label: 'Mezzanine',
            size: [11, 0.35, 15],
            locked: true,
        }),
        createObject({
            id: 'stairs-main',
            type: 'stairs',
            floor: 1,
            x: -8.5,
            z: 4.2,
            label: 'Stairs',
        }),
        createObject({
            id: 'room-service',
            type: 'room',
            floor: 1,
            x: -9.2,
            z: 7.2,
            label: 'Back Office',
        }),
        createObject({
            id: 'counter-front',
            type: 'counter',
            floor: 1,
            x: 8.4,
            z: 7.4,
            label: 'Receiving Desk',
        }),
        createObject({
            id: 'entrance-main',
            type: 'entrance',
            floor: 1,
            x: 0,
            z: 10.8,
            label: 'Main Entry',
            locked: true,
        }),
        createObject({
            id: 'table-display',
            type: 'table',
            floor: 1,
            x: 4.8,
            z: 2.4,
            label: 'Prep Table',
        }),
        createObject({
            id: 'signage-ground',
            type: 'signage',
            floor: 1,
            x: 8.4,
            z: -7.8,
            label: 'Ground Zone',
        }),
        createObject({
            id: 'signage-upper',
            type: 'signage',
            floor: 2,
            x: 11.1,
            z: 3.9,
            label: 'Upper Picks',
        }),
        createObject({
            id: 'marker-receiving',
            type: 'label',
            floor: 1,
            x: 10.4,
            z: 6.8,
            label: 'Receiving',
        }),
        createObject({
            id: 'wall-back',
            type: 'wall',
            floor: 1,
            x: 0,
            z: -9.4,
            label: 'Back Wall',
            size: [20, 3.4, 0.3],
            locked: true,
        }),
        createObject({
            id: 'wall-left',
            type: 'wall',
            floor: 1,
            x: -12,
            z: 0.4,
            rotation: Math.PI / 2,
            label: 'Left Wall',
            size: [18, 3.4, 0.3],
            locked: true,
        }),
        createObject({
            id: 'wall-right',
            type: 'wall',
            floor: 1,
            x: 12,
            z: 0.4,
            rotation: Math.PI / 2,
            label: 'Right Wall',
            size: [18, 3.4, 0.3],
            locked: true,
        }),
        createObject({
            id: 'wall-upper-back',
            type: 'wall',
            floor: 2,
            x: 7,
            z: -8.2,
            label: 'Upper Back Wall',
            size: [11, 3.2, 0.3],
            locked: true,
        }),
        createObject({
            id: 'shelf-a1',
            type: 'shelf',
            floor: 1,
            x: -6.2,
            z: -3.6,
            aisle: 'A',
            shelfNum: 1,
            label: 'A1',
        }),
        createObject({
            id: 'shelf-a2',
            type: 'shelf',
            floor: 1,
            x: -6.2,
            z: 0,
            aisle: 'A',
            shelfNum: 2,
            label: 'A2',
        }),
        createObject({
            id: 'shelf-a3',
            type: 'shelf',
            floor: 1,
            x: -6.2,
            z: 3.6,
            aisle: 'A',
            shelfNum: 3,
            label: 'A3',
        }),
        createObject({
            id: 'shelf-b1',
            type: 'shelf',
            floor: 1,
            x: -1.1,
            z: -3.6,
            aisle: 'B',
            shelfNum: 1,
            label: 'B1',
        }),
        createObject({
            id: 'shelf-b2',
            type: 'shelf',
            floor: 1,
            x: -1.1,
            z: 0,
            aisle: 'B',
            shelfNum: 2,
            label: 'B2',
        }),
        createObject({
            id: 'shelf-b3',
            type: 'shelf',
            floor: 1,
            x: -1.1,
            z: 3.6,
            aisle: 'B',
            shelfNum: 3,
            label: 'B3',
        }),
        createObject({
            id: 'shelf-c1',
            type: 'shelf',
            floor: 1,
            x: 4.4,
            z: -3.6,
            aisle: 'C',
            shelfNum: 1,
            label: 'C1',
        }),
        createObject({
            id: 'shelf-c2',
            type: 'shelf',
            floor: 1,
            x: 4.4,
            z: 0,
            aisle: 'C',
            shelfNum: 2,
            label: 'C2',
        }),
        createObject({
            id: 'shelf-d1',
            type: 'shelf',
            floor: 2,
            x: 5.2,
            z: -4.2,
            aisle: 'D',
            shelfNum: 1,
            label: 'D1',
        }),
        createObject({
            id: 'shelf-d2',
            type: 'shelf',
            floor: 2,
            x: 5.2,
            z: 0,
            aisle: 'D',
            shelfNum: 2,
            label: 'D2',
        }),
        createObject({
            id: 'shelf-e1',
            type: 'shelf2',
            floor: 2,
            x: 9.8,
            z: -2.2,
            aisle: 'E',
            shelfNum: 1,
            label: 'E1',
        }),
        createObject({
            id: 'marker-upper',
            type: 'label',
            floor: 2,
            x: 2.8,
            z: 3.4,
            label: 'Fast Picks',
        }),
    ],
});

export const getObjectSize = (object) => object.size || OBJECT_LIBRARY[object.type]?.size || [1.5, 1.5, 1.5];

export const getFloorBaseY = (floor) => (Number(floor || 1) - 1) * FLOOR_HEIGHT;

export const normalizeLayout = (layout) => {
    const defaults = createDefaultLayout();

    if (!layout || !Array.isArray(layout.objects)) {
        return defaults;
    }

    return {
        objects: layout.objects
            .filter((object) => OBJECT_LIBRARY[object.type])
            .map((object, index) => {
                const typeConfig = OBJECT_LIBRARY[object.type];
                return {
                    id: object.id || `${object.type}-${index + 1}`,
                    type: object.type,
                    floor: Number(object.floor || 1),
                    x: Number(object.x || 0),
                    z: Number(object.z || 0),
                    rotation: Number(object.rotation || 0),
                    label: object.label || typeConfig.label,
                    size: Array.isArray(object.size) ? object.size : typeConfig.size,
                    locked: Boolean(object.locked),
                    aisle: object.aisle ? String(object.aisle).toUpperCase() : undefined,
                    shelfNum: object.shelfNum ? Number(object.shelfNum) : undefined,
                };
            }),
    };
};

export const createSceneObject = (type, floor = 1, index = 0) => {
    const config = OBJECT_LIBRARY[type];

    if (!config) {
        return null;
    }

    const suffix = Date.now().toString(36);

    return {
        id: `${type}-${suffix}`,
        type,
        floor,
        x: floor === 2 ? 6 + (index % 2) * 2.8 : -2 + (index % 3) * 3.2,
        z: floor === 2 ? -2 + (index % 3) * 2.4 : -1 + (index % 2) * 3.4,
        rotation: 0,
        label: config.label,
        size: config.size,
        locked: false,
        ...(type === 'shelf' || type === 'shelf2'
            ? {
                aisle: floor === 2 ? 'E' : 'Z',
                shelfNum: index + 1,
                label: `${floor === 2 ? 'E' : 'Z'}${index + 1}`,
            }
            : {}),
    };
};

export const findMappedObject = (objects, location) => {
    if (!location) {
        return null;
    }

    const targetFloor = Number(location.floor || 1);
    const targetAisle = String(location.aisle || location.section || '').toUpperCase();
    const targetShelf = Number(location.shelf || 0);

    return (
        objects.find(
            (object) =>
                (object.type === 'shelf' || object.type === 'shelf2') &&
                Number(object.floor) === targetFloor &&
                String(object.aisle || '').toUpperCase() === targetAisle &&
                Number(object.shelfNum || 0) === targetShelf,
        ) || null
    );
};

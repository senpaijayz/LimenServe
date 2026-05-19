import { create } from 'zustand';
import {
    LOCATOR_OBJECT_LIBRARY,
    SHELF_BIN_RANGE,
    SNAP_STEP,
    cloneLocatorSceneObjects,
    createLocatorSceneObject,
    formatProductLocationLabel,
    getShelfBinWorldPosition,
    getShelfObjectByLocation,
    isShelfObject,
    normalizeLayoutObjects,
} from '../data/locatorScene';

function createInitialState() {
    const sceneObjects = cloneLocatorSceneObjects();

    return {
        activeFloor: 1,
        activeTool: 'select',
        cameraFocusRequest: null,
        cameraPresetRequest: null,
        isDesignMode: false,
        locatedProduct: null,
        objectLibrary: LOCATOR_OBJECT_LIBRARY,
        objects: sceneObjects,
        pathAnimationRequest: 0,
        productLocations: [],
        recentlyReceivedStock: {
            createdAt: null,
            items: [],
            receiptId: null,
            returnTo: '/inventory',
            source: null,
        },
        sceneObjects,
        selectedObjectId: null,
        selectedProductForLocation: null,
        showGrid: true,
        showLabels: true,
        showPaths: true,
    };
}

function clampNumber(value, min, max) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
        return min;
    }

    return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function snapToGrid(value) {
    const snapped = Math.round(Number(value) / SNAP_STEP) * SNAP_STEP;

    if (Object.is(snapped, -0)) {
        return 0;
    }

    return Number(snapped.toFixed(3));
}

function normalizeRotation(rotation = [0, 0, 0]) {
    return rotation.map((value) => Number(Number(value || 0).toFixed(3)));
}

function clampDimension(value, fallback = 1) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
        return fallback;
    }

    return Number(Math.min(40, Math.max(0.1, numberValue)).toFixed(3));
}

function withSceneObjects(set, updater) {
    set((state) => {
        const sceneObjects = updater(state.sceneObjects);

        return {
            objects: sceneObjects,
            sceneObjects,
        };
    });
}

const initialState = createInitialState();

export const useLocator3DStore = create((set, get) => ({
    ...initialState,
    addSceneObject: (type) => {
        if (!type) {
            return;
        }

        set((state) => {
            const count = state.sceneObjects.filter((object) => object.type === type).length;
            const object = createLocatorSceneObject(type, {
                activeFloor: state.activeFloor,
                count,
            });
            const sceneObjects = [...state.sceneObjects, object];

            return {
                objects: sceneObjects,
                sceneObjects,
                selectedObjectId: object.id,
            };
        });
    },
    centerCameraOnSelected: () => {
        const { selectedObjectId } = get();

        if (!selectedObjectId) {
            return;
        }

        set((state) => ({
            cameraFocusRequest: {
                objectId: selectedObjectId,
                sequence: (state.cameraFocusRequest?.sequence || 0) + 1,
            },
        }));
    },
    requestCameraPreset: (preset) => {
        const safePreset = ['counter', 'overview', 'selected', 'topDown'].includes(preset) ? preset : 'overview';

        set((state) => ({
            cameraPresetRequest: {
                preset: safePreset,
                sequence: (state.cameraPresetRequest?.sequence || 0) + 1,
            },
        }));
    },
    clearRecentlyReceivedStock: () => set({
        recentlyReceivedStock: {
            createdAt: null,
            items: [],
            receiptId: null,
            returnTo: '/inventory',
            source: null,
        },
    }),
    resetCamera: () => {
        get().requestCameraPreset('overview');
    },
    animatePathFromCounter: () => set((state) => ({
        pathAnimationRequest: state.pathAnimationRequest + 1,
    })),
    clearLocatedProduct: () => set({ cameraPresetRequest: null, locatedProduct: null, selectedProductForLocation: null }),
    clearSelection: () => set({ selectedObjectId: null }),
    deleteSelectedObject: () => {
        const { sceneObjects, selectedObjectId } = get();
        const selectedObject = sceneObjects.find((object) => object.id === selectedObjectId);

        if (!selectedObject || selectedObject.isLocked) {
            return;
        }

        const nextObjects = sceneObjects.filter((object) => object.id !== selectedObjectId);

        set({
            objects: nextObjects,
            sceneObjects: nextObjects,
            locatedProduct: null,
            selectedProductForLocation: null,
            selectedObjectId: null,
        });
    },
    forceSelectObject: (objectId) => set({ selectedObjectId: objectId }),
    goToFloor: (floor) => set({ activeFloor: floor === 2 ? 2 : 1 }),
    loadLayoutData: (layoutData) => {
        const sceneObjects = normalizeLayoutObjects(Array.isArray(layoutData) ? layoutData : layoutData?.objects);

        set({
            activeFloor: 1,
            cameraPresetRequest: null,
            objects: sceneObjects,
            sceneObjects,
            locatedProduct: null,
            selectedProductForLocation: null,
            selectedObjectId: null,
        });
    },
    lockAllObjects: () => {
        withSceneObjects(set, (sceneObjects) => sceneObjects.map((object) => ({ ...object, isLocked: true })));
    },
    locateProduct: (location) => {
        if (!location) {
            set({ locatedProduct: null });
            return;
        }

        const { sceneObjects } = get();
        const shelf = getShelfObjectByLocation(location, sceneObjects);
        const floor = Number(location.floor || shelf?.floor || 1) === 2 ? 2 : 1;
        const shelfObjectId = shelf?.id || location.shelfObjectId || '';
        const targetPosition = getShelfBinWorldPosition(shelf, location.binNumber);

        set({
            activeFloor: floor,
            cameraPresetRequest: null,
            locatedProduct: {
                ...location,
                binNumber: Number(location.binNumber),
                floor,
                locationLabel: formatProductLocationLabel(location),
                shelfNumber: Number(location.shelfNumber),
                shelfObjectId,
                targetPosition,
            },
            selectedObjectId: shelfObjectId || get().selectedObjectId,
        });
    },
    selectObject: (objectId) => {
        const object = get().sceneObjects.find((sceneObject) => sceneObject.id === objectId);

        if (!object || object.isLocked) {
            return;
        }

        set({ selectedObjectId: objectId });
    },
    resetToDefaultLayout: () => {
        const sceneObjects = cloneLocatorSceneObjects();

        set({
            activeFloor: 1,
            cameraPresetRequest: null,
            objects: sceneObjects,
            sceneObjects,
            locatedProduct: null,
            selectedProductForLocation: null,
            selectedObjectId: null,
        });
    },
    setActiveTool: (activeTool) => set({ activeTool }),
    setDesignMode: (isDesignMode) => set((state) => ({
        activeTool: isDesignMode && state.activeTool === 'select' ? 'move' : state.activeTool,
        isDesignMode,
    })),
    setProductLocations: (productLocations) => set({ productLocations: Array.isArray(productLocations) ? productLocations : [] }),
    setRecentlyReceivedStock: (receiptContext = {}) => {
        const items = Array.isArray(receiptContext.items)
            ? receiptContext.items
                .map((item) => ({
                    description: String(item.description || item.name || '').trim(),
                    partNumber: String(item.partNumber || item.sku || '').trim().toUpperCase(),
                    productId: String(item.productId || item.id || '').trim(),
                    quantity: Number(item.quantity || 0),
                }))
                .filter((item) => item.productId || item.partNumber)
            : [];

        set({
            recentlyReceivedStock: {
                createdAt: new Date().toISOString(),
                items,
                receiptId: receiptContext.receiptId || null,
                returnTo: receiptContext.returnTo || '/inventory',
                source: receiptContext.source || 'stock_receipt',
            },
        });
    },
    setSelectedProductForLocation: (product) => set({ selectedProductForLocation: product || null }),
    getRecentlyReceivedProduct: (productIdOrSku) => {
        const needle = String(productIdOrSku || '').trim().toUpperCase();
        if (!needle) {
            return null;
        }

        return get().recentlyReceivedStock.items.find((item) => (
            String(item.productId || '').toUpperCase() === needle
            || String(item.partNumber || '').toUpperCase() === needle
        )) ?? null;
    },
    isRecentlyReceivedProduct: (productIdOrSku) => Boolean(get().getRecentlyReceivedProduct(productIdOrSku)),
    toggleSceneOption: (option) => {
        if (!['showGrid', 'showLabels', 'showPaths'].includes(option)) {
            return;
        }

        set((state) => ({ [option]: !state[option] }));
    },
    toggleFloorFocus: () => set((state) => ({ activeFloor: state.activeFloor === 1 ? 2 : 1 })),
    toggleObjectLock: (objectId) => {
        const targetId = objectId ?? get().selectedObjectId;

        if (!targetId) {
            return;
        }

        withSceneObjects(set, (sceneObjects) => sceneObjects.map((object) => (
            object.id === targetId ? { ...object, isLocked: !object.isLocked } : object
        )));
    },
    unlockAllObjects: () => {
        withSceneObjects(set, (sceneObjects) => sceneObjects.map((object) => ({ ...object, isLocked: false })));
    },
    updateObjectTransform: (objectId, transform) => {
        if (!objectId || !transform) {
            return;
        }

        withSceneObjects(set, (sceneObjects) => sceneObjects.map((object) => {
            if (object.id !== objectId || object.isLocked) {
                return object;
            }

            return {
                ...object,
                position: Array.isArray(transform.position)
                    ? transform.position.map(snapToGrid)
                    : object.position,
                rotation: Array.isArray(transform.rotation)
                    ? normalizeRotation(transform.rotation)
                    : object.rotation,
            };
        }));
    },
    updateObjectDimensions: (objectId, dimensions) => {
        if (!objectId || !dimensions) {
            return;
        }

        withSceneObjects(set, (sceneObjects) => sceneObjects.map((object) => {
            if (object.id !== objectId || object.isLocked) {
                return object;
            }

            return {
                ...object,
                dimensions: {
                    width: dimensions.width === undefined ? object.dimensions.width : clampDimension(dimensions.width, object.dimensions.width),
                    height: dimensions.height === undefined ? object.dimensions.height : clampDimension(dimensions.height, object.dimensions.height),
                    depth: dimensions.depth === undefined ? object.dimensions.depth : clampDimension(dimensions.depth, object.dimensions.depth),
                },
            };
        }));
    },
    upsertProductLocation: (location) => {
        if (!location?.productId) {
            return;
        }

        set((state) => {
            const currentLocations = state.productLocations.filter((item) => item.productId !== location.productId);

            return {
                productLocations: [...currentLocations, location],
            };
        });
    },
    updateShelfProperties: (objectId, updates) => {
        if (!objectId || !updates) {
            return;
        }

        withSceneObjects(set, (sceneObjects) => sceneObjects.map((object) => {
            if (object.id !== objectId || !isShelfObject(object)) {
                return object;
            }

            const aisle = updates.aisle === undefined ? object.aisle : String(updates.aisle).trim();
            const shelfNumber = updates.shelfNumber === undefined
                ? object.shelfNumber
                : Math.max(1, Math.round(Number(updates.shelfNumber) || 1));
            const binCount = updates.binCount === undefined
                ? object.binCount
                : clampNumber(updates.binCount, SHELF_BIN_RANGE.MIN, SHELF_BIN_RANGE.MAX);
            const safeAisle = aisle || object.aisle || 'A';

            return {
                ...object,
                aisle: safeAisle,
                binCount,
                name: `Aisle ${safeAisle} Shelf ${shelfNumber}`,
                shelfNumber,
            };
        }));
    },
}));

export const resetLocator3DStore = () => {
    useLocator3DStore.setState(createInitialState());
};

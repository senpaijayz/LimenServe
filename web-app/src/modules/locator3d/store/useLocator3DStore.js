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
import { normalizeLocatorQualityPreference } from '../utils/qualityTier';
import { validateLayoutObjects } from '../utils/layoutValidation';

const AUTOSAVE_STORAGE_KEY = 'limen:locator3d:autosave:v1';
const MAX_HISTORY_ENTRIES = 50;

function cloneObjects(objects) {
    return objects.map((object) => ({
        ...object,
        dimensions: object.dimensions ? { ...object.dimensions } : undefined,
        floors: object.floors ? [...object.floors] : undefined,
        position: [...(object.position || [0, 0, 0])],
        rotation: [...(object.rotation || [0, 0, 0])],
    }));
}

function readAutosave() {
    try {
        if (typeof localStorage === 'undefined') {
            return null;
        }

        const parsed = JSON.parse(localStorage.getItem(AUTOSAVE_STORAGE_KEY) || 'null');
        return Array.isArray(parsed?.objects) ? parsed : null;
    } catch {
        return null;
    }
}

function writeAutosave(objects) {
    try {
        if (typeof localStorage === 'undefined') {
            return;
        }

        localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify({
            createdAt: new Date().toISOString(),
            objects: cloneObjects(objects),
        }));
    } catch {
        // Storage may be unavailable in private browsing or embedded contexts.
    }
}

function clearAutosaveStorage() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
        }
    } catch {
        // Ignore storage cleanup failures.
    }
}

function createInitialState() {
    const sceneObjects = cloneLocatorSceneObjects();

    return {
        activeFloor: 1,
        activeTool: 'select',
        autosaveAvailable: Boolean(readAutosave()),
        cameraFocusRequest: null,
        cameraPresetRequest: null,
        isDesignMode: false,
        locatedProduct: null,
        objectLibrary: LOCATOR_OBJECT_LIBRARY,
        objects: sceneObjects,
        pathAnimationRequest: 0,
        productLocations: [],
        qualityPreference: 'auto',
        recentlyReceivedStock: {
            createdAt: null,
            items: [],
            receiptId: null,
            returnTo: '/inventory',
            source: null,
        },
        sceneObjects,
        selectedObjectIds: [],
        selectedObjectId: null,
        selectedProductForLocation: null,
        showGrid: true,
        showLabels: true,
        showPaths: true,
        xrayMode: false,
        history: { future: [], past: [] },
        hasUnsavedChanges: false,
        layoutIssues: validateLayoutObjects(sceneObjects),
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
        const past = [...(state.history?.past || []), cloneObjects(state.sceneObjects)].slice(-MAX_HISTORY_ENTRIES);
        writeAutosave(sceneObjects);

        return {
            objects: sceneObjects,
            sceneObjects,
            history: { future: [], past },
            hasUnsavedChanges: true,
            autosaveAvailable: true,
            layoutIssues: validateLayoutObjects(sceneObjects),
        };
    });
}

const initialState = createInitialState();

export function getLocatorAutosave() {
    return readAutosave();
}

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
            const past = [...(state.history?.past || []), cloneObjects(state.sceneObjects)].slice(-MAX_HISTORY_ENTRIES);
            writeAutosave(sceneObjects);

            return {
                objects: sceneObjects,
                sceneObjects,
                history: { future: [], past },
                hasUnsavedChanges: true,
                autosaveAvailable: true,
                layoutIssues: validateLayoutObjects(sceneObjects),
                selectedObjectIds: [object.id],
                selectedObjectId: object.id,
            };
        });
    },
    alignSelectedObjects: (axis, mode = 'center') => {
        const { selectedObjectIds = [] } = get();
        if (selectedObjectIds.length < 2 || !['x', 'z'].includes(axis)) {
            return;
        }

        withSceneObjects(set, (objects) => {
            const selected = objects.filter((object) => selectedObjectIds.includes(object.id));
            const values = selected.map((object) => Number(object.position?.[axis === 'x' ? 0 : 2] || 0));
            const target = mode === 'min'
                ? Math.min(...values)
                : mode === 'max'
                    ? Math.max(...values)
                    : values.reduce((total, value) => total + value, 0) / values.length;

            return objects.map((object) => {
                if (!selectedObjectIds.includes(object.id) || object.isLocked) {
                    return object;
                }

                const position = [...object.position];
                position[axis === 'x' ? 0 : 2] = snapToGrid(target);
                return { ...object, position };
            });
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
    clearSelection: () => set({ selectedObjectIds: [], selectedObjectId: null }),
    clearAutosave: () => {
        clearAutosaveStorage();
        set({ autosaveAvailable: false });
    },
    discardAutosave: () => {
        clearAutosaveStorage();
        set({ autosaveAvailable: false });
    },
    duplicateSelectedObject: () => {
        const { sceneObjects, selectedObjectIds = [] } = get();
        const selected = sceneObjects.filter((object) => selectedObjectIds.includes(object.id) && !object.isLocked);
        if (!selected.length) {
            return;
        }

        const duplicates = selected.map((object, index) => ({
            ...cloneObjects([object])[0],
            id: `${object.type}-${Date.now().toString(36)}-copy-${index + 1}`,
            name: `${object.name || object.type} Copy`,
            position: [snapToGrid((object.position?.[0] || 0) + 1), object.position?.[1] || 0, snapToGrid((object.position?.[2] || 0) + 1)],
            isLocked: false,
        }));
        const nextObjects = [...sceneObjects, ...duplicates];
        const past = [...(get().history?.past || []), cloneObjects(sceneObjects)].slice(-MAX_HISTORY_ENTRIES);
        writeAutosave(nextObjects);
        set({
            objects: nextObjects,
            sceneObjects: nextObjects,
            history: { future: [], past },
            hasUnsavedChanges: true,
            autosaveAvailable: true,
            layoutIssues: validateLayoutObjects(nextObjects),
            selectedObjectIds: duplicates.map((object) => object.id),
            selectedObjectId: duplicates[0].id,
        });
    },
    markLayoutSaved: () => {
        clearAutosaveStorage();
        set({ autosaveAvailable: false, hasUnsavedChanges: false });
    },
    redo: () => {
        const { history, sceneObjects } = get();
        const nextObjects = history?.future?.[0];
        if (!nextObjects) {
            return;
        }

        const future = history.future.slice(1);
        const past = [...(history.past || []), cloneObjects(sceneObjects)].slice(-MAX_HISTORY_ENTRIES);
        const restored = cloneObjects(nextObjects);
        writeAutosave(restored);
        set({
            objects: restored,
            sceneObjects: restored,
            history: { future, past },
            hasUnsavedChanges: true,
            autosaveAvailable: true,
            layoutIssues: validateLayoutObjects(restored),
        });
    },
    recoverAutosave: () => {
        const autosave = readAutosave();
        if (!autosave) {
            return false;
        }

        const recovered = normalizeLayoutObjects(autosave.objects);
        set((state) => ({
            objects: recovered,
            sceneObjects: recovered,
            history: { future: [], past: [...(state.history?.past || []), cloneObjects(state.sceneObjects)].slice(-MAX_HISTORY_ENTRIES) },
            hasUnsavedChanges: true,
            autosaveAvailable: true,
            layoutIssues: validateLayoutObjects(recovered),
            selectedObjectIds: [],
            selectedObjectId: null,
        }));
        return true;
    },
    undo: () => {
        const { history, sceneObjects } = get();
        const previous = history?.past?.at(-1);
        if (!previous) {
            return;
        }

        const past = history.past.slice(0, -1);
        const restored = cloneObjects(previous);
        const future = [cloneObjects(sceneObjects), ...(history.future || [])].slice(0, MAX_HISTORY_ENTRIES);
        writeAutosave(restored);
        set({
            objects: restored,
            sceneObjects: restored,
            history: { future, past },
            hasUnsavedChanges: true,
            autosaveAvailable: true,
            layoutIssues: validateLayoutObjects(restored),
        });
    },
    deleteSelectedObject: () => {
        const { sceneObjects, selectedObjectId, selectedObjectIds = [] } = get();
        const ids = selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
        const selectedObject = sceneObjects.find((object) => ids.includes(object.id) && !object.isLocked);

        if (!selectedObject || selectedObject.isLocked) {
            return;
        }

        const nextObjects = sceneObjects.filter((object) => !ids.includes(object.id) || object.isLocked);
        const past = [...(get().history?.past || []), cloneObjects(sceneObjects)].slice(-MAX_HISTORY_ENTRIES);
        writeAutosave(nextObjects);

        set({
            objects: nextObjects,
            sceneObjects: nextObjects,
            history: { future: [], past },
            hasUnsavedChanges: true,
            autosaveAvailable: true,
            layoutIssues: validateLayoutObjects(nextObjects),
            locatedProduct: null,
            selectedProductForLocation: null,
            selectedObjectIds: [],
            selectedObjectId: null,
        });
    },
    forceSelectObject: (objectId) => set({ selectedObjectIds: objectId ? [objectId] : [], selectedObjectId: objectId }),
    goToFloor: (floor) => set({ activeFloor: floor === 2 ? 2 : 1 }),
    loadLayoutData: (layoutData) => {
        const sceneObjects = normalizeLayoutObjects(Array.isArray(layoutData) ? layoutData : layoutData?.objects);

        set({
            activeFloor: 1,
            cameraPresetRequest: null,
            objects: sceneObjects,
            sceneObjects,
            history: { future: [], past: [] },
            hasUnsavedChanges: false,
            autosaveAvailable: false,
            layoutIssues: validateLayoutObjects(sceneObjects),
            selectedObjectIds: [],
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
    selectObject: (objectId, { additive = false } = {}) => {
        const object = get().sceneObjects.find((sceneObject) => sceneObject.id === objectId);

        if (!object || object.isLocked) {
            return;
        }

        set((state) => {
            const currentIds = Array.isArray(state.selectedObjectIds) ? state.selectedObjectIds : [];
            const selectedObjectIds = additive
                ? currentIds.includes(objectId)
                    ? currentIds.filter((id) => id !== objectId)
                    : [...currentIds, objectId]
                : [objectId];

            return {
                selectedObjectIds,
                selectedObjectId: selectedObjectIds.at(-1) || null,
            };
        });
    },
    resetToDefaultLayout: () => {
        const sceneObjects = cloneLocatorSceneObjects();
        writeAutosave(sceneObjects);

        set({
            activeFloor: 1,
            cameraPresetRequest: null,
            objects: sceneObjects,
            sceneObjects,
            history: { future: [], past: [] },
            hasUnsavedChanges: true,
            autosaveAvailable: true,
            layoutIssues: validateLayoutObjects(sceneObjects),
            selectedObjectIds: [],
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
    setQualityPreference: (qualityPreference) => set({
        qualityPreference: normalizeLocatorQualityPreference(qualityPreference),
    }),
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
        if (!['showGrid', 'showLabels', 'showPaths', 'xrayMode'].includes(option)) {
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

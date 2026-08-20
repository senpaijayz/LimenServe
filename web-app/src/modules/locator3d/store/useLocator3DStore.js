import { create } from 'zustand';
import {
    LOCATOR_OBJECT_LIBRARY,
    FLOOR_HEIGHT,
    SHELF_BIN_RANGE,
    SNAP_STEP,
    buildWallObjectFromEndpoints,
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
        wallEnd: object.wallEnd ? [...object.wallEnd] : undefined,
        wallStart: object.wallStart ? [...object.wallStart] : undefined,
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
    const defaultLayoutObjects = cloneLocatorSceneObjects();
    const sceneObjects = cloneObjects(defaultLayoutObjects);

    return {
        activeFloor: 1,
        activeTool: 'select',
        autosaveAvailable: Boolean(readAutosave()),
        cameraFocusRequest: null,
        cameraPresetRequest: null,
        defaultLayoutObjects,
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
        savedLayoutObjects: cloneObjects(defaultLayoutObjects),
        selectedObjectIds: [],
        selectedObjectId: null,
        selectedProductForLocation: null,
        showGrid: true,
        snapEnabled: true,
        showLabels: true,
        showPaths: true,
        xrayMode: false,
        history: { future: [], past: [] },
        hasUnsavedChanges: false,
        layoutIssues: validateLayoutObjects(sceneObjects),
        activeInteraction: null,
        wallDraft: null,
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

function getLayoutFloorHeight(sceneObjects = []) {
    const floor = sceneObjects.find((object) => object.type === 'floor');
    const height = Number(floor?.dimensions?.height);
    return Number.isFinite(height) && height > 0 ? height : FLOOR_HEIGHT;
}

function sameObjects(first = [], second = []) {
    return JSON.stringify(first) === JSON.stringify(second);
}

function normalizeTransformForObject(object, transform, snapEnabled = true, floorHeight = FLOOR_HEIGHT) {
    const floorY = Number(object.floor) === 2 ? floorHeight : 0;
    const position = Array.isArray(transform.position)
        ? transform.position.map((value) => (snapEnabled ? snapToGrid(value) : Number(Number(value || 0).toFixed(3))))
        : object.position;

    if (Array.isArray(position) && !['floor', 'walls'].includes(object.type)) {
        position[1] = floorY;
    }

    const rotation = Array.isArray(transform.rotation)
        ? normalizeRotation(transform.rotation)
        : object.rotation;

    if (object.type === 'wall' && Array.isArray(object.wallStart) && Array.isArray(object.wallEnd)) {
        const previousYaw = Number(object.rotation?.[1] || 0);
        const nextYaw = Number(rotation?.[1] || previousYaw);
        const deltaYaw = nextYaw - previousYaw;
        const previousCenter = object.position || [0, floorY, 0];
        const nextCenter = position || previousCenter;
        const rotateEndpoint = (endpoint) => {
            const localX = Number(endpoint[0] || 0) - Number(previousCenter[0] || 0);
            const localZ = Number(endpoint[2] || 0) - Number(previousCenter[2] || 0);
            const cos = Math.cos(deltaYaw);
            const sin = Math.sin(deltaYaw);
            return [
                Number((Number(nextCenter[0] || 0) + (cos * localX) + (sin * localZ)).toFixed(3)),
                floorY,
                Number((Number(nextCenter[2] || 0) - (sin * localX) + (cos * localZ)).toFixed(3)),
            ];
        };

        return {
            ...buildWallObjectFromEndpoints({
                ...object,
                end: rotateEndpoint(object.wallEnd),
                start: rotateEndpoint(object.wallStart),
            }),
            isLocked: object.isLocked,
        };
    }

    return {
        ...object,
        position,
        rotation,
    };
}

function applyLayoutChange(state, sceneObjects, extras = {}) {
    const normalized = cloneObjects(sceneObjects);
    const past = [...(state.history?.past || []), cloneObjects(state.sceneObjects)].slice(-MAX_HISTORY_ENTRIES);
    writeAutosave(normalized);

    return {
        objects: normalized,
        sceneObjects: normalized,
        history: { future: [], past },
        hasUnsavedChanges: !sameObjects(normalized, state.savedLayoutObjects),
        autosaveAvailable: true,
        layoutIssues: validateLayoutObjects(normalized),
        ...extras,
    };
}

function withSceneObjects(set, updater) {
    set((state) => {
        const sceneObjects = updater(state.sceneObjects);
        return applyLayoutChange(state, sceneObjects);
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
            return applyLayoutChange(state, sceneObjects, {
                selectedObjectIds: [object.id],
                selectedObjectId: object.id,
            });
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
    markLayoutSaved: (objects = get().sceneObjects) => {
        const savedLayoutObjects = cloneObjects(objects);
        clearAutosaveStorage();
        set({ autosaveAvailable: false, hasUnsavedChanges: false, savedLayoutObjects });
    },
    discardUnsavedChanges: () => {
        const savedLayoutObjects = cloneObjects(get().savedLayoutObjects);
        clearAutosaveStorage();
        set({
            objects: savedLayoutObjects,
            sceneObjects: savedLayoutObjects,
            history: { future: [], past: [] },
            hasUnsavedChanges: false,
            autosaveAvailable: false,
            layoutIssues: validateLayoutObjects(savedLayoutObjects),
            selectedObjectIds: [],
            selectedObjectId: null,
            wallDraft: null,
        });
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
            savedLayoutObjects: cloneObjects(sceneObjects),
            history: { future: [], past: [] },
            hasUnsavedChanges: false,
            autosaveAvailable: false,
            layoutIssues: validateLayoutObjects(sceneObjects),
            selectedObjectIds: [],
            locatedProduct: null,
            selectedProductForLocation: null,
            selectedObjectId: null,
            wallDraft: null,
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
    selectObject: (objectId, { additive = false, allowLocked = false } = {}) => {
        const object = get().sceneObjects.find((sceneObject) => sceneObject.id === objectId);

        if (!object || (object.isLocked && !allowLocked)) {
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
        const sceneObjects = cloneObjects(get().defaultLayoutObjects);
        set((state) => ({
            activeFloor: 1,
            cameraPresetRequest: null,
            objects: sceneObjects,
            sceneObjects,
            history: { future: [], past: [...(state.history?.past || []), cloneObjects(state.sceneObjects)].slice(-MAX_HISTORY_ENTRIES) },
            hasUnsavedChanges: !sameObjects(sceneObjects, state.savedLayoutObjects),
            autosaveAvailable: true,
            layoutIssues: validateLayoutObjects(sceneObjects),
            selectedObjectIds: [],
            locatedProduct: null,
            selectedProductForLocation: null,
            selectedObjectId: null,
            wallDraft: null,
        }));
        writeAutosave(sceneObjects);
    },
    resetCurrentFloor: () => {
        set((state) => {
            const activeFloor = state.activeFloor;
            // Shared fixtures (for example the two-floor slab) intentionally stay
            // untouched. Resetting a floor only replaces its floor-specific objects.
            const retained = state.sceneObjects.filter((object) => (
                Number(object.floor) !== activeFloor || Array.isArray(object.floors)
            ));
            const resetFloorObjects = cloneObjects(state.defaultLayoutObjects.filter((object) => (
                Number(object.floor) === activeFloor && !Array.isArray(object.floors)
            )));
            const sceneObjects = [
                ...retained,
                ...resetFloorObjects,
            ];

            return applyLayoutChange(state, sceneObjects, {
                selectedObjectIds: [],
                selectedObjectId: null,
                wallDraft: null,
            });
        });
    },
    setActiveTool: (activeTool) => set((state) => ({
        activeTool: ['select', 'move', 'rotate', 'draw-wall'].includes(activeTool) ? activeTool : 'select',
        wallDraft: activeTool === 'draw-wall' ? state.wallDraft : null,
    })),
    setDesignMode: (isDesignMode) => set((state) => ({
        activeTool: isDesignMode && state.activeTool === 'select' ? 'move' : isDesignMode ? state.activeTool : 'select',
        isDesignMode,
        selectedObjectId: isDesignMode ? state.selectedObjectId : null,
        wallDraft: isDesignMode ? state.wallDraft : null,
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
        if (!['showGrid', 'showLabels', 'showPaths', 'xrayMode', 'snapEnabled'].includes(option)) {
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
    beginObjectTransform: (objectId) => {
        const object = get().sceneObjects.find((candidate) => candidate.id === objectId);
        if (!object || object.isLocked) {
            return;
        }
        set({ activeInteraction: { before: cloneObjects(get().sceneObjects), objectId } });
    },
    previewObjectTransform: (objectId, transform) => {
        if (!objectId || !transform) {
            return;
        }
        set((state) => {
            const sceneObjects = state.sceneObjects.map((object) => (
                object.id === objectId && !object.isLocked
                    ? normalizeTransformForObject(object, transform, state.snapEnabled, getLayoutFloorHeight(state.sceneObjects))
                    : object
            ));
            return {
                objects: sceneObjects,
                sceneObjects,
                layoutIssues: validateLayoutObjects(sceneObjects),
            };
        });
    },
    commitObjectTransform: (objectId) => {
        set((state) => {
            const before = state.activeInteraction?.objectId === objectId
                ? state.activeInteraction.before
                : cloneObjects(state.sceneObjects);
            if (sameObjects(before, state.sceneObjects)) {
                return { activeInteraction: null };
            }
            const normalized = cloneObjects(state.sceneObjects);
            writeAutosave(normalized);
            return {
                objects: normalized,
                sceneObjects: normalized,
                history: {
                    future: [],
                    past: [...(state.history?.past || []), cloneObjects(before)].slice(-MAX_HISTORY_ENTRIES),
                },
                hasUnsavedChanges: !sameObjects(normalized, state.savedLayoutObjects),
                autosaveAvailable: true,
                layoutIssues: validateLayoutObjects(normalized),
                activeInteraction: null,
            };
        });
    },
    updateObjectTransform: (objectId, transform) => {
        if (!objectId || !transform) {
            return;
        }

        withSceneObjects(set, (sceneObjects) => sceneObjects.map((object) => {
            if (object.id !== objectId || object.isLocked) {
                return object;
            }

            return normalizeTransformForObject(object, transform, get().snapEnabled, getLayoutFloorHeight(get().sceneObjects));
        }));
    },
    nudgeSelectedObjects: (direction, multiplier = 1) => {
        const delta = SNAP_STEP * (Number(multiplier) || 1);
        const offsets = {
            ArrowDown: [0, delta],
            ArrowLeft: [-delta, 0],
            ArrowRight: [delta, 0],
            ArrowUp: [0, -delta],
        };
        const [xOffset, zOffset] = offsets[direction] ?? [0, 0];
        const ids = get().selectedObjectIds;
        if (!ids?.length || (!xOffset && !zOffset)) {
            return;
        }
        withSceneObjects(set, (sceneObjects) => sceneObjects.map((object) => (
            ids.includes(object.id) && !object.isLocked
                ? normalizeTransformForObject(object, {
                    position: [object.position[0] + xOffset, object.position[1], object.position[2] + zOffset],
                    rotation: object.rotation,
                }, get().snapEnabled, getLayoutFloorHeight(get().sceneObjects))
                : object
        )));
    },
    rotateSelectedObject: (degrees = 15) => {
        const objectId = get().selectedObjectId;
        const object = get().sceneObjects.find((candidate) => candidate.id === objectId);
        if (!object || object.isLocked) {
            return;
        }
        get().updateObjectTransform(object.id, {
            position: object.position,
            rotation: [object.rotation?.[0] || 0, (object.rotation?.[1] || 0) + ((Number(degrees) * Math.PI) / 180), object.rotation?.[2] || 0],
        });
    },
    renameSelectedObject: (name) => {
        const objectId = get().selectedObjectId;
        const safeName = String(name || '').trim();
        if (!objectId || !safeName) {
            return;
        }
        withSceneObjects(set, (sceneObjects) => sceneObjects.map((object) => (
            object.id === objectId && !object.isLocked ? { ...object, name: safeName } : object
        )));
    },
    updateObjectDimensions: (objectId, dimensions) => {
        if (!objectId || !dimensions) {
            return;
        }

        withSceneObjects(set, (sceneObjects) => {
            const target = sceneObjects.find((object) => object.id === objectId);
            if (!target || target.isLocked) {
                return sceneObjects;
            }

            const nextDimensions = {
                width: dimensions.width === undefined ? target.dimensions.width : clampDimension(dimensions.width, target.dimensions.width),
                height: dimensions.height === undefined ? target.dimensions.height : clampDimension(dimensions.height, target.dimensions.height),
                depth: dimensions.depth === undefined ? target.dimensions.depth : clampDimension(dimensions.depth, target.dimensions.depth),
            };
            const floorHeightChanged = target.type === 'floor' && nextDimensions.height !== target.dimensions.height;

            return sceneObjects.map((object) => {
                if (object.id === objectId) {
                    return { ...object, dimensions: nextDimensions };
                }

                if (!floorHeightChanged) {
                    return object;
                }

                const isUpperFloorObject = Number(object.floor || 1) === 2;
                if (object.type === 'stairs') {
                    return { ...object, dimensions: { ...object.dimensions, height: nextDimensions.height } };
                }
                if (!isUpperFloorObject) {
                    return object;
                }

                const nextPosition = [object.position[0], nextDimensions.height, object.position[2]];
                if (object.type === 'wall' && Array.isArray(object.wallStart) && Array.isArray(object.wallEnd)) {
                    return {
                        ...object,
                        position: nextPosition,
                        wallStart: [object.wallStart[0], nextDimensions.height, object.wallStart[2]],
                        wallEnd: [object.wallEnd[0], nextDimensions.height, object.wallEnd[2]],
                    };
                }

                return { ...object, position: nextPosition };
            });
        });
    },
    previewObjectDimensions: (objectId, dimensions) => {
        if (!objectId || !dimensions) {
            return;
        }

        set((state) => {
            const sceneObjects = state.sceneObjects.map((object) => {
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
            });

            return {
                objects: sceneObjects,
                sceneObjects,
                layoutIssues: validateLayoutObjects(sceneObjects),
            };
        });
    },
    beginWallDrawing: (point) => {
        const floor = get().activeFloor;
        const floorY = floor === 2 ? getLayoutFloorHeight(get().sceneObjects) : 0;
        const start = Array.isArray(point)
            ? [snapToGrid(point[0]), floorY, snapToGrid(point[2])]
            : null;
        if (!start) {
            return;
        }
        set({ activeTool: 'draw-wall', wallDraft: { end: start, floor, start } });
    },
    previewWallDrawing: (point) => {
        if (!Array.isArray(point)) {
            return;
        }
        set((state) => {
            if (state.activeTool !== 'draw-wall' || !state.wallDraft?.start) {
                return {};
            }
            const floorY = state.wallDraft.floor === 2 ? getLayoutFloorHeight(state.sceneObjects) : 0;
            return {
                wallDraft: {
                    ...state.wallDraft,
                    end: [snapToGrid(point[0]), floorY, snapToGrid(point[2])],
                },
            };
        });
    },
    completeWallDrawing: (point) => {
        const state = get();
        if (state.activeTool !== 'draw-wall' || !state.wallDraft?.start || !Array.isArray(point)) {
            return;
        }
        const floorY = state.wallDraft.floor === 2 ? getLayoutFloorHeight(state.sceneObjects) : 0;
        const end = [snapToGrid(point[0]), floorY, snapToGrid(point[2])];
        const length = Math.hypot(end[0] - state.wallDraft.start[0], end[2] - state.wallDraft.start[2]);
        if (length < SNAP_STEP) {
            return;
        }
        const count = state.sceneObjects.filter((object) => object.type === 'wall').length;
        const wall = buildWallObjectFromEndpoints({
            end,
            floor: state.wallDraft.floor,
            id: `wall-${Date.now().toString(36)}-${count + 1}`,
            name: `Wall ${count + 1}`,
            start: state.wallDraft.start,
        });
        set((current) => applyLayoutChange(current, [...current.sceneObjects, wall], {
            selectedObjectIds: [wall.id],
            selectedObjectId: wall.id,
            wallDraft: { end, floor: current.wallDraft.floor, start: end },
        }));
    },
    cancelWallDrawing: () => set((state) => ({
        activeTool: state.activeTool === 'draw-wall' ? 'move' : state.activeTool,
        wallDraft: null,
    })),
    updateWallEndpoint: (objectId, endpoint, point) => {
        if (!objectId || !['start', 'end'].includes(endpoint) || !Array.isArray(point)) {
            return;
        }
        withSceneObjects(set, (sceneObjects) => sceneObjects.map((object) => {
            if (object.id !== objectId || object.type !== 'wall' || object.isLocked) {
                return object;
            }
            const floorY = object.floor === 2 ? getLayoutFloorHeight(get().sceneObjects) : 0;
            const start = endpoint === 'start'
                ? [snapToGrid(point[0]), floorY, snapToGrid(point[2])]
                : object.wallStart;
            const end = endpoint === 'end'
                ? [snapToGrid(point[0]), floorY, snapToGrid(point[2])]
                : object.wallEnd;
            return {
                ...buildWallObjectFromEndpoints({ ...object, end, start }),
                isLocked: object.isLocked,
            };
        }));
    },
    previewWallEndpoint: (objectId, endpoint, point) => {
        if (!objectId || !['start', 'end'].includes(endpoint) || !Array.isArray(point)) {
            return;
        }

        set((state) => {
            const sceneObjects = state.sceneObjects.map((object) => {
                if (object.id !== objectId || object.type !== 'wall' || object.isLocked) {
                    return object;
                }
                const floorY = object.floor === 2 ? getLayoutFloorHeight(state.sceneObjects) : 0;
                const start = endpoint === 'start'
                    ? [snapToGrid(point[0]), floorY, snapToGrid(point[2])]
                    : object.wallStart;
                const end = endpoint === 'end'
                    ? [snapToGrid(point[0]), floorY, snapToGrid(point[2])]
                    : object.wallEnd;
                return {
                    ...buildWallObjectFromEndpoints({ ...object, end, start }),
                    isLocked: object.isLocked,
                };
            });

            return {
                objects: sceneObjects,
                sceneObjects,
                layoutIssues: validateLayoutObjects(sceneObjects),
            };
        });
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
            const layerCount = updates.layerCount === undefined
                ? Math.max(1, Math.round(Number(object.layerCount || (object.type === 'shelf-4-layer' ? 4 : 2))))
                : clampNumber(updates.layerCount, 1, 12);
            const safeAisle = aisle || object.aisle || 'A';
            const safeName = updates.name === undefined
                ? (updates.aisle !== undefined || updates.shelfNumber !== undefined
                    ? `Aisle ${safeAisle} Shelf ${shelfNumber}`
                    : object.name)
                : String(updates.name || '').trim();
            const safeDescription = updates.description === undefined
                ? object.description || ''
                : String(updates.description || '').trim();

            return {
                ...object,
                aisle: safeAisle,
                binCount,
                description: safeDescription,
                layerCount,
                name: safeName || `Aisle ${safeAisle} Shelf ${shelfNumber}`,
                shelfNumber,
            };
        }));
    },
}));

export const resetLocator3DStore = () => {
    useLocator3DStore.setState(createInitialState());
};

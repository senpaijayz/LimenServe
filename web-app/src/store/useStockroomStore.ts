import { create } from 'zustand';
import {
  createStockroomLayout,
  createStockroomShelf,
  deleteStockroomItemLocation,
  deleteStockroomShelf,
  getStockroomBootstrap,
  getStockroomItemDetails,
  getStockroomLayouts,
  getStockroomMasterItems,
  publishStockroomLayout,
  searchStockroomItems,
  updateStockroomItemLocation,
  updateStockroomLayout,
  updateStockroomMasterItem,
  updateStockroomShelf,
  updateStockroomZone,
} from '../services/stockroomApi';
import type {
  SceneEntity,
  SceneEntityPatch,
  SceneLayoutMetadata,
  SceneMetadataObject,
  StockroomBootstrap,
  StockroomItemDetails,
  StockroomLayoutSummary,
  StockroomMasterItem,
  StockroomSearchResult,
} from '../modules/stockroom/types';
import {
  addMetadataObject,
  buildLayoutPayload,
  buildShelfPayload,
  buildZonePayload,
  createMetadataObject,
  extractSceneMetadata,
  getFloorByNumber,
  removeMetadataObject,
  resolveShelfAssociations,
  snapPosition,
  snapRotation,
  updateMetadataObject,
} from '../modules/stockroom/utils/sceneModel';

type ViewMode = '3d' | '2d';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface StockroomState {
  bootstrap: StockroomBootstrap | null;
  loadingBootstrap: boolean;
  bootstrapError: string;
  currentFloor: number;
  viewMode: ViewMode;
  searchQuery: string;
  searchResults: StockroomSearchResult[];
  searching: boolean;
  searchError: string;
  selectedProductId: string | null;
  selectedItemDetails: StockroomItemDetails | null;
  loadingItemDetails: boolean;
  itemDetailsError: string;
  layouts: StockroomLayoutSummary[];
  loadingLayouts: boolean;
  layoutsError: string;
  selectedLayoutId: string | null;
  masterItems: StockroomMasterItem[];
  loadingMasterItems: boolean;
  masterItemsError: string;
  masterSearchQuery: string;
  selectedMasterItemId: string | null;
  sceneMetadataDraft: SceneLayoutMetadata | null;
  sceneSaveStatus: SaveStatus;
  sceneSaveError: string;
  entityOverrides: Record<string, SceneEntityPatch>;
  selectedEntityKey: string | null;
  adminBusy: boolean;
  adminError: string;
}

interface StockroomActions {
  setCurrentFloor: (floorNumber: number) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  setMasterSearchQuery: (query: string) => void;
  setSelectedEntityKey: (entityKey: string | null) => void;
  selectMasterItem: (productId: string | null) => void;
  clearSelectedItem: () => void;
  loadBootstrap: (options?: { layoutId?: string | null; preserveFloor?: boolean }) => Promise<StockroomBootstrap>;
  searchItems: (query: string) => Promise<StockroomSearchResult[]>;
  loadItemDetails: (productId: string, options?: { focusTargetFloor?: boolean }) => Promise<StockroomItemDetails>;
  loadLayouts: () => Promise<StockroomLayoutSummary[]>;
  loadMasterItems: (query?: string) => Promise<StockroomMasterItem[]>;
  selectLayout: (layoutId: string) => Promise<void>;
  createLayoutDraft: (name: string) => Promise<StockroomLayoutSummary>;
  publishSelectedLayout: (layoutId?: string | null) => Promise<StockroomLayoutSummary>;
  resetSceneDraft: () => void;
  saveSceneMetadataNow: () => Promise<void>;
  scheduleSceneMetadataSave: () => void;
  addSceneObject: (kind: SceneMetadataObject['kind'], options?: Partial<SceneMetadataObject>) => Promise<void>;
  updateMetadataEntity: (entityKey: string, patch: SceneEntityPatch, options?: { autosave?: boolean }) => void;
  previewEntity: (entityKey: string, patch: SceneEntityPatch) => void;
  clearEntityPreview: (entityKey?: string | null) => void;
  rotateEntity: (entityKey: string, delta: number, baseRotation?: number, options?: { autosave?: boolean }) => void;
  removeSceneObject: (entityKey: string) => Promise<void>;
  commitSceneEntity: (entity: SceneEntity) => Promise<void>;
  createShelfTemplate: (variant: '2-bay' | '3-bay') => Promise<void>;
  deleteShelfEntity: (shelfId: string) => Promise<void>;
  saveMasterPlacement: (productId: string, payload: Record<string, unknown>) => Promise<void>;
  deleteMasterPlacement: (productId: string) => Promise<void>;
}

type StockroomStore = StockroomState & StockroomActions;

let metadataSaveTimer: number | null = null;

function setAdminFailure(set: (partial: Partial<StockroomStore>) => void, message: string) {
  set({ adminBusy: false, adminError: message });
}

function clearMetadataSaveTimer() {
  if (metadataSaveTimer) {
    window.clearTimeout(metadataSaveTimer);
    metadataSaveTimer = null;
  }
}

const useStockroomStore = create<StockroomStore>((set, get) => ({
  bootstrap: null,
  loadingBootstrap: false,
  bootstrapError: '',
  currentFloor: 1,
  viewMode: '3d',
  searchQuery: '',
  searchResults: [],
  searching: false,
  searchError: '',
  selectedProductId: null,
  selectedItemDetails: null,
  loadingItemDetails: false,
  itemDetailsError: '',
  layouts: [],
  loadingLayouts: false,
  layoutsError: '',
  selectedLayoutId: null,
  masterItems: [],
  loadingMasterItems: false,
  masterItemsError: '',
  masterSearchQuery: '',
  selectedMasterItemId: null,
  sceneMetadataDraft: null,
  sceneSaveStatus: 'idle',
  sceneSaveError: '',
  entityOverrides: {},
  selectedEntityKey: null,
  adminBusy: false,
  adminError: '',

  setCurrentFloor: (currentFloor) => set((state) => {
    const availableFloors = state.bootstrap?.floors.map((floor) => floor.floorNumber) ?? [];
    const resolvedFloor = availableFloors.includes(currentFloor)
      ? currentFloor
      : (availableFloors[0] ?? currentFloor);

    return { currentFloor: resolvedFloor };
  }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setMasterSearchQuery: (masterSearchQuery) => set({ masterSearchQuery }),
  setSelectedEntityKey: (selectedEntityKey) => set({ selectedEntityKey }),
  selectMasterItem: (selectedMasterItemId) => set({ selectedMasterItemId }),
  clearSelectedItem: () => set({
    selectedProductId: null,
    selectedItemDetails: null,
    itemDetailsError: '',
  }),

  async loadBootstrap(options = {}) {
    const { layoutId = null, preserveFloor = false } = options;
    set({ loadingBootstrap: true, bootstrapError: '' });

    try {
      const bootstrap = await getStockroomBootstrap(layoutId);
      const availableFloors = bootstrap?.floors?.map((floor) => floor.floorNumber) ?? [];
      const nextFloor = preserveFloor && availableFloors.includes(get().currentFloor)
        ? get().currentFloor
        : Number(bootstrap?.floors?.[0]?.floorNumber ?? 1);
      const sceneMetadataDraft = extractSceneMetadata(bootstrap.activeLayout, bootstrap);

      set({
        bootstrap,
        loadingBootstrap: false,
        currentFloor: nextFloor,
        selectedLayoutId: layoutId ?? bootstrap.activeLayout?.id ?? null,
        sceneMetadataDraft,
        entityOverrides: {},
        sceneSaveStatus: 'idle',
        sceneSaveError: '',
      });

      return bootstrap;
    } catch (error) {
      set({
        loadingBootstrap: false,
        bootstrapError: error instanceof Error ? error.message : 'Failed to load stockroom bootstrap data.',
      });
      throw error;
    }
  },

  async searchItems(query) {
    const trimmedQuery = String(query || '').trim();
    set({ searchQuery: query, searchError: '' });

    if (!trimmedQuery) {
      set({ searchResults: [], searching: false });
      return [];
    }

    set({ searching: true });
    try {
      const searchResults = await searchStockroomItems(trimmedQuery);
      set({ searchResults, searching: false });
      return searchResults;
    } catch (error) {
      set({
        searching: false,
        searchError: error instanceof Error ? error.message : 'Failed to search the stockroom.',
      });
      throw error;
    }
  },

  async loadItemDetails(productId, options = {}) {
    const { focusTargetFloor = true } = options;
    const currentFloor = get().currentFloor;
    set({
      selectedProductId: productId,
      loadingItemDetails: true,
      itemDetailsError: '',
    });

    try {
      const selectedItemDetails = await getStockroomItemDetails(productId, currentFloor);
      set({
        selectedItemDetails,
        loadingItemDetails: false,
        currentFloor: focusTargetFloor ? selectedItemDetails.targetFloor : currentFloor,
      });
      return selectedItemDetails;
    } catch (error) {
      set({
        loadingItemDetails: false,
        itemDetailsError: error instanceof Error ? error.message : 'Failed to load item details.',
      });
      throw error;
    }
  },

  async loadLayouts() {
    set({ loadingLayouts: true, layoutsError: '' });
    try {
      const layouts = await getStockroomLayouts();
      set({ layouts, loadingLayouts: false });
      return layouts;
    } catch (error) {
      set({
        loadingLayouts: false,
        layoutsError: error instanceof Error ? error.message : 'Failed to load layout versions.',
      });
      throw error;
    }
  },

  async loadMasterItems(query = '') {
    const layoutId = get().selectedLayoutId;
    set({ loadingMasterItems: true, masterItemsError: '' });
    try {
      const masterItems = await getStockroomMasterItems(layoutId ? { q: query, layoutId } : { q: query });
      set({ masterItems, loadingMasterItems: false });
      return masterItems;
    } catch (error) {
      set({
        loadingMasterItems: false,
        masterItemsError: error instanceof Error ? error.message : 'Failed to load stockroom item master data.',
      });
      throw error;
    }
  },

  async selectLayout(layoutId) {
    set({ selectedLayoutId: layoutId, selectedEntityKey: null, selectedMasterItemId: null });
    await Promise.all([
      get().loadBootstrap({ layoutId }),
      get().loadMasterItems(get().masterSearchQuery),
      get().loadLayouts(),
    ]);
  },

  async createLayoutDraft(name) {
    set({ adminBusy: true, adminError: '' });
    try {
      const selectedLayoutId = get().selectedLayoutId;
      const layout = await createStockroomLayout({
        name,
        sourceLayoutId: selectedLayoutId,
      });
      set({ adminBusy: false, selectedLayoutId: layout.id });
      await Promise.all([
        get().loadLayouts(),
        get().loadBootstrap({ layoutId: layout.id }),
      ]);
      return layout;
    } catch (error) {
      setAdminFailure(set, error instanceof Error ? error.message : 'Failed to create a new layout draft.');
      throw error;
    }
  },

  async publishSelectedLayout(layoutId) {
    const resolvedLayoutId = layoutId ?? get().selectedLayoutId;
    if (!resolvedLayoutId) {
      throw new Error('Select a layout before publishing.');
    }

    set({ adminBusy: true, adminError: '' });
    try {
      const layout = await publishStockroomLayout(resolvedLayoutId);
      set({ adminBusy: false });
      await Promise.all([
        get().loadLayouts(),
        get().loadBootstrap({ layoutId: resolvedLayoutId, preserveFloor: true }),
      ]);
      return layout;
    } catch (error) {
      setAdminFailure(set, error instanceof Error ? error.message : 'Failed to publish the layout.');
      throw error;
    }
  },

  resetSceneDraft() {
    const bootstrap = get().bootstrap;
    if (!bootstrap) {
      return;
    }

    set({
      sceneMetadataDraft: extractSceneMetadata(bootstrap.activeLayout, bootstrap),
      entityOverrides: {},
      sceneSaveStatus: 'idle',
      sceneSaveError: '',
      selectedEntityKey: null,
    });
  },

  async saveSceneMetadataNow() {
    const bootstrap = get().bootstrap;
    const metadata = get().sceneMetadataDraft;
    if (!bootstrap?.activeLayout || !metadata) {
      return;
    }

    clearMetadataSaveTimer();

    set({ sceneSaveStatus: 'saving', sceneSaveError: '' });

    try {
      const layout = await updateStockroomLayout(bootstrap.activeLayout.id, buildLayoutPayload(bootstrap.activeLayout, metadata));
      set((state) => ({
        bootstrap: state.bootstrap ? { ...state.bootstrap, activeLayout: layout } : state.bootstrap,
        sceneMetadataDraft: state.bootstrap ? extractSceneMetadata(layout, { ...state.bootstrap, activeLayout: layout }) : state.sceneMetadataDraft,
        sceneSaveStatus: 'saved',
      }));
    } catch (error) {
      set({
        sceneSaveStatus: 'error',
        sceneSaveError: error instanceof Error ? error.message : 'Failed to save scene metadata.',
      });
      throw error;
    }
  },

  scheduleSceneMetadataSave() {
    clearMetadataSaveTimer();

    metadataSaveTimer = window.setTimeout(() => {
      void get().saveSceneMetadataNow();
    }, 650);
  },

  async addSceneObject(kind, options = {}) {
    if (kind === 'shelf') {
      const variant = options.style?.variant === '3-bay' ? '3-bay' : '2-bay';
      await get().createShelfTemplate(variant);
      return;
    }

    const bootstrap = get().bootstrap;
    const metadata = get().sceneMetadataDraft;
    const floorNumber = options.floorNumber ?? get().currentFloor;

    if (!bootstrap || !metadata) {
      return;
    }

    const sceneObject = createMetadataObject(kind, floorNumber, bootstrap, metadata, options);
    set({
      sceneMetadataDraft: addMetadataObject(metadata, sceneObject),
      selectedEntityKey: `${sceneObject.kind}:${sceneObject.id}`,
      sceneSaveStatus: 'idle',
    });
    get().scheduleSceneMetadataSave();
  },

  updateMetadataEntity(entityKey, patch, options = {}) {
    const metadata = get().sceneMetadataDraft;
    if (!metadata) {
      return;
    }

    set({
      sceneMetadataDraft: updateMetadataObject(metadata, entityKey, patch),
      sceneSaveStatus: 'idle',
    });

    if (options.autosave !== false) {
      get().scheduleSceneMetadataSave();
    }
  },

  previewEntity(entityKey, patch) {
    set((state) => ({
      entityOverrides: {
        ...state.entityOverrides,
        [entityKey]: {
          ...(state.entityOverrides[entityKey] ?? {}),
          ...patch,
        },
      },
    }));
  },

  clearEntityPreview(entityKey) {
    if (!entityKey) {
      set({ entityOverrides: {} });
      return;
    }

    set((state) => {
      const nextOverrides = { ...state.entityOverrides };
      delete nextOverrides[entityKey];
      return { entityOverrides: nextOverrides };
    });
  },

  rotateEntity(entityKey, delta, baseRotation = 0, options = {}) {
    const bootstrap = get().bootstrap;
    const metadata = get().sceneMetadataDraft;
    const override = get().entityOverrides[entityKey];
    const sceneRotation = snapRotation(Number(override?.rotation ?? baseRotation) + delta);

    if (metadata?.sceneObjects.some((object) => `${object.kind}:${object.id}` === entityKey)) {
      get().updateMetadataEntity(entityKey, { rotation: sceneRotation }, options);
      return;
    }

    if (!bootstrap) {
      return;
    }

    get().previewEntity(entityKey, { rotation: sceneRotation });
  },

  async removeSceneObject(entityKey) {
    const bootstrap = get().bootstrap;
    const metadata = get().sceneMetadataDraft;

    if (!bootstrap || !metadata) {
      return;
    }

    const canonicalShelf = bootstrap.shelves.find((shelf) => `shelf:${shelf.id}` === entityKey);
    if (canonicalShelf) {
      await get().deleteShelfEntity(canonicalShelf.id);
      return;
    }

    if (entityKey.startsWith('stairs:')) {
      throw new Error('The linked staircase cannot be removed.');
    }

    set({
      sceneMetadataDraft: removeMetadataObject(metadata, entityKey),
      selectedEntityKey: null,
    });
    await get().saveSceneMetadataNow();
  },

  async commitSceneEntity(entity) {
    const bootstrap = get().bootstrap;
    if (!bootstrap) {
      return;
    }

    if (entity.source === 'metadata') {
      const snappedPosition = snapPosition(entity.position, get().sceneMetadataDraft?.snapGrid);
      get().updateMetadataEntity(entity.entityKey, {
        position: snappedPosition,
        rotation: snapRotation(entity.rotation),
        size: entity.size,
        label: entity.label,
        floorNumber: entity.floorNumber,
        style: entity.style,
      }, { autosave: false });
      set((state) => ({
        entityOverrides: {
          ...state.entityOverrides,
          [entity.entityKey]: {},
        },
      }));
      await get().saveSceneMetadataNow();
      get().clearEntityPreview(entity.entityKey);
      return;
    }

    if (entity.kind === 'shelf') {
      const shelf = bootstrap.shelves.find((candidate) => candidate.id === entity.id);
      if (!shelf) {
        return;
      }

      set({ adminBusy: true, adminError: '' });
      try {
        await updateStockroomShelf(shelf.id, buildShelfPayload(bootstrap, shelf, {
          ...entity,
          position: snapPosition(entity.position, get().sceneMetadataDraft?.snapGrid),
          rotation: snapRotation(entity.rotation),
        }));
        set({ adminBusy: false });
        get().clearEntityPreview(entity.entityKey);
        await get().loadBootstrap({ layoutId: get().selectedLayoutId, preserveFloor: true });
      } catch (error) {
        setAdminFailure(set, error instanceof Error ? error.message : 'Failed to update shelf.');
        throw error;
      }
      return;
    }

    if (entity.kind === 'zone_overlay') {
      const zone = bootstrap.zones.find((candidate) => candidate.id === entity.id);
      if (!zone) {
        return;
      }

      set({ adminBusy: true, adminError: '' });
      try {
        await updateStockroomZone(zone.id, buildZonePayload(zone, {
          ...entity,
          position: snapPosition(entity.position, get().sceneMetadataDraft?.snapGrid),
          rotation: 0,
        }));
        set({ adminBusy: false });
        get().clearEntityPreview(entity.entityKey);
        await get().loadBootstrap({ layoutId: get().selectedLayoutId, preserveFloor: true });
      } catch (error) {
        setAdminFailure(set, error instanceof Error ? error.message : 'Failed to update zone.');
        throw error;
      }
    }
  },

  async createShelfTemplate(variant) {
    const bootstrap = get().bootstrap;
    const layoutId = get().selectedLayoutId;
    const currentFloor = get().currentFloor;

    if (!bootstrap || !layoutId) {
      return;
    }

    const floor = getFloorByNumber(bootstrap, currentFloor);
    if (!floor) {
      throw new Error('No floor is loaded for the current view.');
    }

    const position = snapPosition({ x: floor.width * 0.5, y: floor.depth * 0.5 }, get().sceneMetadataDraft?.snapGrid);
    const associations = resolveShelfAssociations(bootstrap, currentFloor, position);
    if (!associations.floor || !associations.zone || !associations.aisle) {
      throw new Error('Create at least one zone and aisle on this floor before adding shelves.');
    }

    const shelfCount = bootstrap.shelves.filter((shelf) => shelf.floorId === associations.floor?.id).length + 1;
    set({ adminBusy: true, adminError: '' });
    try {
      await createStockroomShelf({
        layoutId,
        floorId: associations.floor.id,
        zoneId: associations.zone.id,
        aisleId: associations.aisle.id,
        code: `SH-${String(shelfCount).padStart(2, '0')}`,
        name: `Shelf ${shelfCount}`,
        shelfType: '4_level',
        positionX: position.x,
        positionY: position.y,
        rotation: 0,
        width: variant === '3-bay' ? 4.1 : 2.8,
        depth: 0.98,
        height: 2.35,
        accessSide: 'front',
        metadata: { sceneVariant: variant },
      });
      set({ adminBusy: false });
      await get().loadBootstrap({ layoutId, preserveFloor: true });
    } catch (error) {
      setAdminFailure(set, error instanceof Error ? error.message : 'Failed to create shelf.');
      throw error;
    }
  },

  async deleteShelfEntity(shelfId) {
    set({ adminBusy: true, adminError: '' });
    try {
      await deleteStockroomShelf(shelfId);
      set({ adminBusy: false, selectedEntityKey: null });
      await get().loadBootstrap({ layoutId: get().selectedLayoutId, preserveFloor: true });
    } catch (error) {
      setAdminFailure(set, error instanceof Error ? error.message : 'Failed to delete shelf.');
      throw error;
    }
  },

  async saveMasterPlacement(productId, payload) {
    set({ adminBusy: true, adminError: '' });
    try {
      await updateStockroomMasterItem(productId, {
        partCode: payload.partCode,
        keywords: payload.keywords,
        isActive: payload.isActive !== false,
      });

      if (payload.floorId && payload.zoneId && payload.aisleId && payload.shelfId && payload.shelfLevelId && payload.shelfSlotId) {
        await updateStockroomItemLocation(productId, {
          layoutId: get().selectedLayoutId,
          floorId: payload.floorId,
          zoneId: payload.zoneId,
          aisleId: payload.aisleId,
          shelfId: payload.shelfId,
          shelfLevelId: payload.shelfLevelId,
          shelfSlotId: payload.shelfSlotId,
        });
      }

      set({ adminBusy: false });
      await Promise.all([
        get().loadBootstrap({ layoutId: get().selectedLayoutId, preserveFloor: true }),
        get().loadMasterItems(get().masterSearchQuery),
      ]);
    } catch (error) {
      setAdminFailure(set, error instanceof Error ? error.message : 'Failed to save item mapping.');
      throw error;
    }
  },

  async deleteMasterPlacement(productId) {
    set({ adminBusy: true, adminError: '' });
    try {
      await deleteStockroomItemLocation(productId, get().selectedLayoutId);
      set({ adminBusy: false });
      await Promise.all([
        get().loadBootstrap({ layoutId: get().selectedLayoutId, preserveFloor: true }),
        get().loadMasterItems(get().masterSearchQuery),
      ]);
    } catch (error) {
      setAdminFailure(set, error instanceof Error ? error.message : 'Failed to remove the item location.');
      throw error;
    }
  },
}));

export default useStockroomStore;

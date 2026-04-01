import { create } from 'zustand';
import {
  createStockroomAisle,
  createStockroomLayout,
  createStockroomShelf,
  createStockroomZone,
  deleteStockroomAisle,
  deleteStockroomItemLocation,
  deleteStockroomShelf,
  deleteStockroomZone,
  getStockroomBootstrap,
  getStockroomItemDetails,
  getStockroomLayouts,
  getStockroomMasterItems,
  publishStockroomLayout,
  searchStockroomItems,
  updateStockroomAisle,
  updateStockroomItemLocation,
  updateStockroomLayout,
  updateStockroomMasterItem,
  updateStockroomShelf,
  updateStockroomZone,
} from '../services/stockroomApi';

const useStockroomStore = create((set, get) => ({
  bootstrap: null,
  loadingBootstrap: false,
  bootstrapError: '',
  currentFloor: 1,
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
  savingAdmin: false,
  adminError: '',

  setCurrentFloor: (floorNumber) => {
    set({ currentFloor: floorNumber });
  },

  setSearchQuery: (searchQuery) => {
    set({ searchQuery });
  },

  clearSelection: () => {
    set({
      selectedProductId: null,
      selectedItemDetails: null,
      itemDetailsError: '',
    });
  },

  loadBootstrap: async ({ layoutId = null } = {}) => {
    set({ loadingBootstrap: true, bootstrapError: '' });
    try {
      const bootstrap = await getStockroomBootstrap(layoutId);
      const activeFloor = Number(bootstrap?.floors?.[0]?.floorNumber ?? 1);
      set({
        bootstrap,
        currentFloor: activeFloor,
        selectedLayoutId: layoutId ?? bootstrap?.activeLayout?.id ?? null,
        loadingBootstrap: false,
      });
      return bootstrap;
    } catch (error) {
      set({
        bootstrapError: error.message || 'Failed to load stockroom bootstrap data.',
        loadingBootstrap: false,
      });
      throw error;
    }
  },

  searchItems: async (searchQuery) => {
    const trimmedQuery = String(searchQuery || '').trim();
    set({ searchQuery: searchQuery ?? '', searchError: '' });

    if (!trimmedQuery) {
      set({ searchResults: [], searching: false });
      return [];
    }

    set({ searching: true });
    try {
      const searchResults = await searchStockroomItems(trimmedQuery);
      set({
        searchResults,
        searching: false,
      });
      return searchResults;
    } catch (error) {
      set({
        searchError: error.message || 'Failed to search the stockroom.',
        searching: false,
      });
      throw error;
    }
  },

  loadItemDetails: async (productId) => {
    if (!productId) {
      return null;
    }

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
      });
      return selectedItemDetails;
    } catch (error) {
      set({
        loadingItemDetails: false,
        itemDetailsError: error.message || 'Failed to load item details.',
      });
      throw error;
    }
  },

  focusFloorForSelectedItem: () => {
    const targetFloor = get().selectedItemDetails?.targetFloor;
    if (targetFloor) {
      set({ currentFloor: Number(targetFloor) });
    }
  },

  loadLayouts: async () => {
    set({ loadingLayouts: true, layoutsError: '' });
    try {
      const layouts = await getStockroomLayouts();
      set({
        layouts,
        loadingLayouts: false,
      });
      return layouts;
    } catch (error) {
      set({
        loadingLayouts: false,
        layoutsError: error.message || 'Failed to load layout versions.',
      });
      throw error;
    }
  },

  loadMasterItems: async (query = '') => {
    const layoutId = get().selectedLayoutId;
    set({ loadingMasterItems: true, masterItemsError: '' });
    try {
      const masterItems = await getStockroomMasterItems(layoutId ? { q: query, layoutId } : { q: query });
      set({
        masterItems,
        loadingMasterItems: false,
      });
      return masterItems;
    } catch (error) {
      set({
        loadingMasterItems: false,
        masterItemsError: error.message || 'Failed to load stockroom item master data.',
      });
      throw error;
    }
  },

  refreshAdminData: async () => {
    const selectedLayoutId = get().selectedLayoutId;
    await Promise.all([
      get().loadLayouts(),
      get().loadBootstrap({ layoutId: selectedLayoutId }),
      get().loadMasterItems(),
    ]);
  },

  createLayoutDraft: async (name) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      const selectedLayoutId = get().selectedLayoutId;
      const layout = await createStockroomLayout({
        name,
        sourceLayoutId: selectedLayoutId,
      });
      set({
        selectedLayoutId: layout.id,
        savingAdmin: false,
      });
      await get().refreshAdminData();
      return layout;
    } catch (error) {
      set({
        savingAdmin: false,
        adminError: error.message || 'Failed to create a new layout draft.',
      });
      throw error;
    }
  },

  saveLayoutMetadata: async (payload) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      const layout = await updateStockroomLayout(payload.layoutId, payload);
      set({ savingAdmin: false, selectedLayoutId: layout.id });
      await get().refreshAdminData();
      return layout;
    } catch (error) {
      set({ savingAdmin: false, adminError: error.message || 'Failed to save layout metadata.' });
      throw error;
    }
  },

  publishSelectedLayout: async (layoutId) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      const layout = await publishStockroomLayout(layoutId);
      set({ savingAdmin: false, selectedLayoutId: layout.id });
      await get().refreshAdminData();
      return layout;
    } catch (error) {
      set({ savingAdmin: false, adminError: error.message || 'Failed to publish the layout.' });
      throw error;
    }
  },

  selectLayout: async (layoutId) => {
    set({ selectedLayoutId: layoutId });
    const [bootstrap] = await Promise.all([
      get().loadBootstrap({ layoutId }),
      get().loadMasterItems(),
    ]);
    return bootstrap;
  },

  saveZone: async (payload) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      const zone = payload.id
        ? await updateStockroomZone(payload.id, payload)
        : await createStockroomZone(payload);
      set({ savingAdmin: false });
      await get().loadBootstrap({ layoutId: get().selectedLayoutId });
      return zone;
    } catch (error) {
      set({ savingAdmin: false, adminError: error.message || 'Failed to save zone.' });
      throw error;
    }
  },

  deleteZone: async (zoneId) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      await deleteStockroomZone(zoneId);
      set({ savingAdmin: false });
      await get().loadBootstrap({ layoutId: get().selectedLayoutId });
    } catch (error) {
      set({ savingAdmin: false, adminError: error.message || 'Failed to delete zone.' });
      throw error;
    }
  },

  saveAisle: async (payload) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      const aisle = payload.id
        ? await updateStockroomAisle(payload.id, payload)
        : await createStockroomAisle(payload);
      set({ savingAdmin: false });
      await get().loadBootstrap({ layoutId: get().selectedLayoutId });
      return aisle;
    } catch (error) {
      set({ savingAdmin: false, adminError: error.message || 'Failed to save aisle.' });
      throw error;
    }
  },

  deleteAisle: async (aisleId) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      await deleteStockroomAisle(aisleId);
      set({ savingAdmin: false });
      await get().loadBootstrap({ layoutId: get().selectedLayoutId });
    } catch (error) {
      set({ savingAdmin: false, adminError: error.message || 'Failed to delete aisle.' });
      throw error;
    }
  },

  saveShelf: async (payload) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      const shelf = payload.id
        ? await updateStockroomShelf(payload.id, payload)
        : await createStockroomShelf(payload);
      set({ savingAdmin: false });
      await get().loadBootstrap({ layoutId: get().selectedLayoutId });
      return shelf;
    } catch (error) {
      set({ savingAdmin: false, adminError: error.message || 'Failed to save shelf.' });
      throw error;
    }
  },

  deleteShelf: async (shelfId) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      await deleteStockroomShelf(shelfId);
      set({ savingAdmin: false });
      await get().loadBootstrap({ layoutId: get().selectedLayoutId });
    } catch (error) {
      set({ savingAdmin: false, adminError: error.message || 'Failed to delete shelf.' });
      throw error;
    }
  },

  saveMasterItem: async (productId, payload) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      const item = await updateStockroomMasterItem(productId, payload);
      set({ savingAdmin: false });
      await get().loadMasterItems();
      return item;
    } catch (error) {
      set({ savingAdmin: false, adminError: error.message || 'Failed to save item metadata.' });
      throw error;
    }
  },

  saveItemLocation: async (productId, payload) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      const location = await updateStockroomItemLocation(productId, payload);
      set({ savingAdmin: false });
      await Promise.all([
        get().loadBootstrap({ layoutId: get().selectedLayoutId }),
        get().loadMasterItems(),
      ]);
      return location;
    } catch (error) {
      set({ savingAdmin: false, adminError: error.message || 'Failed to save item location.' });
      throw error;
    }
  },

  deleteItemLocation: async (productId) => {
    set({ savingAdmin: true, adminError: '' });
    try {
      await deleteStockroomItemLocation(productId, get().selectedLayoutId);
      set({ savingAdmin: false });
      await Promise.all([
        get().loadBootstrap({ layoutId: get().selectedLayoutId }),
        get().loadMasterItems(),
      ]);
    } catch (error) {
      set({ savingAdmin: false, adminError: error.message || 'Failed to remove the item location.' });
      throw error;
    }
  },
}));

export default useStockroomStore;

import { create } from 'zustand';

/**
 * Stockroom Store
 * Global state for 3D stockroom viewer
 */
const useStockroomStore = create((set) => ({
    // Selected item from inventory/search
    selectedItem: null,
    highlightedLocation: null,

    // Set selected item (from inventory or search)
    setSelectedItem: (item) => set({ selectedItem: item }),

    // Set highlighted location
    setHighlightedLocation: (location) => set({ highlightedLocation: location }),

    // Clear selection
    clearSelection: () => set({ selectedItem: null, highlightedLocation: null }),
}));

export default useStockroomStore;

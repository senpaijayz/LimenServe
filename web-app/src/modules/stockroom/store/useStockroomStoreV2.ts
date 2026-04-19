import { create } from 'zustand';
import { supabase } from '../../../services/supabase';
import { MOCK_SEED_PRODUCTS } from '../data/mockProducts';

export interface ProductLocation {
    aisle: number;
    shelf: number;
    level: number;
    bin: number;
}

export interface StockroomProduct {
    id: string;
    name: string;
    sku: string;
    category: string;
    quantity: number;
    location: ProductLocation;
}

interface StockroomState {
    // Mode and Auth
    isAdminMode: boolean;
    canEdit: boolean;
    setIsAdminMode: (mode: boolean) => void;
    setCanEdit: (can: boolean) => void;

    // Data
    isInitializing: boolean;
    products: StockroomProduct[];
    categories: string[];

    // Interactions
    activeSearchQuery: string;
    selectedProductId: string | null;
    focusedLocation: ProductLocation | null;

    // Actions
    initializeStockroom: () => Promise<void>;
    setSearchQuery: (query: string) => void;
    selectProduct: (id: string | null) => void;
    updateProductLocation: (id: string, newLocation: ProductLocation) => Promise<void>;
}

export const useStockroomStore = create<StockroomState>((set, get) => ({
    isAdminMode: false,
    canEdit: false,
    setIsAdminMode: (mode) => set({ isAdminMode: !!mode }),
    setCanEdit: (can) => set({ canEdit: can }),

    isInitializing: true,
    products: [],
    categories: [],

    activeSearchQuery: '',
    selectedProductId: null,
    focusedLocation: null,

    initializeStockroom: async () => {
        set({ isInitializing: true });
        try {
            // Look for a table named 'inventory' or 'parts'. We'll try fetching 'master_items' or 'inventory'
            // If the query inherently fails (e.g. table doesn't exist), we catch and use mock data.
            const { data, error } = await supabase.from('stockroom_items').select('*');

            let fetchedProducts: StockroomProduct[] = [];
            if (error || !data || data.length === 0) {
                console.warn('Supabase fetch failed or returned 0 rows. Using 30 Cinematic Seeder Products.');
                fetchedProducts = [...MOCK_SEED_PRODUCTS];
            } else {
                fetchedProducts = data.map((d: any) => ({
                    id: d.id,
                    name: d.name || d.part_name || 'Unknown Part',
                    sku: d.sku || d.part_number || 'N/A',
                    category: d.category || 'Uncategorized',
                    quantity: d.quantity || 0,
                    location: d.location || { aisle: 1, shelf: 1, level: 1, bin: 1 }
                }));
            }

            const cats = Array.from(new Set(fetchedProducts.map(p => p.category)));

            set({
                products: fetchedProducts,
                categories: cats,
                isInitializing: false
            });
        } catch (e) {
            console.error(e);
            const cats = Array.from(new Set(MOCK_SEED_PRODUCTS.map(p => p.category)));
            set({
                products: MOCK_SEED_PRODUCTS,
                categories: cats,
                isInitializing: false
            });
        }
    },

    setSearchQuery: (query: string) => {
        const { products } = get();
        // Auto-focus if it perfectly matches or near matches
        const lowerQ = query.toLowerCase();
        const exact = products.find(p => p.name.toLowerCase().includes(lowerQ) || p.sku.toLowerCase().includes(lowerQ));

        set({
            activeSearchQuery: query,
            selectedProductId: query.length > 2 && exact ? exact.id : null,
            focusedLocation: query.length > 2 && exact ? exact.location : null
        });
    },

    selectProduct: (id) => {
        if (!id) {
            set({ selectedProductId: null, focusedLocation: null });
            return;
        }
        const product = get().products.find(p => p.id === id);
        if (product) {
            set({ selectedProductId: id, focusedLocation: product.location });
        }
    },

    updateProductLocation: async (id, newLocation) => {
        const { canEdit, products } = get();
        if (!canEdit) return;

        // Optimistic UI update
        set({
            products: products.map(p => p.id === id ? { ...p, location: newLocation } : p),
            focusedLocation: newLocation
        });

        try {
            // Attempt to save to Supabase
            await supabase.from('stockroom_items').update({ location: newLocation }).eq('id', id);
        } catch (err) {
            console.error('Failed to sync location to backend', err);
        }
    }
}));

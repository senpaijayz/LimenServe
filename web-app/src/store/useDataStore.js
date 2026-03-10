import { create } from 'zustand';
import { supabase } from '../services/supabase';

/**
 * Global Data Store that bridges frontend to Supabase
 * Replaces direct imports of mock data across the application.
 */
const useDataStore = create((set, get) => ({
    products: [],
    loading: false,
    error: null,

    // Fetch products from backend
    fetchProducts: async () => {
        set({ loading: true, error: null });
        try {
            // Mock backend connection until Supabase columns are fully established on dashboard
            const { products } = await import('../data/productData');

            // Format mock data simulating a complex backend join
            const formatted = products.map(p => ({
                ...p,
                cost: Math.round(p.price * 0.55),
                quantity: p.stock,
                location: {
                    floor: p.id % 3 === 0 ? 1 : 2,
                    section: String.fromCharCode(65 + (p.id % 8)),
                    shelf: String((p.id % 5) + 1),
                },
            }));

            // Simulate network latency
            await new Promise(resolve => setTimeout(resolve, 500));
            set({ products: formatted, loading: false });
        } catch (error) {
            console.error('Failed to fetch products:', error);
            set({ error: error.message, loading: false });
        }
    },

    // Update a single product (e.g. adding stock)
    updateProduct: (id, updatedProduct) => {
        set((state) => ({
            products: state.products.map(p => p.id === id ? updatedProduct : p)
        }));
    },
}));

export default useDataStore;

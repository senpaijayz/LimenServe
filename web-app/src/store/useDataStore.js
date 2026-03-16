import { create } from 'zustand';
import { getFullProductCatalog } from '../services/catalogApi';

/**
 * Global Data Store that bridges frontend to Supabase.
 * Internal screens can still preload the full catalog when needed.
 */
const useDataStore = create((set) => ({
    products: [],
    loading: false,
    error: null,
    source: 'supabase',

    fetchProducts: async () => {
        set({ loading: true, error: null });

        try {
            const catalog = await getFullProductCatalog();
            const formatted = catalog.map((product) => ({
                id: product.id,
                sku: product.sku,
                name: product.name,
                model: product.model,
                category: product.category,
                price: Number(product.price ?? 0),
                stock: Number(product.stock ?? 0),
                quantity: Number(product.stock ?? 0),
                status: product.status ?? 'in_stock',
                uom: product.uom ?? 'PC',
                brand: product.brand ?? 'Mitsubishi',
                cost: Math.round(Number(product.price ?? 0) * 0.55),
                location: product.location ?? {},
            }));

            set({
                products: formatted,
                loading: false,
                error: formatted.length === 0 ? 'No products were returned from the database.' : null,
                source: 'supabase',
            });
        } catch (error) {
            console.error('Failed to fetch products from Supabase:', error);
            set({
                products: [],
                error: error.message || 'Failed to fetch products from Supabase.',
                loading: false,
                source: 'supabase',
            });
        }
    },

    updateProduct: (id, updatedProduct) => {
        set((state) => ({
            products: state.products.map((product) => (product.id === id ? updatedProduct : product)),
        }));
    },
}));

export default useDataStore;

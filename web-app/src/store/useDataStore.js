import { create } from 'zustand';
import { getProductCatalog } from '../services/catalogApi';

/**
 * Global Data Store that bridges frontend to Supabase
 * Replaces direct imports of mock data across the application.
 */
const useDataStore = create((set) => ({
    products: [],
    loading: false,
    error: null,
    source: 'mock',

    // Fetch products from backend
    fetchProducts: async () => {
        set({ loading: true, error: null });
        try {
            const catalog = await getProductCatalog();

            if (catalog.length > 0) {
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
                    source: 'supabase',
                });
                return;
            }
        } catch (supabaseError) {
            console.warn('Supabase catalog unavailable, falling back to local mock data.', supabaseError);
        }

        try {
            const { products } = await import('../data/productData');
            const formatted = products.map((p) => ({
                ...p,
                cost: Math.round(p.price * 0.55),
                quantity: p.stock,
                location: {
                    floor: p.id % 3 === 0 ? 1 : 2,
                    section: String.fromCharCode(65 + (p.id % 8)),
                    shelf: String((p.id % 5) + 1),
                },
            }));

            await new Promise((resolve) => setTimeout(resolve, 500));
            set({ products: formatted, loading: false, source: 'mock' });
        } catch (error) {
            console.error('Failed to fetch products:', error);
            set({ error: error.message, loading: false, source: 'mock' });
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

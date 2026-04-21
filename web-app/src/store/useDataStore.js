import { create } from 'zustand';
import { getProductCatalog } from '../services/catalogApi';

const BOOTSTRAP_PAGE_SIZE = 100;
const BACKGROUND_BATCH_SIZE = 4;

function formatProduct(product) {
    return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        model: product.model,
        category: product.category,
        sourceCategory: product.sourceCategory ?? null,
        classification: product.classification ?? null,
        price: Number(product.price ?? 0),
        stock: Number(product.stock ?? 0),
        quantity: Number(product.stock ?? 0),
        status: product.status ?? 'in_stock',
        uom: product.uom ?? 'PC',
        brand: product.brand ?? 'Mitsubishi',
        cost: Math.round(Number(product.price ?? 0) * 0.55),
        location: product.location ?? {},
    };
}

function mergeProducts(existingProducts = [], incomingProducts = []) {
    const merged = new Map(existingProducts.map((product) => [product.id, product]));
    incomingProducts.forEach((product) => {
        merged.set(product.id, product);
    });
    return Array.from(merged.values());
}

async function fetchCatalogPage(page) {
    const catalog = await getProductCatalog({
        page,
        pageSize: BOOTSTRAP_PAGE_SIZE,
        includeCategories: false,
    });

    return {
        products: (catalog.products ?? []).map(formatProduct),
        pagination: catalog.pagination ?? { page, pageSize: BOOTSTRAP_PAGE_SIZE, totalCount: 0, totalPages: 1 },
    };
}

async function hydrateRemainingPages(totalPages, onPageLoaded) {
    for (let page = 2; page <= totalPages; page += BACKGROUND_BATCH_SIZE) {
        const pageBatch = Array.from(
            { length: Math.min(BACKGROUND_BATCH_SIZE, totalPages - page + 1) },
            (_, index) => fetchCatalogPage(page + index)
        );
        const responses = await Promise.all(pageBatch);
        responses.forEach((response) => {
            onPageLoaded(response.products);
        });
    }
}

function findExactProductMatch(products, identifier) {
    const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
    if (!normalizedIdentifier) {
        return null;
    }

    return products.find((product) => (
        String(product.sku || '').trim().toLowerCase() === normalizedIdentifier
        || String(product.id || '').trim().toLowerCase() === normalizedIdentifier
    )) || null;
}

/**
 * Global Data Store that bridges frontend to Supabase.
 * Internal screens now bootstrap quickly, then hydrate the remaining pages in the background.
 */
const useDataStore = create((set, get) => ({
    products: [],
    loading: false,
    isHydratingProducts: false,
    error: null,
    source: 'supabase',
    hasLoadedProducts: false,
    hasHydratedProducts: false,
    fetchPromise: null,

    fetchProducts: async ({ force = false } = {}) => {
        const currentState = get();

        if (!force && currentState.fetchPromise) {
            return currentState.fetchPromise;
        }

        if (!force && currentState.hasLoadedProducts && currentState.products.length > 0) {
            return currentState.products;
        }

        const request = (async () => {
            set((state) => ({
                loading: state.products.length === 0 || force,
                isHydratingProducts: false,
                error: null,
                source: 'supabase',
                hasLoadedProducts: force ? false : state.hasLoadedProducts,
                hasHydratedProducts: false,
            }));

            try {
                const firstPage = await fetchCatalogPage(1);
                const initialProducts = firstPage.products;
                const totalPages = Number(firstPage.pagination?.totalPages ?? 1);

                set({
                    products: initialProducts,
                    loading: false,
                    isHydratingProducts: totalPages > 1,
                    error: initialProducts.length === 0 ? 'No products were returned from the database.' : null,
                    source: 'supabase',
                    hasLoadedProducts: true,
                    hasHydratedProducts: totalPages <= 1,
                });

                if (totalPages > 1) {
                    try {
                        await hydrateRemainingPages(totalPages, (pageProducts) => {
                            set((state) => ({
                                products: mergeProducts(state.products, pageProducts),
                            }));
                        });
                    } catch (backgroundError) {
                        console.warn('Background catalog hydration finished with partial data:', backgroundError);
                    }
                }

                const hydratedProducts = get().products;
                set({
                    loading: false,
                    isHydratingProducts: false,
                    hasLoadedProducts: true,
                    hasHydratedProducts: true,
                    fetchPromise: null,
                });

                return hydratedProducts;
            } catch (error) {
                console.error('Failed to fetch products from Supabase:', error);
                set({
                    products: [],
                    error: error.message || 'Failed to fetch products from Supabase.',
                    loading: false,
                    isHydratingProducts: false,
                    source: 'supabase',
                    hasLoadedProducts: false,
                    hasHydratedProducts: false,
                    fetchPromise: null,
                });

                throw error;
            }
        })();

        set({ fetchPromise: request });
        return request;
    },

    findProduct: async (identifier) => {
        const exactMatch = findExactProductMatch(get().products, identifier);
        if (exactMatch) {
            return exactMatch;
        }

        const query = String(identifier || '').trim();
        if (!query) {
            return null;
        }

        try {
            const catalog = await getProductCatalog({
                page: 1,
                pageSize: 20,
                q: query,
                includeCategories: false,
            });
            const remoteProducts = (catalog.products ?? []).map(formatProduct);
            const remoteMatch = findExactProductMatch(remoteProducts, query);

            if (remoteProducts.length > 0) {
                set((state) => ({
                    products: mergeProducts(state.products, remoteProducts),
                }));
            }

            return remoteMatch;
        } catch (error) {
            console.error('Failed to find product from Supabase:', error);
            return null;
        }
    },

    updateProduct: (id, updatedProduct) => {
        set((state) => ({
            products: state.products.map((product) => (product.id === id ? updatedProduct : product)),
        }));
    },
}));

export default useDataStore;

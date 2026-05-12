import { create } from 'zustand';
import {
    getInventoryStockroomActiveLayout,
    getStockroomMasterItems,
    saveInventoryProductLocation,
    saveInventoryStockroomLayout,
    saveInventoryStockroomShelf,
} from '../../../services/stockroomApi';
import { getCoordinatesFromLocation } from '../utils/stockroomGeometry';

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

export interface StockroomShelf {
    id: string;
    aisle: string;
    shelfNumber: number;
    level: number;
    binCount: number;
    capacity: number;
    position?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

type PathPoint = [number, number, number];

interface StockroomState {
    // Mode and Auth
    isAdminMode: boolean;
    canEdit: boolean;
    setIsAdminMode: (mode: boolean) => void;
    setCanEdit: (can: boolean) => void;

    // Data
    isInitializing: boolean;
    isSaving: boolean;
    isDirty: boolean;
    lastSavedAt: string | null;
    currentLayout: Record<string, unknown> | null;
    shelves: StockroomShelf[];
    products: StockroomProduct[];
    categories: string[];

    // Interactions
    activeSearchQuery: string;
    selectedShelfId: string | null;
    selectedProductId: string | null;
    focusedLocation: ProductLocation | null;
    isLocating: boolean;
    currentPath: PathPoint[];

    // Actions
    initializeStockroom: () => Promise<void>;
    loadActiveLayout: () => Promise<void>;
    saveLayout: () => Promise<void>;
    updateShelf: (id: string, patch: Partial<StockroomShelf>) => Promise<void>;
    setSearchQuery: (query: string) => void;
    selectShelf: (id: string | null) => void;
    selectProduct: (id: string | null) => void;
    updateProductLocation: (id: string, newLocation: ProductLocation) => Promise<void>;
    locateProduct: (id: string) => Promise<void>;
    clearPath: () => void;
}

const COUNTER_POINT: PathPoint = [0, 0.18, 18];
const DEFAULT_AISLES = ['A', 'B', 'C', 'D', 'E', 'F'];

function aisleToNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(1, Math.min(6, Math.round(value)));
    }

    const letter = String(value || 'A').trim().toUpperCase().match(/[A-Z]/)?.[0] || 'A';
    return Math.max(1, Math.min(6, letter.charCodeAt(0) - 64));
}

function numberToAisle(value: unknown): string {
    const number = aisleToNumber(value);
    return String.fromCharCode(64 + number);
}

function clampLocation(location: Partial<ProductLocation> = {}): ProductLocation {
    return {
        aisle: aisleToNumber(location.aisle),
        shelf: Math.max(1, Math.min(5, Math.round(Number(location.shelf ?? 1)) || 1)),
        level: Math.max(1, Math.min(6, Math.round(Number(location.level ?? 1)) || 1)),
        bin: Math.max(1, Math.min(4, Math.round(Number(location.bin ?? 1)) || 1)),
    };
}

function normalizeBridgeLocation(row: any): ProductLocation {
    return clampLocation({
        aisle: row?.aisle,
        shelf: row?.shelfNumber ?? row?.shelf_number ?? row?.shelf,
        level: row?.level,
        bin: row?.binNumber ?? row?.bin_number ?? row?.bin,
    });
}

function buildDefaultShelves(): StockroomShelf[] {
    const shelves: StockroomShelf[] = [];
    for (const aisle of DEFAULT_AISLES) {
        for (let shelfNumber = 1; shelfNumber <= 5; shelfNumber += 1) {
            for (let level = 1; level <= 6; level += 1) {
                shelves.push({
                    id: `${aisle}-${shelfNumber}-${level}`,
                    aisle,
                    shelfNumber,
                    level,
                    binCount: 3,
                    capacity: 50,
                    metadata: { generated: true },
                });
            }
        }
    }
    return shelves;
}

function buildPathToLocation(location: ProductLocation): PathPoint[] {
    const [targetX, targetY, targetZ] = getCoordinatesFromLocation(location);
    return [
        COUNTER_POINT,
        [0, 0.28, Math.max(8, targetZ + 6)],
        [targetX, 0.42, Math.max(5, targetZ + 3)],
        [targetX, Math.max(0.85, targetY + 0.5), targetZ],
    ];
}

function mapBridgeShelf(row: any): StockroomShelf {
    return {
        id: row.id || `${row.aisle}-${row.shelfNumber ?? row.shelf_number}-${row.level}`,
        aisle: String(row.aisle || 'A').toUpperCase(),
        shelfNumber: Number(row.shelfNumber ?? row.shelf_number ?? 1),
        level: Number(row.level ?? 1),
        binCount: Number(row.binCount ?? row.bin_count ?? 3),
        capacity: Number(row.capacity ?? 50),
        position: row.position ?? {},
        metadata: row.metadata ?? {},
    };
}

export const useStockroomStore = create<StockroomState>((set, get) => ({
    isAdminMode: false,
    canEdit: false,
    setIsAdminMode: (mode) => set({ isAdminMode: !!mode }),
    setCanEdit: (can) => set({ canEdit: can }),

    isInitializing: true,
    isSaving: false,
    isDirty: false,
    lastSavedAt: null,
    currentLayout: null,
    shelves: buildDefaultShelves(),
    products: [],
    categories: [],

    activeSearchQuery: '',
    selectedShelfId: null,
    selectedProductId: null,
    focusedLocation: null,
    isLocating: false,
    currentPath: [],

    loadActiveLayout: async () => {
        const bridge = await getInventoryStockroomActiveLayout();
        const shelves = Array.isArray(bridge?.shelves) && bridge.shelves.length > 0
            ? bridge.shelves.map(mapBridgeShelf)
            : buildDefaultShelves();

        set({
            currentLayout: bridge?.layout ?? null,
            shelves,
        });
    },

    initializeStockroom: async () => {
        set({ isInitializing: true });
        try {
            const [bridge, data] = await Promise.all([
                getInventoryStockroomActiveLayout().catch(() => null),
                getStockroomMasterItems({ limit: 250 }),
            ]);
            const savedLocationByProduct = new Map(
                (bridge?.productLocations ?? []).map((location: any) => [location.productId, normalizeBridgeLocation(location)]),
            );
            const fetchedProducts = (data ?? []).map((item: any) => {
                const productId = item.productId || item.id;
                const savedLocation = savedLocationByProduct.get(productId);
                return {
                    id: productId,
                    name: item.name || 'Unknown Part',
                    sku: item.sku || item.partCode || 'N/A',
                    category: item.category || 'Uncategorized',
                    quantity: Number(item.stock ?? item.quantity ?? 0),
                    location: savedLocation ?? clampLocation({
                        aisle: item.location?.aisle?.number ?? item.location?.aisle ?? 1,
                        shelf: item.location?.shelf?.number ?? item.location?.shelf ?? 1,
                        level: item.location?.level?.number ?? item.location?.level ?? 1,
                        bin: item.location?.slot?.number ?? item.location?.bin ?? 1,
                    }),
                };
            });

            const cats = Array.from(new Set(fetchedProducts.map((product) => product.category)));
            const shelves = Array.isArray(bridge?.shelves) && bridge.shelves.length > 0
                ? bridge.shelves.map(mapBridgeShelf)
                : buildDefaultShelves();
            const pendingLocateId = window.sessionStorage.getItem('limen:stockroom:locateProductId');

            set({
                currentLayout: bridge?.layout ?? null,
                shelves,
                products: fetchedProducts,
                categories: cats,
                isInitializing: false,
                isDirty: false,
            });

            if (pendingLocateId) {
                window.sessionStorage.removeItem('limen:stockroom:locateProductId');
                await get().locateProduct(pendingLocateId);
            }
        } catch (error) {
            console.error(error);
            set({
                products: [],
                categories: [],
                isInitializing: false,
            });
        }
    },

    saveLayout: async () => {
        const { canEdit, shelves, currentLayout, isSaving } = get();
        if (!canEdit || isSaving) return;

        set({ isSaving: true });
        try {
            const layout = await saveInventoryStockroomLayout({
                name: String(currentLayout?.name || 'Main Stockroom Layout'),
                layoutData: {
                    source: 'stockroom-v2',
                    savedAt: new Date().toISOString(),
                },
                shelves,
            });
            set({
                currentLayout: layout ?? currentLayout,
                isDirty: false,
                isSaving: false,
                lastSavedAt: new Date().toISOString(),
            });
        } catch (error) {
            console.error(error);
            set({ isSaving: false });
            throw error;
        }
    },

    updateShelf: async (id, patch) => {
        const { canEdit, shelves } = get();
        const previousShelves = shelves;
        const nextShelves = shelves.map((shelf) => (
            shelf.id === id ? { ...shelf, ...patch } : shelf
        ));

        set({ shelves: nextShelves, selectedShelfId: id, isDirty: true });

        if (!canEdit) return;

        try {
            const target = nextShelves.find((shelf) => shelf.id === id);
            if (target) {
                await saveInventoryStockroomShelf(id, target);
            }
        } catch (error) {
            console.error(error);
            set({ shelves: previousShelves });
            throw error;
        }
    },

    setSearchQuery: (query: string) => {
        const { products } = get();
        const lowerQ = query.toLowerCase();
        const exact = products.find((product) => (
            product.name.toLowerCase().includes(lowerQ)
            || product.sku.toLowerCase().includes(lowerQ)
        ));

        set({
            activeSearchQuery: query,
            selectedProductId: query.length > 2 && exact ? exact.id : null,
            focusedLocation: query.length > 2 && exact ? exact.location : null,
            currentPath: query.length > 2 && exact ? buildPathToLocation(exact.location) : [],
            isLocating: query.length > 2 && Boolean(exact),
        });
    },

    selectShelf: (id) => set({ selectedShelfId: id }),

    selectProduct: (id) => {
        if (!id) {
            set({ selectedProductId: null, focusedLocation: null, isLocating: false, currentPath: [] });
            return;
        }
        const product = get().products.find((item) => item.id === id);
        if (product) {
            set({
                selectedProductId: id,
                focusedLocation: product.location,
                currentPath: buildPathToLocation(product.location),
                isLocating: true,
            });
        }
    },

    updateProductLocation: async (id, newLocation) => {
        const { canEdit, products } = get();
        if (!canEdit) return;

        const location = clampLocation(newLocation);
        const previousProducts = products;
        set({
            products: products.map((product) => (
                product.id === id ? { ...product, location } : product
            )),
            focusedLocation: location,
            currentPath: buildPathToLocation(location),
            isDirty: true,
        });

        try {
            await saveInventoryProductLocation(id, {
                aisle: numberToAisle(location.aisle),
                shelfNumber: location.shelf,
                level: location.level,
                binNumber: location.bin,
            });
        } catch (error) {
            console.error(error);
            set({ products: previousProducts });
            throw error;
        }
    },

    locateProduct: async (id) => {
        const product = get().products.find((item) => item.id === id);
        if (!product) return;

        set({
            selectedProductId: id,
            focusedLocation: product.location,
            currentPath: buildPathToLocation(product.location),
            isLocating: true,
        });
    },

    clearPath: () => set({ currentPath: [], isLocating: false, focusedLocation: null, selectedProductId: null }),
}));

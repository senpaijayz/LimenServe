/**
 * Stockroom API (Mock)
 * API functions for layout management
 * In production, these would connect to the backend
 */
import useDataStore from '../../../store/useDataStore';

// Simulate API delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Local storage keys
const LAYOUTS_KEY = 'stockroom_layouts';
const DEFAULT_LAYOUT_KEY = 'stockroom_default_layout';

// Get all layouts
export const getLayouts = async () => {
    await delay(100);
    const saved = localStorage.getItem(LAYOUTS_KEY);
    return saved ? JSON.parse(saved) : [];
};

// Get default layout
export const getDefaultLayout = async () => {
    await delay(100);
    const defaultId = localStorage.getItem(DEFAULT_LAYOUT_KEY);
    if (!defaultId) return null;

    const layouts = await getLayouts();
    return layouts.find(l => l.id === parseInt(defaultId)) || null;
};

// Create new layout
export const createLayout = async ({ name, description, layoutData, isDefault }) => {
    await delay(100);
    const layouts = await getLayouts();

    const newLayout = {
        id: Date.now(),
        name,
        description,
        layout_data: JSON.stringify(layoutData),
        is_default: isDefault || false,
        created_at: new Date().toISOString(),
    };

    layouts.push(newLayout);
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));

    if (isDefault) {
        localStorage.setItem(DEFAULT_LAYOUT_KEY, String(newLayout.id));
    }

    return newLayout;
};

// Update layout
export const updateLayout = async (id, updates) => {
    await delay(100);
    const layouts = await getLayouts();
    const index = layouts.findIndex(l => l.id === id);

    if (index === -1) throw new Error('Layout not found');

    if (updates.layoutData) {
        layouts[index].layout_data = JSON.stringify(updates.layoutData);
    }
    if (updates.name) {
        layouts[index].name = updates.name;
    }

    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));
    return layouts[index];
};

// Delete layout
export const deleteLayout = async (id) => {
    await delay(100);
    let layouts = await getLayouts();
    layouts = layouts.filter(l => l.id !== id);
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));

    // Clear default if deleted
    const defaultId = localStorage.getItem(DEFAULT_LAYOUT_KEY);
    if (defaultId && parseInt(defaultId) === id) {
        localStorage.removeItem(DEFAULT_LAYOUT_KEY);
    }
};

// Set default layout
export const setDefaultLayout = async (id) => {
    await delay(100);
    const layouts = await getLayouts();

    // Update is_default flag
    layouts.forEach(l => {
        l.is_default = l.id === id;
    });

    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));
    localStorage.setItem(DEFAULT_LAYOUT_KEY, String(id));
};

// Search parts mapped to store
export const searchParts = async (query) => {
    await delay(100);

    const storeProducts = useDataStore.getState().products;
    const q = query.toLowerCase();

    return storeProducts
        .filter(p =>
            p.sku.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
        )
        .map(p => ({
            id: p.id,
            material: p.sku,
            description: p.name,
            location_code: `F${p.location.floor}-${p.location.section}-${p.location.shelf}`,
            stock: p.quantity,
            location: { aisle: p.location.section, shelf: parseInt(p.location.shelf), bin: 1 }
        }));
};

// Export all as default object for compatibility
export default {
    getLayouts,
    getDefaultLayout,
    createLayout,
    updateLayout,
    deleteLayout,
    setDefaultLayout,
    searchParts,
};

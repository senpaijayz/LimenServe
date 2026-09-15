import apiClient from '../../../services/apiClient';
import { LOCATOR_LAYOUT_NAME } from '../data/locatorScene';

async function command(action, payload = {}) {
    try {
        const { data } = await apiClient.post('/locator/command', { action, payload });
        return data.result;
    } catch (error) {
        const failure = new Error(error.response?.data?.error || error.message || 'Unable to access the stockroom.');
        failure.status = error.response?.status;
        throw failure;
    }
}
function mapLayout(row) {
    return row ? {
        id: row.id, storeId: row.store_id, revision: row.revision, status: row.status,
        isPriority: row.status === 'published', layoutName: row.name,
        layoutData: row.metadata?.scene, locations: row.metadata?.locations || [], updatedAt: row.updated_at,
    } : null;
}
export async function listStoreLayouts() { return (await command('list') || []).map(mapLayout); }
export async function loadStoreLayout(name = LOCATOR_LAYOUT_NAME, options = {}) {
    return mapLayout(await command('load', { name, ...options }));
}
export async function saveStoreLayout(objects, name = LOCATOR_LAYOUT_NAME, context = {}) {
    return mapLayout(await command('save', { ...context, name, objects }));
}
export async function setStoreLayoutPriority(_name, context = {}) {
    return mapLayout(await command('publish', context));
}
export async function getLayoutHistory(context) { return command('history', context); }
export async function restoreLayoutRevision(context) { return mapLayout(await command('restore', context)); }

export async function assignProductLocation(location, context = {}) {
    let target = context;
    if (!context.layoutId) {
        // Inventory assignments target the published store, never an admin draft.
        const layout = await loadStoreLayout('', { publishedOnly: true });
        if (!layout) throw new Error('Publish a stockroom layout before assigning products.');
        target = { layoutId: layout.id, expectedRevision: layout.revision };
    }
    const saved = mapLayout(await command('assign', { ...target, location }));
    return { ...saved.locations.find((item) => item.productId === location.productId), layoutRevision: saved.revision };
}
export async function getProductLocations(name = '', options = { publishedOnly: true }) {
    return (await loadStoreLayout(name, options))?.locations || [];
}
export async function getProductLocation(productId) {
    if (!productId) return null;
    return (await getProductLocations()).find((item) => item.productId === productId) || null;
}

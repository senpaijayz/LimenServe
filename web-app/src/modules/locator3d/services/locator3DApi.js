import apiClient, { STOCKROOM_API_TIMEOUT_MS } from '../../../services/apiClient';
import { LOCATOR_LAYOUT_NAME } from '../data/locatorScene';

async function command(action, payload = {}) {
    try {
        const { data } = await apiClient.post('/locator/command', { action, payload }, { timeout: STOCKROOM_API_TIMEOUT_MS });
        return data.result;
    } catch (error) {
        const failure = new Error(error.response?.data?.error || error.message || 'Unable to access the stockroom.');
        failure.status = error.response?.status;
        failure.code = error.response?.data?.code || error.code;
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
function snapshotKey(objects) {
    // Postgres jsonb reorders object keys; compare content, not insertion order.
    return JSON.stringify(objects, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value);
}
export async function listStoreLayouts() { return (await command('list') || []).map(mapLayout); }
export async function loadStoreLayout(name = LOCATOR_LAYOUT_NAME, options = {}) {
    return mapLayout(await command('load', { name, ...options }));
}
export async function saveStoreLayout(objects, name = LOCATOR_LAYOUT_NAME, context = {}) {
    try {
        return mapLayout(await command('save', { ...context, name, objects }));
    } catch (error) {
        if (!['LOCATOR_SAVE_UNCONFIRMED', 'ECONNABORTED', 'ERR_NETWORK'].includes(error.code)) throw error;
        // An interrupted response is not proof the transaction failed. Confirm
        // the exact snapshot using a read; never blindly submit the save again.
        try {
            const saved = await loadStoreLayout(name, context.storeId ? { storeId: context.storeId } : {});
            const newer = saved?.id !== context.layoutId || saved?.revision > context.expectedRevision;
            if (saved?.status === 'draft' && saved.layoutName === name && newer
                && (!context.storeId || saved.storeId === context.storeId)
                && snapshotKey(saved.layoutData?.objects) === snapshotKey(objects)) return saved;
        } catch { /* Preserve the original failure and all local edits. */ }
        throw error;
    }
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
    const confirmedLocation = (saved) => {
        const item = saved?.locations.find((entry) => entry.productId === location.productId);
        if (saved?.id !== target.layoutId || !Number.isFinite(saved.revision) || !item
            || item.shelfObjectId !== location.shelfObjectId
            || ['floor', 'layerNumber', 'binNumber'].some((key) => location[key] !== undefined && Number(item[key]) !== Number(location[key]))) return null;
        return { ...item, layoutRevision: saved.revision };
    };
    try {
        const result = confirmedLocation(mapLayout(await command('assign', { ...target, location })));
        if (!result) throw new Error('The server did not confirm this product’s location. Reload the saved layout before retrying.');
        return result;
    } catch (error) {
        if (!['LOCATOR_SAVE_UNCONFIRMED', 'ECONNABORTED', 'ERR_NETWORK'].includes(error.code)) throw error;
        try {
            const saved = await loadStoreLayout('', { layoutId: target.layoutId });
            const result = confirmedLocation(saved);
            if (result && saved.revision > target.expectedRevision) return result;
        } catch { /* Keep the original error; never replay an unconfirmed write. */ }
        throw error;
    }
}
export async function removeProductLocation(productId, context) {
    if (!productId || !context?.layoutId || !Number.isFinite(context.expectedRevision)) {
        throw new Error('Load the saved stockroom before removing a product location.');
    }
    const confirmedRemoval = (saved) => saved?.id === context.layoutId
        && saved.revision > context.expectedRevision
        && !saved.locations.some((entry) => String(entry.productId) === String(productId));
    try {
        const saved = mapLayout(await command('unassign', { ...context, productId }));
        if (!confirmedRemoval(saved)) throw new Error('The server did not confirm that this location was removed. Refresh the stockroom before retrying.');
        return saved;
    } catch (error) {
        if (!['LOCATOR_SAVE_UNCONFIRMED', 'ECONNABORTED', 'ERR_NETWORK'].includes(error.code)) throw error;
        try {
            const saved = await loadStoreLayout('', { layoutId: context.layoutId });
            if (confirmedRemoval(saved)) return saved;
        } catch { /* An interrupted response does not mean the write failed. */ }
        throw error;
    }
}
export async function getProductLocations(name = '', options = { publishedOnly: true }) {
    return (await loadStoreLayout(name, options))?.locations || [];
}
export async function getProductLocation(productId) {
    if (!productId) return null;
    return (await getProductLocations()).find((item) => item.productId === productId) || null;
}

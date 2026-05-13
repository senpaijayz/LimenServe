import { supabase } from '../../../services/supabase';
import { LOCATOR_LAYOUT_NAME } from '../data/locatorScene';

const LAYOUT_SELECT = 'id, layout_name, layout_data, updated_at';
const PRODUCT_LOCATION_SELECT = 'product_id, product_name, sku, aisle, shelf_number, bin_number, floor, shelf_object_id, updated_at';

function assertSupabaseResult({ error }, fallbackMessage) {
    if (error) {
        throw new Error(error.message || fallbackMessage);
    }
}

function mapLayoutRow(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        layoutData: row.layout_data,
        layoutName: row.layout_name,
        updatedAt: row.updated_at,
    };
}

export function mapProductLocationRow(row) {
    if (!row) {
        return null;
    }

    return {
        aisle: row.aisle,
        binNumber: Number(row.bin_number),
        floor: Number(row.floor || 1),
        productId: row.product_id,
        productName: row.product_name || '',
        shelfNumber: Number(row.shelf_number),
        shelfObjectId: row.shelf_object_id || '',
        sku: row.sku || '',
        updatedAt: row.updated_at,
    };
}

export async function saveStoreLayout(sceneObjects, layoutName = LOCATOR_LAYOUT_NAME) {
    const payload = {
        layout_data: {
            objects: sceneObjects,
            savedAt: new Date().toISOString(),
            version: 1,
        },
        layout_name: layoutName,
    };

    const result = await supabase
        .from('store_layouts')
        .upsert(payload, { onConflict: 'layout_name' })
        .select(LAYOUT_SELECT)
        .single();

    assertSupabaseResult(result, 'Unable to save 3D layout.');

    return mapLayoutRow(result.data);
}

export async function loadStoreLayout(layoutName = LOCATOR_LAYOUT_NAME) {
    const result = await supabase
        .from('store_layouts')
        .select(LAYOUT_SELECT)
        .eq('layout_name', layoutName)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

    if (result.error?.code === 'PGRST116') {
        return null;
    }

    assertSupabaseResult(result, 'Unable to load 3D layout.');

    return mapLayoutRow(result.data);
}

export async function listStoreLayouts() {
    const result = await supabase
        .from('store_layouts')
        .select(LAYOUT_SELECT)
        .order('updated_at', { ascending: false });

    assertSupabaseResult(result, 'Unable to load saved 3D layouts.');

    return (result.data || []).map(mapLayoutRow);
}

export async function assignProductLocation(location) {
    const payload = {
        aisle: location.aisle,
        bin_number: Number(location.binNumber),
        floor: Number(location.floor || 1),
        product_id: location.productId,
        product_name: location.productName || '',
        shelf_number: Number(location.shelfNumber),
        shelf_object_id: location.shelfObjectId || null,
        sku: location.sku || '',
    };

    const result = await supabase
        .from('product_locations')
        .upsert(payload, { onConflict: 'product_id' })
        .select(PRODUCT_LOCATION_SELECT)
        .single();

    assertSupabaseResult(result, 'Unable to assign product location.');

    return mapProductLocationRow(result.data);
}

export async function getProductLocation(productId) {
    if (!productId) {
        return null;
    }

    const result = await supabase
        .from('product_locations')
        .select(PRODUCT_LOCATION_SELECT)
        .eq('product_id', productId)
        .limit(1)
        .single();

    if (result.error?.code === 'PGRST116') {
        return null;
    }

    assertSupabaseResult(result, 'Unable to load product location.');

    return mapProductLocationRow(result.data);
}

export async function getProductLocations() {
    const result = await supabase
        .from('product_locations')
        .select(PRODUCT_LOCATION_SELECT)
        .order('updated_at', { ascending: false });

    assertSupabaseResult(result, 'Unable to load product locations.');

    return (result.data || []).map(mapProductLocationRow);
}

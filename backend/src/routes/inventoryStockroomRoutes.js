import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();
const APP_SCHEMA = 'app';
const CATALOG_SCHEMA = 'catalog';

function isSchemaOrTableMissing(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('schema cache')
    || message.includes('does not exist')
    || message.includes('invalid schema')
    || message.includes('schema must be one of')
    || message.includes('not included in the schema cache');
}

function appDb() {
  return supabaseAdmin.schema(APP_SCHEMA);
}

function catalogDb() {
  return supabaseAdmin.schema(CATALOG_SCHEMA);
}

function normalizeAisle(value) {
  const raw = String(value || 'A').trim().toUpperCase();
  const letter = raw.match(/[A-Z]/)?.[0] || 'A';
  return letter;
}

function toPositiveInteger(value, fallback = 1, max = 99) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function normalizeBin(value) {
  const raw = String(value || 'Left').trim();
  if (!raw) return 'Left';
  const lower = raw.toLowerCase();
  if (['left', 'l', '1'].includes(lower)) return 'Left';
  if (['center', 'middle', 'c', '2'].includes(lower)) return 'Center';
  if (['right', 'r', '3'].includes(lower)) return 'Right';
  return raw.slice(0, 40);
}

function binToNumber(bin) {
  const normalized = normalizeBin(bin).toLowerCase();
  if (normalized === 'center') return 2;
  if (normalized === 'right') return 3;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 9)) : 1;
}

function normalizeLocationPayload(body = {}) {
  const aisle = normalizeAisle(body.aisle);
  const shelfNumber = toPositiveInteger(body.shelfNumber ?? body.shelf_number ?? body.shelf, 1, 60);
  const level = toPositiveInteger(body.level, 1, 12);
  const bin = normalizeBin(body.bin);
  const binNumber = toPositiveInteger(body.binNumber ?? body.bin_number ?? binToNumber(bin), binToNumber(bin), 24);

  return {
    aisle,
    shelfNumber,
    level,
    bin,
    binNumber,
    label: `Aisle ${aisle} • Shelf ${shelfNumber} • Bin ${bin}`,
  };
}

function normalizeShelfPayload(body = {}) {
  const location = normalizeLocationPayload(body);
  return {
    ...location,
    capacity: toPositiveInteger(body.capacity, 50, 9999),
    metadata: {
      ...(body.metadata ?? {}),
      editable: true,
    },
  };
}

function mapLayout(row) {
  if (!row) {
    return {
      id: null,
      name: 'Main Stockroom Layout',
      isActive: true,
      layoutData: {},
      updatedAt: null,
    };
  }

  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    layoutData: row.layout_data ?? {},
    updatedAt: row.updated_at ?? row.created_at ?? null,
  };
}

function mapShelf(row) {
  return {
    id: row.id,
    layoutId: row.layout_id,
    aisle: row.aisle,
    shelfNumber: row.shelf_number,
    level: row.level,
    binCount: row.bin_count,
    capacity: row.capacity,
    position: row.position ?? {},
    metadata: row.metadata ?? {},
    updatedAt: row.updated_at ?? null,
  };
}

function mapProductLocation(row) {
  return {
    productId: row.product_id,
    layoutId: row.layout_id ?? null,
    shelfId: row.shelf_id ?? null,
    aisle: row.aisle,
    shelfNumber: row.shelf_number,
    level: row.level,
    bin: row.bin,
    binNumber: row.bin_number,
    label: row.metadata?.label || `Aisle ${row.aisle} • Shelf ${row.shelf_number} • Bin ${row.bin}`,
    updatedAt: row.updated_at ?? null,
  };
}

async function safeAppQuery(description, operation, fallback) {
  try {
    const { data, error } = await operation();
    if (error) {
      if (isSchemaOrTableMissing(error)) {
        return fallback;
      }
      throw error;
    }
    return data;
  } catch (error) {
    if (isSchemaOrTableMissing(error)) {
      return fallback;
    }
    console.warn(`Stockroom bridge ${description} failed:`, error.message);
    throw error;
  }
}

async function getOrCreateActiveLayout() {
  const existing = await safeAppQuery(
    'active layout lookup',
    () => appDb()
      .from('stockroom_layouts')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    null,
  );

  if (existing) {
    return existing;
  }

  return safeAppQuery(
    'active layout create',
    () => appDb()
      .from('stockroom_layouts')
      .insert({
        name: 'Main Stockroom Layout',
        is_active: true,
        layout_data: { source: 'inventory-stockroom-bridge', version: 1 },
      })
      .select('*')
      .single(),
    null,
  );
}

async function upsertCatalogBalanceLocation(productId, location) {
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const { data: existing, error: fetchError } = await catalogDb()
    .from('inventory_balances')
    .select('product_id, on_hand, reserved, reorder_point, reorder_quantity, location')
    .eq('product_id', productId)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  const mergedLocation = {
    ...(existing?.location ?? {}),
    aisle: location.aisle,
    shelf: location.shelfNumber,
    shelfNumber: location.shelfNumber,
    level: location.level,
    bin: location.bin,
    binNumber: location.binNumber,
    label: location.label,
    source: 'inventory-stockroom',
    updatedAt: nowIso,
  };

  const { error: upsertError } = await catalogDb()
    .from('inventory_balances')
    .upsert({
      product_id: productId,
      on_hand: Number(existing?.on_hand ?? 0),
      reserved: Number(existing?.reserved ?? 0),
      reorder_point: Number(existing?.reorder_point ?? 0),
      reorder_quantity: Number(existing?.reorder_quantity ?? 0),
      location: mergedLocation,
      as_of_date: today,
      business_date: today,
      updated_at: nowIso,
    }, { onConflict: 'product_id' });

  if (upsertError) {
    throw upsertError;
  }

  return mergedLocation;
}

async function fetchProductLocations() {
  const bridgeRows = await safeAppQuery(
    'product location list',
    () => appDb()
      .from('product_locations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1000),
    [],
  );

  const { data: balanceRows, error: balanceError } = await catalogDb()
    .from('inventory_balances')
    .select('product_id, location, updated_at')
    .contains('location', { source: 'inventory-stockroom' })
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (balanceError) {
    throw balanceError;
  }

  const merged = new Map();
  (balanceRows ?? []).forEach((row) => {
    const location = row.location ?? {};
    merged.set(row.product_id, {
      product_id: row.product_id,
      layout_id: null,
      shelf_id: null,
      aisle: location.aisle,
      shelf_number: location.shelfNumber ?? location.shelf,
      level: location.level,
      bin: location.bin,
      bin_number: location.binNumber,
      metadata: { label: location.label },
      updated_at: row.updated_at,
    });
  });

  (bridgeRows ?? []).forEach((row) => {
    merged.set(row.product_id, row);
  });

  return [...merged.values()].map(mapProductLocation);
}

router.get('/active', requireRole('admin', 'stock_clerk'), async (_req, res, next) => {
  try {
    const [layout, shelves, productLocations] = await Promise.all([
      getOrCreateActiveLayout(),
      safeAppQuery(
        'shelf list',
        () => appDb()
          .from('shelves')
          .select('*')
          .order('aisle', { ascending: true })
          .order('shelf_number', { ascending: true })
          .order('level', { ascending: true }),
        [],
      ),
      fetchProductLocations(),
    ]);

    res.json({
      layout: mapLayout(layout),
      shelves: (shelves ?? []).map(mapShelf),
      productLocations,
      source: layout ? 'supabase' : 'fallback',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/layouts', requireRole('admin'), async (req, res, next) => {
  try {
    const name = String(req.body?.name || 'Main Stockroom Layout').trim();
    const layoutData = req.body?.layoutData ?? req.body?.layout_data ?? {};
    const shelves = Array.isArray(req.body?.shelves) ? req.body.shelves : [];
    const layout = await getOrCreateActiveLayout();

    if (!layout) {
      res.status(503).json({ error: 'Stockroom persistence tables are not ready. Run the stockroom bridge SQL first.' });
      return;
    }

    const { data: updatedLayout, error: layoutError } = await appDb()
      .from('stockroom_layouts')
      .update({
        name,
        layout_data: layoutData,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', layout.id)
      .select('*')
      .single();

    if (layoutError) {
      throw layoutError;
    }

    if (shelves.length > 0) {
      const shelfRows = shelves.map((shelf) => ({
        ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(shelf.id || '')) ? { id: shelf.id } : {}),
        layout_id: updatedLayout.id,
        aisle: normalizeAisle(shelf.aisle),
        shelf_number: toPositiveInteger(shelf.shelfNumber ?? shelf.shelf_number, 1, 60),
        level: toPositiveInteger(shelf.level, 1, 12),
        bin_count: toPositiveInteger(shelf.binCount ?? shelf.bin_count, 3, 24),
        capacity: toPositiveInteger(shelf.capacity, 50, 9999),
        position: shelf.position ?? {},
        metadata: shelf.metadata ?? {},
        updated_at: new Date().toISOString(),
      }));

      const { error: shelvesError } = await appDb()
        .from('shelves')
        .upsert(shelfRows, { onConflict: 'layout_id,aisle,shelf_number,level' });

      if (shelvesError) {
        throw shelvesError;
      }
    }

    res.json({ layout: mapLayout(updatedLayout) });
  } catch (error) {
    next(error);
  }
});

router.put('/shelves/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const layout = await getOrCreateActiveLayout();
    if (!layout) {
      res.status(503).json({ error: 'Stockroom shelf persistence is not ready. Run the stockroom bridge SQL first.' });
      return;
    }

    const shelf = normalizeShelfPayload(req.body);
    const id = String(req.params.id || '').trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    const shelfRow = {
      ...(isUuid ? { id } : {}),
      layout_id: layout.id,
      aisle: shelf.aisle,
      shelf_number: shelf.shelfNumber,
      level: shelf.level,
      bin_count: toPositiveInteger(req.body?.binCount ?? req.body?.bin_count, 3, 24),
      capacity: shelf.capacity,
      position: req.body?.position ?? {},
      metadata: shelf.metadata,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await appDb()
      .from('shelves')
      .upsert(shelfRow, { onConflict: isUuid ? 'id' : 'layout_id,aisle,shelf_number,level' })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.json({ shelf: mapShelf(data) });
  } catch (error) {
    next(error);
  }
});

router.post('/products/:id/location', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const productId = String(req.params.id || '').trim();
    const location = normalizeLocationPayload(req.body);

    if (!productId) {
      res.status(400).json({ error: 'Product is required.' });
      return;
    }

    const layout = await getOrCreateActiveLayout();
    let shelf = null;
    let productLocation = null;

    if (layout) {
      const shelfRows = await safeAppQuery(
        'location shelf upsert',
        () => appDb()
          .from('shelves')
          .upsert({
            layout_id: layout.id,
            aisle: location.aisle,
            shelf_number: location.shelfNumber,
            level: location.level,
            bin_count: 3,
            capacity: 50,
            position: {},
            metadata: { autoCreated: true },
            updated_at: new Date().toISOString(),
          }, { onConflict: 'layout_id,aisle,shelf_number,level' })
          .select('*')
          .limit(1),
        [],
      );
      shelf = Array.isArray(shelfRows) ? shelfRows[0] : shelfRows;

      const row = await safeAppQuery(
        'product location upsert',
        () => appDb()
          .from('product_locations')
          .upsert({
            product_id: productId,
            layout_id: layout.id,
            shelf_id: shelf?.id ?? null,
            aisle: location.aisle,
            shelf_number: location.shelfNumber,
            level: location.level,
            bin: location.bin,
            bin_number: location.binNumber,
            metadata: { label: location.label },
            updated_at: new Date().toISOString(),
          }, { onConflict: 'product_id' })
          .select('*')
          .single(),
        null,
      );
      productLocation = row ? mapProductLocation(row) : null;
    }

    const balanceLocation = await upsertCatalogBalanceLocation(productId, location);

    res.json({
      location: productLocation ?? {
        productId,
        layoutId: layout?.id ?? null,
        shelfId: shelf?.id ?? null,
        ...location,
      },
      catalogLocation: balanceLocation,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

import { supabaseAdmin } from '../config/supabase.js';
import { buildRouteResponse } from './stockroomRouting.js';

const STOCKROOM_CACHE_TTL_MS = 60 * 1000;
const snapshotCache = new Map();

function mapLayout(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    versionNumber: Number(row.version_number ?? 1),
    status: row.status,
    staircaseFloor1Anchor: row.staircase_floor_1_anchor ?? { x: 0, y: 0 },
    staircaseFloor2Anchor: row.staircase_floor_2_anchor ?? { x: 0, y: 0 },
    cameraSettings: row.camera_settings ?? {},
    metadata: row.metadata ?? {},
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFloor(row) {
  return {
    id: row.id,
    layoutId: row.layout_id,
    floorNumber: Number(row.floor_number),
    name: row.name,
    width: Number(row.width ?? 0),
    depth: Number(row.depth ?? 0),
    elevation: Number(row.elevation ?? 0),
    entryAnchor: row.entry_anchor ?? { x: 0, y: 0 },
    metadata: row.metadata ?? {},
  };
}

function mapZone(row) {
  return {
    id: row.id,
    layoutId: row.layout_id,
    floorId: row.floor_id,
    code: row.code,
    name: row.name,
    positionX: Number(row.position_x ?? 0),
    positionY: Number(row.position_y ?? 0),
    width: Number(row.width ?? 0),
    depth: Number(row.depth ?? 0),
    colorHex: row.color_hex,
    metadata: row.metadata ?? {},
  };
}

function mapAisle(row) {
  return {
    id: row.id,
    layoutId: row.layout_id,
    floorId: row.floor_id,
    zoneId: row.zone_id,
    code: row.code,
    name: row.name,
    startX: Number(row.start_x ?? 0),
    startY: Number(row.start_y ?? 0),
    endX: Number(row.end_x ?? 0),
    endY: Number(row.end_y ?? 0),
    walkwayWidth: Number(row.walkway_width ?? 0),
    metadata: row.metadata ?? {},
  };
}

function mapShelf(row) {
  return {
    id: row.id,
    layoutId: row.layout_id,
    floorId: row.floor_id,
    zoneId: row.zone_id,
    aisleId: row.aisle_id,
    code: row.code,
    name: row.name,
    shelfType: row.shelf_type,
    positionX: Number(row.position_x ?? 0),
    positionY: Number(row.position_y ?? 0),
    rotation: Number(row.rotation ?? 0),
    width: Number(row.width ?? 0),
    depth: Number(row.depth ?? 0),
    height: Number(row.height ?? 0),
    accessSide: row.access_side,
    metadata: row.metadata ?? {},
  };
}

function mapShelfLevel(row) {
  return {
    id: row.id,
    shelfId: row.shelf_id,
    levelNumber: Number(row.level_number),
    elevation: Number(row.elevation ?? 0),
    metadata: row.metadata ?? {},
  };
}

function mapShelfSlot(row) {
  return {
    id: row.id,
    shelfLevelId: row.shelf_level_id,
    slotNumber: Number(row.slot_number),
    slotLabel: row.slot_label,
    positionX: Number(row.position_x ?? 0),
    width: Number(row.width ?? 0),
    metadata: row.metadata ?? {},
  };
}

function mapItem(row) {
  return {
    productId: row.product_id,
    partCode: row.part_code,
    keywords: row.keywords ?? [],
    isActive: Boolean(row.is_active),
    metadata: row.metadata ?? {},
  };
}

function mapItemLocation(row) {
  return {
    id: row.id,
    layoutId: row.layout_id,
    itemId: row.item_id,
    floorId: row.floor_id,
    zoneId: row.zone_id,
    aisleId: row.aisle_id,
    shelfId: row.shelf_id,
    shelfLevelId: row.shelf_level_id,
    shelfSlotId: row.shelf_slot_id,
    isActive: Boolean(row.is_active),
    routeHint: row.route_hint ?? {},
  };
}

function mapProduct(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    modelName: row.model_name,
    category: row.category,
    brand: row.brand,
    status: row.status,
    isActive: Boolean(row.is_active),
    metadata: row.metadata ?? {},
  };
}

function mapInventory(row) {
  return {
    productId: row.product_id,
    onHand: Number(row.on_hand ?? 0),
    reserved: Number(row.reserved ?? 0),
    reorderPoint: Number(row.reorder_point ?? 0),
    reorderQuantity: Number(row.reorder_quantity ?? 0),
  };
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function arrayToKeywords(value) {
  return String(value ?? '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function extractSingle(data) {
  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
}

async function selectRows(table, queryBuilder) {
  let query = supabaseAdmin.schema('app').from(table).select('*');

  if (typeof queryBuilder === 'function') {
    query = queryBuilder(query);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function insertRow(table, payload) {
  const { data, error } = await supabaseAdmin.schema('app').from(table).insert(payload).select('*').single();
  if (error) {
    throw error;
  }
  return data;
}

async function updateRow(table, id, payload) {
  const { data, error } = await supabaseAdmin.schema('app').from(table).update(payload).eq('id', id).select('*').single();
  if (error) {
    throw error;
  }
  return data;
}

async function deleteRow(table, id) {
  const { error } = await supabaseAdmin.schema('app').from(table).delete().eq('id', id);
  if (error) {
    throw error;
  }
}

async function getLayoutRow({ layoutId = null, allowDraft = false } = {}) {
  if (layoutId) {
    const { data, error } = await supabaseAdmin.schema('app').from('layouts').select('*').eq('id', layoutId).single();
    if (error) {
      throw error;
    }
    return data;
  }

  const { data, error } = await supabaseAdmin.schema('app')
    .from('layouts')
    .select('*')
    .in('status', allowDraft ? ['published', 'draft'] : ['published'])
    .order('status', { ascending: true })
    .order('version_number', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const layout = extractSingle(data);
  if (layout) {
    return layout;
  }

  const { data: fallbackData, error: fallbackError } = await supabaseAdmin.schema('app')
    .from('layouts')
    .select('*')
    .order('version_number', { ascending: false })
    .limit(1);

  if (fallbackError) {
    throw fallbackError;
  }

  return extractSingle(fallbackData);
}

function buildSnapshotKey({ layoutId = 'published', allowDraft = false }) {
  return `${allowDraft ? 'draft' : 'published'}:${layoutId}`;
}

export function invalidateStockroomCache() {
  snapshotCache.clear();
}

export async function getStockroomSnapshot({ layoutId = null, allowDraft = false, useCache = true } = {}) {
  const cacheKey = buildSnapshotKey({ layoutId: layoutId ?? 'current', allowDraft });
  const cached = snapshotCache.get(cacheKey);

  if (useCache && cached && (Date.now() - cached.fetchedAt) < STOCKROOM_CACHE_TTL_MS) {
    return cached.value;
  }

  const layoutRow = await getLayoutRow({ layoutId, allowDraft });
  if (!layoutRow) {
    return {
      store: null,
      layout: null,
      floors: [],
      zones: [],
      aisles: [],
      shelves: [],
      shelfLevels: [],
      shelfSlots: [],
      items: [],
      itemLocations: [],
      inventory: [],
      products: [],
      adminUsers: [],
    };
  }

  const [
    storeRows,
    floorRows,
    zoneRows,
    aisleRows,
    shelfRows,
    shelfLevelRows,
    shelfSlotRows,
    itemRows,
    itemLocationRows,
    productRows,
    inventoryRows,
    adminUserRows,
  ] = await Promise.all([
    selectRows('stores', (query) => query.eq('id', layoutRow.store_id).limit(1)),
    selectRows('floors', (query) => query.eq('layout_id', layoutRow.id).order('floor_number', { ascending: true })),
    selectRows('zones', (query) => query.eq('layout_id', layoutRow.id).order('code', { ascending: true })),
    selectRows('aisles', (query) => query.eq('layout_id', layoutRow.id).order('code', { ascending: true })),
    selectRows('shelves', (query) => query.eq('layout_id', layoutRow.id).order('code', { ascending: true })),
    selectRows('shelf_levels', (query) => query.order('level_number', { ascending: true })),
    selectRows('shelf_slots', (query) => query.order('slot_number', { ascending: true })),
    selectRows('items', (query) => query.order('product_id', { ascending: true })),
    selectRows('item_locations', (query) => query.eq('layout_id', layoutRow.id).eq('is_active', true)),
    selectRows('products', (query) => query.order('name', { ascending: true })),
    selectRows('inventory_balances', (query) => query.order('product_id', { ascending: true })),
    selectRows('admin_users', (query) => query.eq('store_id', layoutRow.store_id).eq('is_active', true)),
  ]);

  const shelvesInLayout = new Set(shelfRows.map((row) => row.id));
  const shelfLevels = shelfLevelRows.filter((row) => shelvesInLayout.has(row.shelf_id)).map(mapShelfLevel);
  const shelfLevelIds = new Set(shelfLevels.map((level) => level.id));
  const shelfSlots = shelfSlotRows.filter((row) => shelfLevelIds.has(row.shelf_level_id)).map(mapShelfSlot);
  const itemIdsInLayout = new Set(itemLocationRows.map((row) => row.item_id));

  const snapshot = {
    store: extractSingle(storeRows),
    layout: mapLayout(layoutRow),
    floors: floorRows.map(mapFloor),
    zones: zoneRows.map(mapZone),
    aisles: aisleRows.map(mapAisle),
    shelves: shelfRows.map(mapShelf),
    shelfLevels,
    shelfSlots,
    items: itemRows.filter((row) => itemIdsInLayout.has(row.product_id)).map(mapItem),
    itemLocations: itemLocationRows.map(mapItemLocation),
    inventory: inventoryRows.map(mapInventory),
    products: productRows.map(mapProduct),
    adminUsers: adminUserRows,
  };

  snapshotCache.set(cacheKey, {
    fetchedAt: Date.now(),
    value: snapshot,
  });

  return snapshot;
}

function buildEntityMaps(snapshot) {
  const floorById = new Map(snapshot.floors.map((floor) => [floor.id, floor]));
  const zoneById = new Map(snapshot.zones.map((zone) => [zone.id, zone]));
  const aisleById = new Map(snapshot.aisles.map((aisle) => [aisle.id, aisle]));
  const shelfById = new Map(snapshot.shelves.map((shelf) => [shelf.id, shelf]));
  const levelById = new Map(snapshot.shelfLevels.map((level) => [level.id, level]));
  const slotById = new Map(snapshot.shelfSlots.map((slot) => [slot.id, slot]));
  const productById = new Map(snapshot.products.map((product) => [product.id, product]));
  const inventoryByProductId = new Map(snapshot.inventory.map((inventory) => [inventory.productId, inventory]));
  const itemByProductId = new Map(snapshot.items.map((item) => [item.productId, item]));

  return {
    floorById,
    zoneById,
    aisleById,
    shelfById,
    levelById,
    slotById,
    productById,
    inventoryByProductId,
    itemByProductId,
  };
}

function buildSearchRecord({ snapshot, maps, itemLocation }) {
  const product = maps.productById.get(itemLocation.itemId);
  const item = maps.itemByProductId.get(itemLocation.itemId);
  const floor = maps.floorById.get(itemLocation.floorId);
  const zone = maps.zoneById.get(itemLocation.zoneId);
  const aisle = maps.aisleById.get(itemLocation.aisleId);
  const shelf = maps.shelfById.get(itemLocation.shelfId);
  const level = maps.levelById.get(itemLocation.shelfLevelId);
  const slot = maps.slotById.get(itemLocation.shelfSlotId);
  const inventory = maps.inventoryByProductId.get(itemLocation.itemId);

  if (!product || !item || !floor || !zone || !aisle || !shelf || !level || !slot) {
    return null;
  }

  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    modelName: product.modelName,
    category: product.category,
    brand: product.brand,
    partCode: item.partCode,
    keywords: item.keywords,
    quantity: inventory?.onHand ?? 0,
    floor: {
      id: floor.id,
      floorNumber: floor.floorNumber,
      name: floor.name,
    },
    zone: {
      id: zone.id,
      code: zone.code,
      name: zone.name,
    },
    aisle: {
      id: aisle.id,
      code: aisle.code,
      name: aisle.name,
    },
    shelf: {
      id: shelf.id,
      code: shelf.code,
      name: shelf.name,
      shelfType: shelf.shelfType,
      positionX: shelf.positionX,
      positionY: shelf.positionY,
      width: shelf.width,
    },
    level: {
      id: level.id,
      levelNumber: level.levelNumber,
      elevation: level.elevation,
    },
    slot: {
      id: slot.id,
      slotNumber: slot.slotNumber,
      slotLabel: slot.slotLabel,
      positionX: slot.positionX,
      width: slot.width,
    },
    layoutId: snapshot.layout?.id ?? null,
    itemLocationId: itemLocation.id,
  };
}

function matchRecord(query, record) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return null;
  }

  const sku = normalizeText(record.sku);
  const name = normalizeText(record.name);
  const partCode = normalizeText(record.partCode);
  const keywordText = normalizeText(record.keywords.join(' '));
  const modelName = normalizeText(record.modelName);

  if (sku === normalizedQuery) {
    return 'sku';
  }
  if (partCode && partCode === normalizedQuery) {
    return 'part_code';
  }
  if (name.includes(normalizedQuery)) {
    return 'item_name';
  }
  if (keywordText.includes(normalizedQuery) || modelName.includes(normalizedQuery)) {
    return 'keyword';
  }
  if (sku.includes(normalizedQuery)) {
    return 'sku_partial';
  }
  if (partCode.includes(normalizedQuery)) {
    return 'part_code_partial';
  }

  return null;
}

export function buildBootstrapResponse(snapshot, user) {
  const maps = buildEntityMaps(snapshot);
  const itemLocations = snapshot.itemLocations
    .map((itemLocation) => buildSearchRecord({ snapshot, maps, itemLocation }))
    .filter(Boolean);

  return {
    store: snapshot.store,
    activeLayout: snapshot.layout,
    floors: snapshot.floors,
    zones: snapshot.zones,
    aisles: snapshot.aisles,
    shelves: snapshot.shelves,
    shelfLevels: snapshot.shelfLevels,
    shelfSlots: snapshot.shelfSlots,
    itemLocations,
    permissions: {
      canManage: user?.role === 'admin',
      role: user?.role ?? 'anonymous',
    },
  };
}

export async function searchLocatorItems(query) {
  const snapshot = await getStockroomSnapshot();
  const maps = buildEntityMaps(snapshot);

  return snapshot.itemLocations
    .map((itemLocation) => buildSearchRecord({ snapshot, maps, itemLocation }))
    .filter(Boolean)
    .map((record) => ({
      ...record,
      matchedBy: matchRecord(query, record),
    }))
    .filter((record) => Boolean(record.matchedBy))
    .sort((left, right) => {
      if (left.matchedBy !== right.matchedBy) {
        return left.matchedBy.localeCompare(right.matchedBy);
      }
      return left.name.localeCompare(right.name);
    });
}

function buildTargetLocation(snapshot, productId) {
  const maps = buildEntityMaps(snapshot);
  const itemLocation = snapshot.itemLocations.find((location) => location.itemId === productId && location.isActive);
  if (!itemLocation) {
    return null;
  }

  const product = maps.productById.get(productId);
  const item = maps.itemByProductId.get(productId);
  const floor = maps.floorById.get(itemLocation.floorId);
  const zone = maps.zoneById.get(itemLocation.zoneId);
  const aisle = maps.aisleById.get(itemLocation.aisleId);
  const shelf = maps.shelfById.get(itemLocation.shelfId);
  const level = maps.levelById.get(itemLocation.shelfLevelId);
  const slot = maps.slotById.get(itemLocation.shelfSlotId);
  const inventory = maps.inventoryByProductId.get(productId);

  if (!product || !item || !floor || !zone || !aisle || !shelf || !level || !slot) {
    return null;
  }

  return {
    product,
    item,
    floor,
    zone,
    aisle,
    shelf,
    level,
    slot,
    quantity: inventory?.onHand ?? 0,
  };
}

export async function getItemRouteDetails(productId, currentFloor = 1) {
  const snapshot = await getStockroomSnapshot();
  const targetLocation = buildTargetLocation(snapshot, productId);

  if (!targetLocation) {
    return null;
  }

  const route = buildRouteResponse({
    snapshot: {
      layout: {
        staircase_floor_1_anchor: snapshot.layout?.staircaseFloor1Anchor,
        staircase_floor_2_anchor: snapshot.layout?.staircaseFloor2Anchor,
      },
      floors: snapshot.floors.map((floor) => ({
        id: floor.id,
        floor_number: floor.floorNumber,
        entry_anchor: floor.entryAnchor,
      })),
      aisles: snapshot.aisles.map((aisle) => ({
        id: aisle.id,
        floor_id: aisle.floorId,
        start_x: aisle.startX,
        start_y: aisle.startY,
        end_x: aisle.endX,
        end_y: aisle.endY,
      })),
      shelves: snapshot.shelves.map((shelf) => ({
        id: shelf.id,
        floor_id: shelf.floorId,
        aisle_id: shelf.aisleId,
        position_x: shelf.positionX,
        position_y: shelf.positionY,
        width: shelf.width,
      })),
    },
    currentFloorNumber: Number(currentFloor),
    targetLocation: {
      floor: { id: targetLocation.floor.id, floor_number: targetLocation.floor.floorNumber },
      shelf: {
        id: targetLocation.shelf.id,
        code: targetLocation.shelf.code,
        position_x: targetLocation.shelf.positionX,
        position_y: targetLocation.shelf.positionY,
        width: targetLocation.shelf.width,
      },
      level: {
        id: targetLocation.level.id,
        level_number: targetLocation.level.levelNumber,
      },
      slot: {
        id: targetLocation.slot.id,
        slot_number: targetLocation.slot.slotNumber,
        position_x: targetLocation.slot.positionX,
        width: targetLocation.slot.width,
      },
    },
  });

  return {
    item: {
      productId: targetLocation.product.id,
      sku: targetLocation.product.sku,
      name: targetLocation.product.name,
      partCode: targetLocation.item.partCode,
      keywords: targetLocation.item.keywords,
      quantity: targetLocation.quantity,
    },
    location: {
      floor: targetLocation.floor,
      zone: targetLocation.zone,
      aisle: targetLocation.aisle,
      shelf: targetLocation.shelf,
      level: targetLocation.level,
      slot: targetLocation.slot,
    },
    ...route,
  };
}

const DEFAULT_SLOT_COUNT = 4;

async function syncShelfStructure(shelfRow) {
  const desiredLevelCount = shelfRow.shelf_type === '2_level' ? 2 : 4;
  const existingLevels = await selectRows('shelf_levels', (query) => query.eq('shelf_id', shelfRow.id).order('level_number', { ascending: true }));

  for (let levelNumber = 1; levelNumber <= desiredLevelCount; levelNumber += 1) {
    if (!existingLevels.some((level) => Number(level.level_number) === levelNumber)) {
      await insertRow('shelf_levels', {
        shelf_id: shelfRow.id,
        level_number: levelNumber,
        elevation: shelfRow.shelf_type === '2_level' ? 0.55 + ((levelNumber - 1) * 0.55) : 0.35 + ((levelNumber - 1) * 0.45),
        metadata: { generatedBy: 'stockroom-api' },
      });
    }
  }

  const refreshedLevels = await selectRows('shelf_levels', (query) => query.eq('shelf_id', shelfRow.id).order('level_number', { ascending: true }));
  const extraLevels = refreshedLevels.filter((level) => Number(level.level_number) > desiredLevelCount);

  for (const level of extraLevels) {
    await deleteRow('shelf_levels', level.id);
  }

  const finalLevels = await selectRows('shelf_levels', (query) => query.eq('shelf_id', shelfRow.id).order('level_number', { ascending: true }));
  for (const level of finalLevels) {
    const slots = await selectRows('shelf_slots', (query) => query.eq('shelf_level_id', level.id).order('slot_number', { ascending: true }));
    for (let slotNumber = 1; slotNumber <= DEFAULT_SLOT_COUNT; slotNumber += 1) {
      if (!slots.some((slot) => Number(slot.slot_number) === slotNumber)) {
        await insertRow('shelf_slots', {
          shelf_level_id: level.id,
          slot_number: slotNumber,
          slot_label: `Slot ${slotNumber}`,
          position_x: (slotNumber - 1) * 0.55,
          width: 0.52,
          metadata: { generatedBy: 'stockroom-api' },
        });
      }
    }
  }
}

async function cloneLayoutStructure(sourceLayoutId, targetLayoutId) {
  const sourceSnapshot = await getStockroomSnapshot({ layoutId: sourceLayoutId, allowDraft: true, useCache: false });
  const floorIdMap = new Map();
  const zoneIdMap = new Map();
  const aisleIdMap = new Map();
  const shelfIdMap = new Map();
  const levelIdMap = new Map();
  const slotIdMap = new Map();

  for (const floor of sourceSnapshot.floors) {
    const inserted = await insertRow('floors', {
      layout_id: targetLayoutId,
      floor_number: floor.floorNumber,
      name: floor.name,
      width: floor.width,
      depth: floor.depth,
      elevation: floor.elevation,
      entry_anchor: floor.entryAnchor,
      metadata: floor.metadata,
    });
    floorIdMap.set(floor.id, inserted.id);
  }

  for (const zone of sourceSnapshot.zones) {
    const inserted = await insertRow('zones', {
      layout_id: targetLayoutId,
      floor_id: floorIdMap.get(zone.floorId),
      code: zone.code,
      name: zone.name,
      position_x: zone.positionX,
      position_y: zone.positionY,
      width: zone.width,
      depth: zone.depth,
      color_hex: zone.colorHex,
      metadata: zone.metadata,
    });
    zoneIdMap.set(zone.id, inserted.id);
  }

  for (const aisle of sourceSnapshot.aisles) {
    const inserted = await insertRow('aisles', {
      layout_id: targetLayoutId,
      floor_id: floorIdMap.get(aisle.floorId),
      zone_id: zoneIdMap.get(aisle.zoneId),
      code: aisle.code,
      name: aisle.name,
      start_x: aisle.startX,
      start_y: aisle.startY,
      end_x: aisle.endX,
      end_y: aisle.endY,
      walkway_width: aisle.walkwayWidth,
      metadata: aisle.metadata,
    });
    aisleIdMap.set(aisle.id, inserted.id);
  }

  for (const shelf of sourceSnapshot.shelves) {
    const inserted = await insertRow('shelves', {
      layout_id: targetLayoutId,
      floor_id: floorIdMap.get(shelf.floorId),
      zone_id: zoneIdMap.get(shelf.zoneId),
      aisle_id: aisleIdMap.get(shelf.aisleId),
      code: shelf.code,
      name: shelf.name,
      shelf_type: shelf.shelfType,
      position_x: shelf.positionX,
      position_y: shelf.positionY,
      rotation: shelf.rotation,
      width: shelf.width,
      depth: shelf.depth,
      height: shelf.height,
      access_side: shelf.accessSide,
      metadata: shelf.metadata,
    });
    shelfIdMap.set(shelf.id, inserted.id);
  }

  for (const level of sourceSnapshot.shelfLevels) {
    const inserted = await insertRow('shelf_levels', {
      shelf_id: shelfIdMap.get(level.shelfId),
      level_number: level.levelNumber,
      elevation: level.elevation,
      metadata: level.metadata,
    });
    levelIdMap.set(level.id, inserted.id);
  }

  for (const slot of sourceSnapshot.shelfSlots) {
    const inserted = await insertRow('shelf_slots', {
      shelf_level_id: levelIdMap.get(slot.shelfLevelId),
      slot_number: slot.slotNumber,
      slot_label: slot.slotLabel,
      position_x: slot.positionX,
      width: slot.width,
      metadata: slot.metadata,
    });
    slotIdMap.set(slot.id, inserted.id);
  }

  for (const itemLocation of sourceSnapshot.itemLocations) {
    await insertRow('item_locations', {
      layout_id: targetLayoutId,
      item_id: itemLocation.itemId,
      floor_id: floorIdMap.get(itemLocation.floorId),
      zone_id: zoneIdMap.get(itemLocation.zoneId),
      aisle_id: aisleIdMap.get(itemLocation.aisleId),
      shelf_id: shelfIdMap.get(itemLocation.shelfId),
      shelf_level_id: levelIdMap.get(itemLocation.shelfLevelId),
      shelf_slot_id: slotIdMap.get(itemLocation.shelfSlotId),
      is_active: itemLocation.isActive,
      route_hint: itemLocation.routeHint,
    });
  }
}

export async function listStockroomLayouts() {
  const rows = await selectRows('layouts', (query) => query.order('version_number', { ascending: false }));
  return rows.map(mapLayout);
}

export async function createLayoutVersion({ name, userId, sourceLayoutId = null }) {
  const sourceLayout = sourceLayoutId
    ? await getLayoutRow({ layoutId: sourceLayoutId, allowDraft: true })
    : await getLayoutRow({ allowDraft: true });

  if (!sourceLayout) {
    throw new Error('No source layout is available to clone.');
  }

  const layoutRows = await selectRows('layouts', (query) => query.eq('store_id', sourceLayout.store_id).order('version_number', { ascending: false }).limit(1));
  const latestVersion = Number(extractSingle(layoutRows)?.version_number ?? sourceLayout.version_number ?? 1);

  const newLayout = await insertRow('layouts', {
    store_id: sourceLayout.store_id,
    name: name || `Layout v${latestVersion + 1}`,
    version_number: latestVersion + 1,
    status: 'draft',
    staircase_floor_1_anchor: sourceLayout.staircase_floor_1_anchor,
    staircase_floor_2_anchor: sourceLayout.staircase_floor_2_anchor,
    camera_settings: sourceLayout.camera_settings ?? {},
    metadata: sourceLayout.metadata ?? {},
    created_by: userId ?? null,
  });

  await cloneLayoutStructure(sourceLayout.id, newLayout.id);
  invalidateStockroomCache();
  return mapLayout(newLayout);
}

export async function updateLayoutMetadata(layoutId, payload) {
  const updated = await updateRow('layouts', layoutId, {
    name: payload.name,
    staircase_floor_1_anchor: payload.staircaseFloor1Anchor,
    staircase_floor_2_anchor: payload.staircaseFloor2Anchor,
    camera_settings: payload.cameraSettings ?? {},
    metadata: payload.metadata ?? {},
  });
  invalidateStockroomCache();
  return mapLayout(updated);
}

export async function publishLayout(layoutId) {
  const layout = await getLayoutRow({ layoutId, allowDraft: true });
  if (!layout) {
    throw new Error('Layout not found.');
  }

  const { error: archiveError } = await supabaseAdmin.schema('app')
    .from('layouts')
    .update({ status: 'archived' })
    .eq('store_id', layout.store_id)
    .eq('status', 'published')
    .neq('id', layoutId);

  if (archiveError) {
    throw archiveError;
  }

  const updated = await updateRow('layouts', layoutId, { status: 'published' });
  invalidateStockroomCache();
  return mapLayout(updated);
}

export async function createZone(payload) {
  const row = await insertRow('zones', {
    layout_id: payload.layoutId,
    floor_id: payload.floorId,
    code: payload.code,
    name: payload.name,
    position_x: payload.positionX,
    position_y: payload.positionY,
    width: payload.width,
    depth: payload.depth,
    color_hex: payload.colorHex ?? '#2563eb',
    metadata: payload.metadata ?? {},
  });
  invalidateStockroomCache();
  return mapZone(row);
}

export async function updateZone(zoneId, payload) {
  const row = await updateRow('zones', zoneId, {
    floor_id: payload.floorId,
    code: payload.code,
    name: payload.name,
    position_x: payload.positionX,
    position_y: payload.positionY,
    width: payload.width,
    depth: payload.depth,
    color_hex: payload.colorHex ?? '#2563eb',
    metadata: payload.metadata ?? {},
  });
  invalidateStockroomCache();
  return mapZone(row);
}

export async function removeZone(zoneId) {
  await deleteRow('zones', zoneId);
  invalidateStockroomCache();
}

export async function createAisle(payload) {
  const row = await insertRow('aisles', {
    layout_id: payload.layoutId,
    floor_id: payload.floorId,
    zone_id: payload.zoneId,
    code: payload.code,
    name: payload.name,
    start_x: payload.startX,
    start_y: payload.startY,
    end_x: payload.endX,
    end_y: payload.endY,
    walkway_width: payload.walkwayWidth,
    metadata: payload.metadata ?? {},
  });
  invalidateStockroomCache();
  return mapAisle(row);
}

export async function updateAisle(aisleId, payload) {
  const row = await updateRow('aisles', aisleId, {
    floor_id: payload.floorId,
    zone_id: payload.zoneId,
    code: payload.code,
    name: payload.name,
    start_x: payload.startX,
    start_y: payload.startY,
    end_x: payload.endX,
    end_y: payload.endY,
    walkway_width: payload.walkwayWidth,
    metadata: payload.metadata ?? {},
  });
  invalidateStockroomCache();
  return mapAisle(row);
}

export async function removeAisle(aisleId) {
  await deleteRow('aisles', aisleId);
  invalidateStockroomCache();
}

export async function createShelf(payload) {
  const row = await insertRow('shelves', {
    layout_id: payload.layoutId,
    floor_id: payload.floorId,
    zone_id: payload.zoneId,
    aisle_id: payload.aisleId,
    code: payload.code,
    name: payload.name,
    shelf_type: payload.shelfType,
    position_x: payload.positionX,
    position_y: payload.positionY,
    rotation: payload.rotation ?? 0,
    width: payload.width ?? 2.2,
    depth: payload.depth ?? 0.9,
    height: payload.height ?? (payload.shelfType === '2_level' ? 1.45 : 2.4),
    access_side: payload.accessSide ?? 'front',
    metadata: payload.metadata ?? {},
  });

  await syncShelfStructure(row);
  invalidateStockroomCache();
  return mapShelf(row);
}

export async function updateShelf(shelfId, payload) {
  const row = await updateRow('shelves', shelfId, {
    floor_id: payload.floorId,
    zone_id: payload.zoneId,
    aisle_id: payload.aisleId,
    code: payload.code,
    name: payload.name,
    shelf_type: payload.shelfType,
    position_x: payload.positionX,
    position_y: payload.positionY,
    rotation: payload.rotation ?? 0,
    width: payload.width ?? 2.2,
    depth: payload.depth ?? 0.9,
    height: payload.height ?? (payload.shelfType === '2_level' ? 1.45 : 2.4),
    access_side: payload.accessSide ?? 'front',
    metadata: payload.metadata ?? {},
  });

  await syncShelfStructure(row);
  invalidateStockroomCache();
  return mapShelf(row);
}

export async function removeShelf(shelfId) {
  await deleteRow('shelves', shelfId);
  invalidateStockroomCache();
}

export async function updateItemMaster(productId, payload) {
  const { data, error } = await supabaseAdmin.schema('app')
    .from('items')
    .upsert({
      product_id: productId,
      part_code: payload.partCode,
      keywords: payload.keywords ?? [],
      is_active: payload.isActive ?? true,
      metadata: payload.metadata ?? {},
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  invalidateStockroomCache();
  return mapItem(data);
}

export async function createOrUpdateItemLocation(payload) {
  const existingRows = await selectRows('item_locations', (query) => query.eq('layout_id', payload.layoutId).eq('item_id', payload.itemId).eq('is_active', true).limit(1));
  const existing = extractSingle(existingRows);

  if (existing) {
    const updated = await updateRow('item_locations', existing.id, {
      floor_id: payload.floorId,
      zone_id: payload.zoneId,
      aisle_id: payload.aisleId,
      shelf_id: payload.shelfId,
      shelf_level_id: payload.shelfLevelId,
      shelf_slot_id: payload.shelfSlotId,
      route_hint: payload.routeHint ?? {},
      is_active: true,
    });
    invalidateStockroomCache();
    return mapItemLocation(updated);
  }

  const inserted = await insertRow('item_locations', {
    layout_id: payload.layoutId,
    item_id: payload.itemId,
    floor_id: payload.floorId,
    zone_id: payload.zoneId,
    aisle_id: payload.aisleId,
    shelf_id: payload.shelfId,
    shelf_level_id: payload.shelfLevelId,
    shelf_slot_id: payload.shelfSlotId,
    route_hint: payload.routeHint ?? {},
    is_active: true,
  });

  invalidateStockroomCache();
  return mapItemLocation(inserted);
}

export async function deleteItemLocation(layoutId, itemId) {
  const { error } = await supabaseAdmin.schema('app')
    .from('item_locations')
    .delete()
    .eq('layout_id', layoutId)
    .eq('item_id', itemId);

  if (error) {
    throw error;
  }

  invalidateStockroomCache();
}

export async function listMasterItems(query = '', layoutId = null) {
  const snapshot = await getStockroomSnapshot({ layoutId, allowDraft: Boolean(layoutId) });
  const maps = buildEntityMaps(snapshot);
  const normalizedQuery = normalizeText(query);

  const items = snapshot.products.map((product) => {
    const item = maps.itemByProductId.get(product.id) ?? {
      productId: product.id,
      partCode: null,
      keywords: [],
      isActive: product.isActive,
      metadata: {},
    };
    const location = snapshot.itemLocations.find((candidate) => candidate.itemId === product.id && candidate.isActive);

    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      modelName: product.modelName,
      brand: product.brand,
      partCode: item.partCode,
      keywords: item.keywords,
      isActive: item.isActive,
      locationId: location?.id ?? null,
      floorId: location?.floorId ?? null,
      zoneId: location?.zoneId ?? null,
      aisleId: location?.aisleId ?? null,
      shelfId: location?.shelfId ?? null,
      shelfLevelId: location?.shelfLevelId ?? null,
      shelfSlotId: location?.shelfSlotId ?? null,
    };
  });

  if (!normalizedQuery) {
    return items.slice(0, 120);
  }

  return items.filter((item) => {
    const keywordText = normalizeText((item.keywords ?? []).join(' '));
    return [
      item.name,
      item.sku,
      item.partCode,
      item.category,
      item.modelName,
      keywordText,
    ].some((value) => normalizeText(value).includes(normalizedQuery));
  }).slice(0, 120);
}

export function parseKeywordsInput(value) {
  return Array.isArray(value) ? value.filter(Boolean) : arrayToKeywords(value);
}

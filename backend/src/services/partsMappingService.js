import { supabaseAdmin } from '../config/supabase.js';
import {
  createLayoutVersion,
  invalidateStockroomCache,
  publishLayout,
} from './stockroomService.js';
import { callRpc } from './supabaseRpc.js';

const DEFAULT_PARTS_MAPPING_SCENE = {
  objects: [],
};

const KIND_TO_PARTS_MAPPING_TYPE = {
  cashier_counter: 'counter',
  comfort_room: 'room',
  door: 'wall',
  floor: 'floor',
  entrance: 'entrance',
  label: 'label',
  parking: 'parking',
  room: 'room',
  shelf: 'shelf',
  shelf2: 'shelf2',
  signage: 'signage',
  stairs: 'stairs',
  table: 'table',
  wall: 'wall',
};

function stockroomDb() {
  return supabaseAdmin.schema('stockroom');
}

function isPrivateSchemaAccessError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('invalid schema')
    || message.includes('schema must be one of')
    || message.includes('not included in the schema cache');
}

function normalizeScenePayload(layoutData) {
  if (typeof layoutData !== 'string' || !layoutData.trim()) {
    return DEFAULT_PARTS_MAPPING_SCENE;
  }

  const parsed = JSON.parse(layoutData);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.objects)) {
    throw new Error('Layout data must be a JSON object with an objects array.');
  }

  return parsed;
}

function serializeScene(scene) {
  return JSON.stringify(scene ?? DEFAULT_PARTS_MAPPING_SCENE);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRotation(value) {
  const rotation = toNumber(value, 0);
  return Math.abs(rotation) > Math.PI * 2 ? (rotation * Math.PI) / 180 : rotation;
}

function normalizeSize(size, fallback = [1, 1, 1]) {
  if (Array.isArray(size)) {
    return [
      toNumber(size[0], fallback[0]),
      toNumber(size[1], fallback[1]),
      toNumber(size[2], fallback[2]),
    ];
  }

  if (size && typeof size === 'object') {
    return [
      toNumber(size.x ?? size.width, fallback[0]),
      toNumber(size.y ?? size.height, fallback[1]),
      toNumber(size.z ?? size.depth, fallback[2]),
    ];
  }

  return fallback;
}

function hasSceneObjects(scene) {
  return scene && typeof scene === 'object' && Array.isArray(scene.objects) && scene.objects.length > 0;
}

function getLayoutBounds(row, floors = []) {
  const primaryFloor = floors.find((floor) => Number(floor.floor_number) === 1) ?? floors[0];
  return {
    width: toNumber(primaryFloor?.width, 28),
    depth: toNumber(primaryFloor?.depth, 18),
  };
}

function toCenteredPosition(position, bounds) {
  return {
    x: toNumber(position?.x ?? position?.position_x, bounds.width / 2) - bounds.width / 2,
    z: toNumber(position?.y ?? position?.z ?? position?.position_y, bounds.depth / 2) - bounds.depth / 2,
  };
}

function parseAisleCode(value) {
  const match = String(value ?? '').toUpperCase().match(/[A-Z]+/);
  return match ? match[0] : undefined;
}

function parseShelfNumber(value) {
  const match = String(value ?? '').match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function mapSceneObject(object, row, floors, index = 0) {
  if (!object || typeof object !== 'object') {
    return null;
  }

  const type = KIND_TO_PARTS_MAPPING_TYPE[object.kind] ?? KIND_TO_PARTS_MAPPING_TYPE[object.type] ?? object.type;
  if (!type) {
    return null;
  }

  const bounds = getLayoutBounds(row, floors);
  const position = toCenteredPosition(object.position ?? object, bounds);

  return {
    id: String(object.id ?? `${type}-${index}`),
    type,
    x: position.x,
    z: position.z,
    rotation: normalizeRotation(object.rotation),
    floor: toNumber(object.floorNumber ?? object.floor, 1),
    label: String(object.label ?? type),
    size: normalizeSize(object.size, type === 'floor' ? [bounds.width, 0.2, bounds.depth] : [1, 1, 1]),
    color: object.color ?? object.style?.color,
    locked: Boolean(object.locked),
  };
}

function mapFloorObject(floor) {
  return {
    id: `floor-${floor.floor_number}`,
    type: 'floor',
    x: 0,
    z: 0,
    rotation: 0,
    floor: toNumber(floor.floor_number, 1),
    label: String(floor.name ?? `Floor ${floor.floor_number}`),
    size: [toNumber(floor.width, 28), 0.2, toNumber(floor.depth, 18)],
    locked: true,
  };
}

function mapShelfObject(shelf, bounds) {
  const position = toCenteredPosition({
    x: shelf.position_x,
    y: shelf.position_y,
  }, bounds);
  const shelfCode = shelf.code || shelf.name || 'Shelf';

  return {
    id: `shelf-${shelf.id}`,
    type: shelf.shelf_type === '2_level' ? 'shelf2' : 'shelf',
    x: position.x,
    z: position.z,
    rotation: normalizeRotation(shelf.rotation),
    floor: toNumber(shelf.floor_number ?? shelf.floorNumber ?? 1, 1),
    label: String(shelfCode),
    size: [
      toNumber(shelf.width, shelf.shelf_type === '2_level' ? 1.5 : 3),
      toNumber(shelf.height, shelf.shelf_type === '2_level' ? 1.2 : 3),
      toNumber(shelf.depth, shelf.shelf_type === '2_level' ? 0.8 : 1),
    ],
    aisle: parseAisleCode(shelfCode),
    shelfNum: parseShelfNumber(shelfCode),
    locked: true,
  };
}

function dedupeSceneObjects(objects) {
  const seen = new Set();
  return objects.filter((object) => {
    if (!object?.id || seen.has(object.id)) {
      return false;
    }
    seen.add(object.id);
    return true;
  });
}

function resolvePartsMappingScene(row, structuredRows = {}) {
  const metadata = row.metadata ?? {};
  if (hasSceneObjects(metadata.partsMappingScene)) {
    return {
      objects: metadata.partsMappingScene.objects.filter((object) => object && typeof object === 'object'),
    };
  }

  const floors = structuredRows.floors ?? [];
  const shelves = structuredRows.shelves ?? [];
  const bounds = getLayoutBounds(row, floors);
  const sceneObjects = Array.isArray(metadata.sceneObjects)
    ? metadata.sceneObjects.map((object, index) => mapSceneObject(object, row, floors, index)).filter(Boolean)
    : [];
  const floorObjects = floors.map(mapFloorObject);
  const shelfObjects = shelves.map((shelf) => mapShelfObject(shelf, bounds));
  const objects = dedupeSceneObjects([...floorObjects, ...sceneObjects, ...shelfObjects]);

  return objects.length > 0 ? { objects } : DEFAULT_PARTS_MAPPING_SCENE;
}

function mapLayout(row, structuredRows = {}) {
  const metadata = row.metadata ?? {};
  const scene = resolvePartsMappingScene(row, structuredRows);

  return {
    id: String(row.id),
    name: row.name,
    description: String(metadata.description ?? ''),
    layout_data: serializeScene(scene),
    is_default: row.status === 'published',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function requireSingle(resultPromise) {
  const { data, error } = await resultPromise;
  if (error) {
    throw error;
  }
  return data;
}

async function getLayoutRow(layoutId) {
  return requireSingle(
    stockroomDb()
      .from('layouts')
      .select('*')
      .eq('id', layoutId)
      .single()
  );
}

async function listLayoutRows() {
  const { data, error } = await stockroomDb()
    .from('layouts')
    .select('*')
    .order('status', { ascending: true })
    .order('version_number', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getStructuredRowsByLayoutId(layoutIds) {
  const rowsByLayoutId = new Map(layoutIds.map((id) => [id, { floors: [], shelves: [] }]));
  if (layoutIds.length === 0) {
    return rowsByLayoutId;
  }

  const [floorResult, shelfResult] = await Promise.all([
    stockroomDb()
      .from('floors')
      .select('*')
      .in('layout_id', layoutIds),
    stockroomDb()
      .from('shelves')
      .select('*')
      .in('layout_id', layoutIds),
  ]);

  if (floorResult.error) {
    throw floorResult.error;
  }

  if (shelfResult.error) {
    throw shelfResult.error;
  }

  const floorNumberById = new Map();

  for (const floor of floorResult.data ?? []) {
    const entry = rowsByLayoutId.get(floor.layout_id);
    if (entry) {
      entry.floors.push(floor);
      floorNumberById.set(floor.id, floor.floor_number);
    }
  }

  for (const shelf of shelfResult.data ?? []) {
    const entry = rowsByLayoutId.get(shelf.layout_id);
    if (entry) {
      entry.shelves.push({
        ...shelf,
        floor_number: floorNumberById.get(shelf.floor_id),
      });
    }
  }

  return rowsByLayoutId;
}

async function getSourceLayout() {
  const rows = await listLayoutRows();
  return rows.find((row) => row.status === 'published') ?? rows[0] ?? null;
}

async function ensureStoreId() {
  const { data, error } = await stockroomDb()
    .from('stores')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    throw error;
  }

  const existing = Array.isArray(data) ? data[0] : data;
  if (existing?.id) {
    return existing.id;
  }

  const inserted = await requireSingle(
    stockroomDb()
      .from('stores')
      .insert({
        code: 'MAIN',
        name: 'Main Store',
        description: 'Default stockroom store generated during parts-mapping migration.',
        metadata: {
          generatedBy: 'parts-mapping-service',
        },
      })
      .select('id')
      .single()
  );

  return inserted.id;
}

async function createInitialLayout({ name, description, scene }) {
  const storeId = await ensureStoreId();
  const inserted = await requireSingle(
    stockroomDb()
      .from('layouts')
      .insert({
        store_id: storeId,
        name: name || 'Main Layout',
        version_number: 1,
        status: 'published',
        staircase_floor_1_anchor: { x: -6, y: -6 },
        staircase_floor_2_anchor: { x: -6, y: -6 },
        camera_settings: {},
        metadata: {
          description: description ?? '',
          partsMappingScene: scene,
        },
      })
      .select('*')
      .single()
  );

  await stockroomDb()
    .from('floors')
    .insert([
      {
        layout_id: inserted.id,
        floor_number: 1,
        name: 'Ground Floor',
        width: 24,
        depth: 24,
        elevation: 0,
        entry_anchor: { x: 0, y: 8 },
        metadata: { generatedBy: 'parts-mapping-service' },
      },
      {
        layout_id: inserted.id,
        floor_number: 2,
        name: 'Upper Floor',
        width: 24,
        depth: 24,
        elevation: 3.2,
        entry_anchor: { x: -6, y: -6 },
        metadata: { generatedBy: 'parts-mapping-service' },
      },
    ]);

  invalidateStockroomCache();
  return inserted;
}

function buildUpdatedMetadata(row, { description, scene }) {
  return {
    ...(row.metadata ?? {}),
    ...(typeof description === 'string' ? { description } : {}),
    partsMappingScene: scene ?? row.metadata?.partsMappingScene ?? DEFAULT_PARTS_MAPPING_SCENE,
  };
}

async function updateLayoutRow(row, { name, description, scene }) {
  const updates = {
    updated_at: new Date().toISOString(),
    metadata: buildUpdatedMetadata(row, { description, scene }),
  };

  if (typeof name === 'string' && name.trim()) {
    updates.name = name.trim();
  }

  const updated = await requireSingle(
    stockroomDb()
      .from('layouts')
      .update(updates)
      .eq('id', row.id)
      .select('*')
      .single()
  );

  invalidateStockroomCache();
  return updated;
}

async function deleteLayoutChildren(layoutId) {
  const shelfRows = await requireSingle(
    stockroomDb()
      .from('shelves')
      .select('id')
      .eq('layout_id', layoutId)
  );
  const shelfIds = (shelfRows ?? []).map((row) => row.id);

  const levelRows = shelfIds.length > 0
    ? await requireSingle(
      stockroomDb()
        .from('shelf_levels')
        .select('id')
        .in('shelf_id', shelfIds)
    )
    : [];
  const levelIds = (levelRows ?? []).map((row) => row.id);

  if (levelIds.length > 0) {
    const { error: slotDeleteError } = await stockroomDb()
      .from('shelf_slots')
      .delete()
      .in('shelf_level_id', levelIds);
    if (slotDeleteError) {
      throw slotDeleteError;
    }
  }

  if (levelIds.length > 0) {
    const { error: levelDeleteError } = await stockroomDb()
      .from('shelf_levels')
      .delete()
      .in('id', levelIds);
    if (levelDeleteError) {
      throw levelDeleteError;
    }
  }

  const deleteByLayout = async (table) => {
    const { error } = await stockroomDb().from(table).delete().eq('layout_id', layoutId);
    if (error) {
      throw error;
    }
  };

  await deleteByLayout('item_locations');
  await deleteByLayout('shelves');
  await deleteByLayout('aisles');
  await deleteByLayout('zones');
  await deleteByLayout('floors');
}

export async function listPartsMappingLayouts() {
  try {
    const rows = await listLayoutRows();
    const structuredRows = await getStructuredRowsByLayoutId(rows.map((row) => row.id));
    return rows.map((row) => mapLayout(row, structuredRows.get(row.id)));
  } catch (error) {
    if (!isPrivateSchemaAccessError(error)) {
      throw error;
    }

    const layouts = await callRpc('limen_list_parts_mapping_layouts');
    return Array.isArray(layouts) ? layouts : [];
  }
}

export async function createPartsMappingLayout({ name, description, layoutData, isDefault = false }) {
  const scene = normalizeScenePayload(layoutData);
  const sourceLayout = await getSourceLayout();

  let row;
  if (!sourceLayout) {
    row = await createInitialLayout({ name, description, scene });
  } else {
    const createdLayout = await createLayoutVersion({
      name,
      userId: null,
      sourceLayoutId: sourceLayout.id,
    });
    const createdRow = await getLayoutRow(createdLayout.id);
    row = await updateLayoutRow(createdRow, {
      name,
      description,
      scene,
    });
  }

  if (isDefault) {
    await publishLayout(row.id);
    row = await getLayoutRow(row.id);
  }

  return mapLayout(row);
}

export async function updatePartsMappingLayout(layoutId, { name, description, layoutData }) {
  const row = await getLayoutRow(layoutId);
  const scene = typeof layoutData === 'string'
    ? normalizeScenePayload(layoutData)
    : row.metadata?.partsMappingScene ?? DEFAULT_PARTS_MAPPING_SCENE;

  const updated = await updateLayoutRow(row, {
    name,
    description,
    scene,
  });

  return mapLayout(updated);
}

export async function deletePartsMappingLayout(layoutId) {
  const row = await getLayoutRow(layoutId);
  if (row.status === 'published') {
    throw new Error('The published stockroom layout cannot be deleted.');
  }

  await deleteLayoutChildren(layoutId);

  const { error } = await stockroomDb().from('layouts').delete().eq('id', layoutId);
  if (error) {
    throw error;
  }

  invalidateStockroomCache();
}

export async function setPriorityPartsMappingLayout(layoutId) {
  await publishLayout(layoutId);
  const row = await getLayoutRow(layoutId);
  return mapLayout(row);
}

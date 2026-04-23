import { supabaseAdmin } from '../config/supabase.js';
import {
  createLayoutVersion,
  invalidateStockroomCache,
  publishLayout,
} from './stockroomService.js';

const DEFAULT_PARTS_MAPPING_SCENE = {
  objects: [],
};

function stockroomDb() {
  return supabaseAdmin.schema('stockroom');
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

function mapLayout(row) {
  const metadata = row.metadata ?? {};

  return {
    id: String(row.id),
    name: row.name,
    description: String(metadata.description ?? ''),
    layout_data: serializeScene(metadata.partsMappingScene),
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
  const rows = await listLayoutRows();
  return rows.map(mapLayout);
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

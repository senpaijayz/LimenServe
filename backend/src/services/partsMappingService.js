import { supabaseAdmin } from '../config/supabase.js';

function mapLayout(row) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    layout_data: row.layout_data,
    is_default: Boolean(row.is_default),
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

export async function listPartsMappingLayouts() {
  const rows = await requireSingle(
    supabaseAdmin
      .from('pm_layouts')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
  );

  return (rows ?? []).map(mapLayout);
}

export async function createPartsMappingLayout({ name, description, layoutData, isDefault = false }) {
  const row = await requireSingle(
    supabaseAdmin
      .from('pm_layouts')
      .insert({
        name,
        description,
        layout_data: layoutData,
        is_default: isDefault,
      })
      .select('*')
      .single()
  );

  return mapLayout(row);
}

export async function updatePartsMappingLayout(layoutId, { name, description, layoutData }) {
  const updates = {
    updated_at: new Date().toISOString(),
  };

  if (typeof name === 'string' && name.trim()) {
    updates.name = name.trim();
  }

  if (typeof description === 'string') {
    updates.description = description;
  }

  if (typeof layoutData === 'string') {
    updates.layout_data = layoutData;
  }

  const row = await requireSingle(
    supabaseAdmin
      .from('pm_layouts')
      .update(updates)
      .eq('id', layoutId)
      .select('*')
      .single()
  );

  return mapLayout(row);
}

export async function deletePartsMappingLayout(layoutId) {
  const { error } = await supabaseAdmin.from('pm_layouts').delete().eq('id', layoutId);
  if (error) {
    throw error;
  }
}

export async function setPriorityPartsMappingLayout(layoutId) {
  const unsetResult = await supabaseAdmin.from('pm_layouts').update({ is_default: false }).eq('is_default', true);
  if (unsetResult.error) {
    throw unsetResult.error;
  }

  const row = await requireSingle(
    supabaseAdmin
      .from('pm_layouts')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', layoutId)
      .select('*')
      .single()
  );

  return mapLayout(row);
}

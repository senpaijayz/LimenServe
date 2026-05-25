import { supabaseAdmin } from '../config/supabase.js';
import { callRpc } from './supabaseRpc.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_NAV_STATUSES = new Set(['draft', 'published', 'archived']);
const ALLOWED_NAV_GROUPS = new Set(['primary', 'footer_shop', 'footer_company']);

function normalizeJsonPayload(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  return value;
}

export async function getPublishedCmsSite() {
  const site = await callRpc('get_published_cms_site');
  return normalizeJsonPayload(site, {
    settings: {},
    navigation: [],
    announcements: [],
  });
}

export async function getPublishedCmsPage(slug) {
  const page = await callRpc('get_published_cms_page', {
    p_slug: slug,
  });

  return normalizeJsonPayload(page, null);
}

export async function listCmsPages() {
  const pages = await callRpc('cms_admin_list_pages');
  return Array.isArray(pages) ? pages : [];
}

export async function getCmsPage(slug) {
  const page = await callRpc('cms_admin_get_page', {
    p_slug: slug,
  });

  return normalizeJsonPayload(page, null);
}

export async function saveCmsPage(payload, actorId) {
  return callRpc('cms_admin_save_page', {
    p_payload: payload,
    p_actor_id: actorId || null,
  });
}

export async function saveCmsSiteSettings(payload, actorId) {
  return callRpc('cms_admin_save_site_settings', {
    p_payload: payload,
    p_actor_id: actorId || null,
  });
}

function normalizeActorId(actorId) {
  return UUID_PATTERN.test(String(actorId || '')) ? actorId : null;
}

function normalizeNavigationRow(item = {}, index = 0) {
  const label = String(item.label || '').trim() || 'Untitled link';
  const href = String(item.href || '').trim() || '/';
  const status = String(item.status || 'published').trim();
  const groupKey = String(item.groupKey || item.group_key || 'primary').trim();
  const sortOrder = Number.parseInt(item.sortOrder ?? item.sort_order ?? (index + 1) * 10, 10);
  const id = String(item.id || '').trim();

  if (!ALLOWED_NAV_STATUSES.has(status)) {
    const error = new Error(`Navigation link "${label}" has an invalid status.`);
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_NAV_GROUPS.has(groupKey)) {
    const error = new Error(`Navigation link "${label}" has an invalid group.`);
    error.statusCode = 400;
    throw error;
  }

  if (id && !UUID_PATTERN.test(id)) {
    const error = new Error(`Navigation link "${label}" has an invalid saved ID. Remove and add it again.`);
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(sortOrder)) {
    const error = new Error(`Navigation link "${label}" has an invalid order.`);
    error.statusCode = 400;
    throw error;
  }

  return {
    ...(id ? { id } : {}),
    label,
    href,
    group_key: groupKey,
    sort_order: sortOrder,
    is_visible: item.isVisible ?? item.is_visible ?? true,
    opens_new_tab: item.opensNewTab ?? item.opens_new_tab ?? false,
    status,
    metadata: item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? item.metadata : {},
  };
}

export async function saveCmsNavigation(payload, actorId) {
  if (!Array.isArray(payload)) {
    const error = new Error('Navigation payload must include a navigation array.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedActorId = normalizeActorId(actorId);
  const nowIso = new Date().toISOString();
  const rows = payload.map((item, index) => ({
    ...normalizeNavigationRow(item, index),
    updated_by: normalizedActorId,
    created_by: normalizedActorId,
    updated_at: nowIso,
  }));

  const { error: archiveError } = await supabaseAdmin
    .schema('cms')
    .from('navigation_links')
    .update({
      status: 'archived',
      updated_by: normalizedActorId,
      updated_at: nowIso,
    })
    .neq('status', 'archived');

  if (archiveError) {
    throw archiveError;
  }

  const existingRows = rows.filter((row) => row.id);
  const newRows = rows.filter((row) => !row.id);

  if (existingRows.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .schema('cms')
      .from('navigation_links')
      .upsert(existingRows, { onConflict: 'id' });

    if (upsertError) {
      throw upsertError;
    }
  }

  if (newRows.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .schema('cms')
      .from('navigation_links')
      .insert(newRows);

    if (insertError) {
      throw insertError;
    }
  }

  return getPublishedCmsSite();
}

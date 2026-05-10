import { callRpc } from './supabaseRpc.js';

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

export async function saveCmsNavigation(payload, actorId) {
  return callRpc('cms_admin_save_navigation', {
    p_payload: payload,
    p_actor_id: actorId || null,
  });
}

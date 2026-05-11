import apiClient, { cachedApiGet, clearApiClientCache, extractApiError } from './apiClient';

export async function getPublicCmsSite() {
  try {
    const { data } = await cachedApiGet('/public/cms/site');
    return data.site ?? { settings: {}, navigation: [], announcements: [] };
  } catch (error) {
    extractApiError(error, 'Failed to load website content.');
  }
}

export async function getPublicCmsPage(slug) {
  try {
    const { data } = await cachedApiGet(`/public/cms/pages/${encodeURIComponent(slug)}`);
    return data.page ?? null;
  } catch (error) {
    if (error?.response?.status === 404) {
      return null;
    }

    extractApiError(error, 'Failed to load page content.');
  }
}

export async function listCmsPages() {
  try {
    const { data } = await apiClient.get('/cms/pages');
    return data.pages ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load CMS pages.');
  }
}

export async function getCmsPage(slug) {
  try {
    const { data } = await apiClient.get(`/cms/pages/${encodeURIComponent(slug)}`);
    return data.page ?? null;
  } catch (error) {
    extractApiError(error, 'Failed to load CMS page.');
  }
}

export async function saveCmsPage(payload) {
  try {
    const method = payload?.slug ? 'put' : 'post';
    const url = payload?.slug ? `/cms/pages/${encodeURIComponent(payload.slug)}` : '/cms/pages';
    const { data } = await apiClient[method](url, payload);
    clearApiClientCache((key) => key.startsWith('/public/cms/'));
    return data.page;
  } catch (error) {
    extractApiError(error, 'Failed to save CMS page.');
  }
}

export async function saveCmsSiteSettings(payload) {
  try {
    const { data } = await apiClient.put('/cms/site-settings', payload);
    clearApiClientCache((key) => key.startsWith('/public/cms/'));
    return data.site;
  } catch (error) {
    extractApiError(error, 'Failed to save site settings.');
  }
}

export async function saveCmsNavigation(navigation) {
  try {
    const { data } = await apiClient.put('/cms/navigation', { navigation });
    clearApiClientCache((key) => key.startsWith('/public/cms/'));
    return data.site;
  } catch (error) {
    extractApiError(error, 'Failed to save navigation.');
  }
}

export async function uploadCmsImage({ dataUrl, fileName, folder = 'general' }) {
  try {
    const { data } = await apiClient.post('/cms/media', {
      dataUrl,
      fileName,
      folder,
    });

    return data.asset;
  } catch (error) {
    extractApiError(error, 'Failed to upload image.');
  }
}

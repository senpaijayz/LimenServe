import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { getFreshAccessToken } from './supabase';

export const DEFAULT_API_TIMEOUT_MS = 30000;
export const STOCKROOM_API_TIMEOUT_MS = 15000;
export const INVENTORY_API_TIMEOUT_MS = 25000;
export const PRICE_LIST_UPLOAD_TIMEOUT_MS = 180000;
export const REQUEST_TIMEOUT_MESSAGE = 'The request took too long to finish. Please try again.';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_API_TIMEOUT_MS,
});

export const SERVICE_UNAVAILABLE_MESSAGE = 'Server temporarily unavailable. The backend service is not responding right now. Please try again in a few minutes.';
export const DATA_SERVICE_CONFIGURATION_MESSAGE = 'This live data area is being updated. Please refresh in a moment or try again after deployment finishes.';

const CLIENT_GET_CACHE_MAX_ENTRIES = 120;
const publicGetCacheRules = [
  { pattern: /^\/public\/cms\/site$/, ttlMs: 60_000 },
  { pattern: /^\/public\/cms\/pages\/[^/]+$/, ttlMs: 60_000 },
  { pattern: /^\/public\/mechanics$/, ttlMs: 120_000 },
  { pattern: /^\/catalog\/vehicle-fitment\/options$/, ttlMs: 10 * 60_000 },
  { pattern: /^\/catalog\/vehicle-packages$/, ttlMs: 5 * 60_000 },
  { pattern: /^\/catalog\/services$/, ttlMs: 5 * 60_000 },
  { pattern: /^\/catalog\/products$/, ttlMs: 2 * 60_000 },
  { pattern: /^\/catalog\/products\/[^/]+\/recommendations$/, ttlMs: 5 * 60_000 },
];

const getResponseCache = new Map();
const getInflightRequests = new Map();

function normalizeRequestPath(url = '') {
  const value = String(url || '');

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      return parsed.pathname.replace(/^\/api(?=\/)/, '') || '/';
    } catch {
      return value.split('?')[0];
    }
  }

  return value.split('?')[0].replace(/^\/api(?=\/)/, '') || '/';
}

function getPublicGetCacheRule(config = {}) {
  if (String(config.method || 'get').toLowerCase() !== 'get') {
    return null;
  }

  const path = normalizeRequestPath(config.url);
  return publicGetCacheRules.find((rule) => rule.pattern.test(path)) ?? null;
}

function normalizeParams(params = {}) {
  return Object.keys(params || {})
    .sort()
    .reduce((result, key) => {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        result[key] = value;
      }
      return result;
    }, {});
}

function buildClientCacheKey(url, config = {}) {
  return `${normalizeRequestPath(url)}:${JSON.stringify(normalizeParams(config.params))}`;
}

function trimClientGetCache() {
  while (getResponseCache.size > CLIENT_GET_CACHE_MAX_ENTRIES) {
    const oldestKey = getResponseCache.keys().next().value;
    getResponseCache.delete(oldestKey);
  }
}

function isPublicGetWithoutAuth(config = {}) {
  return Boolean(getPublicGetCacheRule({
    ...config,
    method: String(config.method || 'get').toLowerCase(),
  }));
}

export function clearApiClientCache(matcher = null) {
  if (!matcher) {
    getResponseCache.clear();
    getInflightRequests.clear();
    return;
  }

  for (const key of getResponseCache.keys()) {
    if (typeof matcher === 'function' ? matcher(key) : key.includes(String(matcher))) {
      getResponseCache.delete(key);
    }
  }

  for (const key of getInflightRequests.keys()) {
    if (typeof matcher === 'function' ? matcher(key) : key.includes(String(matcher))) {
      getInflightRequests.delete(key);
    }
  }
}

export async function cachedApiGet(url, config = {}) {
  const requestConfig = {
    ...config,
    method: 'get',
    url,
  };
  const rule = getPublicGetCacheRule(requestConfig);

  if (!rule || config.skipClientCache) {
    return apiClient.get(url, config);
  }

  const cacheKey = buildClientCacheKey(url, config);
  const cached = getResponseCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < rule.ttlMs) {
    return {
      ...cached.response,
      headers: {
        ...(cached.response.headers ?? {}),
        'x-limen-client-cache': 'HIT',
      },
    };
  }

  const inflight = getInflightRequests.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = apiClient.get(url, {
    ...config,
    headers: {
      ...(config.headers ?? {}),
      'X-Limen-Client-Cache': '1',
    },
  }).then((response) => {
    getResponseCache.set(cacheKey, {
      timestamp: Date.now(),
      response: {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config: response.config,
      },
    });
    trimClientGetCache();
    return response;
  }).finally(() => {
    getInflightRequests.delete(cacheKey);
  });

  getInflightRequests.set(cacheKey, request);
  return request;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

apiClient.interceptors.request.use(async (config) => {
  if (isPublicGetWithoutAuth(config)) {
    return config;
  }

  let token;

  try {
    token = await getFreshAccessToken();
  } catch (error) {
    if (error?.name === 'AbortError') {
      await wait(50);
      token = await getFreshAccessToken();
    } else {
      throw error;
    }
  }

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    const isAuthFailure = error?.response?.status === 401
      && String(error?.response?.data?.error || '').toLowerCase().includes('authentication required');

    if (!isAuthFailure || !originalRequest || originalRequest.__limenAuthRetried) {
      return Promise.reject(error);
    }

    originalRequest.__limenAuthRetried = true;

    const token = await getFreshAccessToken({ forceRefresh: true });
    if (!token) {
      return Promise.reject(error);
    }

    originalRequest.headers = originalRequest.headers ?? {};
    originalRequest.headers.Authorization = `Bearer ${token}`;
    return apiClient(originalRequest);
  },
);

export function extractApiError(error, fallbackMessage) {
  if (error?.code === 'AUTH_SESSION_EXPIRED' || error?.isAuthSessionError) {
    throw new Error(error.message || 'Your sign-in session expired. Please sign in again.');
  }

  if (error?.code === 'ECONNABORTED' || String(error?.message || '').toLowerCase().includes('timeout')) {
    throw new Error(REQUEST_TIMEOUT_MESSAGE);
  }

  if (!error?.response) {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
  }

  if (error?.response?.data?.error) {
    throw new Error(getFriendlyApiErrorMessage(error.response.data.error, fallbackMessage));
  }

  if ([502, 503, 504].includes(error.response.status)) {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
  }

  if (error?.message) {
    throw new Error(getFriendlyApiErrorMessage(error.message, fallbackMessage));
  }

  throw new Error(fallbackMessage);
}

export function getFriendlyApiErrorMessage(message, fallbackMessage = SERVICE_UNAVAILABLE_MESSAGE) {
  const text = String(message || '').trim();
  if (!text) {
    return fallbackMessage;
  }

  if (/invalid schema:\s*(stockroom|operations|catalog|core|reco)/i.test(text)
    || /relation\s+".*"\s+does not exist/i.test(text)
    || /schema must be one of/i.test(text)
    || /not included in the schema cache/i.test(text)) {
    return DATA_SERVICE_CONFIGURATION_MESSAGE;
  }

  if (/authentication required/i.test(text)) {
    return 'Your staff session was not attached to this request. Please refresh the page or sign in again.';
  }

  return text;
}

export default apiClient;

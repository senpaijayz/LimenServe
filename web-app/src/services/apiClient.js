import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { ensureSessionLoaded, getCachedAccessToken } from './supabase';

export const DEFAULT_API_TIMEOUT_MS = 15000;
export const STOCKROOM_API_TIMEOUT_MS = 10000;
export const REQUEST_TIMEOUT_MESSAGE = 'The request took too long to finish. Please try again.';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_API_TIMEOUT_MS,
});

export const SERVICE_UNAVAILABLE_MESSAGE = 'Server temporarily unavailable. The backend service is not responding right now. Please try again in a few minutes.';
export const DATA_SERVICE_CONFIGURATION_MESSAGE = 'This live data area is being updated. Please refresh in a moment or try again after deployment finishes.';

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

apiClient.interceptors.request.use(async (config) => {
  let token = getCachedAccessToken();

  if (!token) {
    try {
      const session = await ensureSessionLoaded();
      token = session?.access_token ?? null;
    } catch (error) {
      if (error?.name === 'AbortError') {
        await wait(50);
        token = getCachedAccessToken();
      } else {
        throw error;
      }
    }
  }

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export function extractApiError(error, fallbackMessage) {
  if (error?.code === 'ECONNABORTED' || String(error?.message || '').toLowerCase().includes('timeout')) {
    throw new Error(REQUEST_TIMEOUT_MESSAGE);
  }

  if (!error?.response) {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
  }

  if (error?.response?.data?.error) {
    throw new Error(getFriendlyApiErrorMessage(error.response.data.error, fallbackMessage));
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

  return text;
}

export default apiClient;

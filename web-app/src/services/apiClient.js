import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { ensureSessionLoaded, getCachedAccessToken } from './supabase';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

export const SERVICE_UNAVAILABLE_MESSAGE = 'Server temporarily unavailable. The backend service is not responding right now. Please try again in a few minutes.';

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
  if (!error?.response) {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
  }

  if (error?.response?.data?.error) {
    throw new Error(error.response.data.error);
  }

  if (error?.message) {
    throw new Error(error.message);
  }

  throw new Error(fallbackMessage);
}

export default apiClient;

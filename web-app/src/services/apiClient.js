import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { supabase } from './supabase';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export function extractApiError(error, fallbackMessage) {
  if (error?.response?.data?.error) {
    throw new Error(error.response.data.error);
  }

  if (error?.message) {
    throw new Error(error.message);
  }

  throw new Error(fallbackMessage);
}

export default apiClient;

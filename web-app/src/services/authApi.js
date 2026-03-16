import apiClient, { extractApiError } from './apiClient';

export async function getCurrentUserProfile() {
  try {
    const { data } = await apiClient.get('/auth/me');
    return data.user;
  } catch (error) {
    extractApiError(error, 'Failed to load authenticated user profile.');
  }
}

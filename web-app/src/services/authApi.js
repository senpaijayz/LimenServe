import apiClient, { extractApiError } from './apiClient';

export async function getCurrentUserProfile(options = {}) {
  const { timeoutMs = 3000 } = options;

  try {
    const { data } = await apiClient.get('/auth/me', {
      timeout: timeoutMs,
    });
    return data.user;
  } catch (error) {
    extractApiError(error, 'Failed to load authenticated user profile.');
  }
}

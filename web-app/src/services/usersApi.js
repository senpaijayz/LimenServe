import apiClient, { extractApiError } from './apiClient';

export async function listUsers() {
  try {
    const { data } = await apiClient.get('/users');
    return data.users ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load users.');
  }
}

export async function createUser(payload) {
  try {
    const { data } = await apiClient.post('/users', payload);
    return data.user;
  } catch (error) {
    extractApiError(error, 'Failed to create user.');
  }
}

export async function updateUser(userId, payload) {
  try {
    const { data } = await apiClient.patch(`/users/${userId}`, payload);
    return data.user;
  } catch (error) {
    extractApiError(error, 'Failed to update user.');
  }
}

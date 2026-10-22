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
    return data;
  } catch (error) {
    extractApiError(error, 'Failed to create user.');
  }
}

export async function updateUser(userId, payload) {
  try {
    const { data } = await apiClient.patch(`/users/${userId}`, payload);
    return data;
  } catch (error) {
    extractApiError(error, 'Failed to update user.');
  }
}

export async function deactivateUser(userId) {
  try {
    const { data } = await apiClient.delete(`/users/${userId}`);
    return data;
  } catch (error) {
    extractApiError(error, 'Unable to remove this staff account.');
  }
}

export async function restoreUser(userId) {
  try {
    const { data } = await apiClient.post(`/users/${userId}/restore`);
    return data;
  } catch (error) {
    extractApiError(error, 'Unable to restore this staff account.');
  }
}

export async function getUserRecoveryEmail(userId) {
  try {
    const { data } = await apiClient.get(`/users/${userId}/recovery-email`);
    return data.recovery;
  } catch (error) {
    extractApiError(error, 'Unable to load the recovery email.');
  }
}

export async function requestUserRecoveryEmail(userId, payload) {
  try {
    const { data } = await apiClient.post(`/users/${userId}/recovery-email`, payload);
    return data;
  } catch (error) {
    extractApiError(error, 'Unable to send a recovery email verification link.');
  }
}

export async function permanentlyDeleteUser(userId) {
  try {
    const { data } = await apiClient.delete(`/users/${userId}/permanent`);
    return data;
  } catch (error) {
    extractApiError(error, 'Unable to permanently delete this user.');
  }
}

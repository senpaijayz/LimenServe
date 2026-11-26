import apiClient, { extractApiError } from './apiClient';

export async function loginWithPassword({ email, password }) {
  try {
    const { data } = await apiClient.post('/auth/login', { email, password });
    return data;
  } catch (error) {
    if (error.response?.status === 423 && error.response.data?.code === 'ADMIN_RECOVERY_REQUIRED') {
      throw Object.assign(new Error(error.response.data.error), { code: 'ADMIN_RECOVERY_REQUIRED' });
    }
    extractApiError(error, 'Unable to sign in. Please try again shortly.');
  }
}

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

export async function requestPasswordRecovery(email) {
  try {
    const { data } = await apiClient.post('/auth/recovery/request', { email });
    return data;
  } catch (error) {
    extractApiError(error, 'We could not start password recovery. Please try again shortly.');
  }
}

export async function unlockAdministratorWithRecoveryCode({ email, code }) {
  try {
    const { data } = await apiClient.post('/auth/recovery/code/unlock', { email, code });
    return data;
  } catch (error) {
    extractApiError(error, 'The code could not be verified. Request a new one and try again.');
  }
}

export async function requestAdministratorRecoveryCode(email) {
  try {
    const { data } = await apiClient.post('/auth/recovery/code/request', { email });
    return data;
  } catch (error) {
    extractApiError(error, 'Unable to request a recovery code. Try again shortly.');
  }
}

export async function getAccountSecurity() {
  try {
    const { data } = await apiClient.get('/auth/security');
    return data.security;
  } catch (error) {
    extractApiError(error, 'We could not load your account security details.');
  }
}

export async function beginRecoveryEmailVerification({ email, currentPassword }) {
  try {
    const { data } = await apiClient.post('/auth/recovery-email/challenge', { email, currentPassword });
    return data;
  } catch (error) {
    extractApiError(error, 'We could not send the verification email. Please try again.');
  }
}

export async function verifyRecoveryEmail(token) {
  try {
    const { data } = await apiClient.post('/auth/recovery-email/verify', { token });
    return data;
  } catch (error) {
    extractApiError(error, 'This verification link is invalid or has expired.');
  }
}

export async function resetPasswordWithRecoveryToken({ token, password }) {
  try {
    const { data } = await apiClient.post('/auth/recovery/reset', { token, password });
    return data;
  } catch (error) {
    extractApiError(error, 'The reset link is invalid or has expired. Request a fresh one and try again.');
  }
}

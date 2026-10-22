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

export async function requestPasswordRecovery(email) {
  try {
    const { data } = await apiClient.post('/auth/recovery/request', { email });
    return data;
  } catch (error) {
    extractApiError(error, 'We could not start password recovery. Please try again shortly.');
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

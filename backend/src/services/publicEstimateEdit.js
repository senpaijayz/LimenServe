import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const TOKEN_VERSION = 'v1';
const TOKEN_MAX_LENGTH = 512;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
export const PUBLIC_ESTIMATE_EDIT_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function getEncryptionKey(secret) {
  return createHash('sha256')
    .update(`limen-public-estimate-edit:${secret}`)
    .digest();
}

function resolveNow(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Public estimate edit clock returned an invalid date.');
  }

  return date;
}

export function createPublicEstimateEditToken({ estimateId, secret, now = () => new Date() } = {}) {
  if (!isUuid(estimateId)) {
    throw new TypeError('A valid estimate identifier is required for an edit token.');
  }

  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('A server-side edit-token secret is required.');
  }

  const expiresAt = Math.floor((resolveNow(now).getTime() + PUBLIC_ESTIMATE_EDIT_TOKEN_TTL_MS) / 1000);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ estimateId, expiresAt })),
    cipher.final(),
  ]);
  const encryptedPayload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');

  return `${TOKEN_VERSION}.${encryptedPayload}`;
}

export function verifyPublicEstimateEditToken(token, { secret, now = () => new Date() } = {}) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof token !== 'string' || token.length > TOKEN_MAX_LENGTH) {
    return null;
  }

  const [version, encryptedPayload, ...rest] = token.split('.');
  if (
    rest.length > 0
    || version !== TOKEN_VERSION
    || !/^[A-Za-z0-9_-]{40,500}$/.test(encryptedPayload || '')
  ) {
    return null;
  }

  let payload;
  try {
    const buffer = Buffer.from(encryptedPayload, 'base64url');
    if (buffer.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
      return null;
    }

    const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(secret), buffer.subarray(0, IV_LENGTH));
    decipher.setAuthTag(buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH));
    payload = JSON.parse(Buffer.concat([
      decipher.update(buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)),
      decipher.final(),
    ]).toString('utf8'));
  } catch {
    return null;
  }

  const estimateId = String(payload?.estimateId || '');
  const expiresAt = Number(payload?.expiresAt);
  if (!isUuid(estimateId) || !Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= resolveNow(now).getTime()) {
    return null;
  }

  return {
    estimateId: estimateId.toLowerCase(),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

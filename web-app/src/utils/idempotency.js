function normalizeScope(scope) {
  return String(scope || 'request')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'request';
}

function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createIdempotencyKey(scope = 'request') {
    const prefix = normalizeScope(scope).slice(0, 24);
    const randomId = globalThis.crypto?.randomUUID?.() || randomHex();
    return `${prefix}-${randomId}`;
}

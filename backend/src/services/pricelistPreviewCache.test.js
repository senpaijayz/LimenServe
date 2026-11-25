import test from 'node:test';
import assert from 'node:assert/strict';
import { createPricelistPreviewCache } from './pricelistPreviewCache.js';

test('keeps a bounded, serialized preview for the matching upload and token', () => {
  const cache = createPricelistPreviewCache({ maxBytes: 1024, maxEntries: 1 });
  const preview = { previewToken: 'token-a', counts: { revisionRowCount: 1 }, _draftItems: [{ sku: 'ABC', price: 12 }] };

  assert.equal(cache.set({ uploadId: 'upload-a', previewToken: 'token-a', preview, expiresAt: Date.now() + 60_000 }), true);
  assert.deepEqual(cache.get({ uploadId: 'upload-a', previewToken: 'token-a' }), preview);
  assert.equal(cache.get({ uploadId: 'upload-b', previewToken: 'token-a' }), null);
  assert.equal(cache.size, 1);
});

test('expires cached previews and evicts the previous entry when full', () => {
  let currentTime = 100;
  const cache = createPricelistPreviewCache({ maxBytes: 1024, maxEntries: 1, now: () => currentTime });
  const preview = (token) => ({ previewToken: token, _draftItems: [{ sku: token, price: 1 }] });

  cache.set({ uploadId: 'upload-a', previewToken: 'token-a', preview: preview('token-a'), expiresAt: 200 });
  cache.set({ uploadId: 'upload-b', previewToken: 'token-b', preview: preview('token-b'), expiresAt: 300 });
  assert.equal(cache.get({ uploadId: 'upload-a', previewToken: 'token-a' }), null);
  assert.notEqual(cache.get({ uploadId: 'upload-b', previewToken: 'token-b' }), null);

  currentTime = 301;
  assert.equal(cache.get({ uploadId: 'upload-b', previewToken: 'token-b' }), null);
  assert.equal(cache.size, 0);
});

test('does not cache an oversized draft', () => {
  const cache = createPricelistPreviewCache({ maxBytes: 8 });
  assert.equal(cache.set({
    uploadId: 'upload-a',
    previewToken: 'token-a',
    preview: { _draftItems: [{ sku: 'LONG-SKU', price: 1 }] },
    expiresAt: Date.now() + 60_000,
  }), false);
  assert.equal(cache.size, 0);
});

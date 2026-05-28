import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDeletableCmsPageSlug,
  normalizeCmsPageSlug,
} from './cmsPageDeleteModel.js';

test('normalizes CMS page slugs before delete', () => {
  assert.equal(normalizeCmsPageSlug(' /Test Page/ '), 'test-page');
  assert.equal(normalizeCmsPageSlug('/service-orders/'), 'service-orders');
});

test('rejects protected default CMS page delete requests', () => {
  assert.throws(
    () => assertDeletableCmsPageSlug('home'),
    /Default CMS pages cannot be deleted/,
  );
  assert.throws(
    () => assertDeletableCmsPageSlug('/about/'),
    /Default CMS pages cannot be deleted/,
  );
});

test('accepts removable custom CMS page slugs', () => {
  assert.equal(assertDeletableCmsPageSlug('/test/'), 'test');
});

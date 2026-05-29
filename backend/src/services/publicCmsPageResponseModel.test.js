import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPublicCmsPageResponse } from './publicCmsPageResponseModel.js';

test('missing public CMS pages return a non-error empty response', () => {
  assert.deepEqual(buildPublicCmsPageResponse(null), {
    statusCode: 200,
    body: {
      page: null,
      found: false,
    },
  });
});

test('published public CMS pages return the page payload', () => {
  const page = { slug: 'test', title: 'Test' };
  assert.deepEqual(buildPublicCmsPageResponse(page), {
    statusCode: 200,
    body: {
      page,
      found: true,
    },
  });
});

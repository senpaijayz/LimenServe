import test from 'node:test';
import assert from 'node:assert/strict';
import { filterActiveEstimates } from './estimateValidity.js';

test('removes quotations whose validity date is before today', () => {
  const active = filterActiveEstimates([
    { id: 'expired', valid_until: '2026-06-29' },
    { id: 'today', valid_until: '2026-08-20' },
    { id: 'future', valid_until: '2026-08-21' },
    { id: 'missing', valid_until: null },
  ], new Date('2026-08-20T04:00:00.000Z'));

  assert.deepEqual(active.map((estimate) => estimate.id), ['today', 'future', 'missing']);
});

test('handles malformed collections without exposing stale rows', () => {
  assert.deepEqual(filterActiveEstimates(null, new Date('2026-08-20T00:00:00.000Z')), []);
  assert.deepEqual(filterActiveEstimates([{ id: 'bad', valid_until: 'not-a-date' }], new Date('2026-08-20T00:00:00.000Z')), [{ id: 'bad', valid_until: 'not-a-date' }]);
});

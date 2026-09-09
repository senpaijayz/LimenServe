import assert from 'node:assert/strict';
import test from 'node:test';

import { parseUpsellAction } from './upsellAction.js';

const ids = {
  contextId: '01234567-89ab-4def-8123-456789abcdef',
  productId: '11234567-89ab-4def-8123-456789abcdef',
  recommendedProductId: '21234567-89ab-4def-8123-456789abcdef',
};

test('normalizes an allowed recommendation event', () => {
  const result = parseUpsellAction({
    contextType: ' ESTIMATE ',
    ...ids,
    action: 'ACCEPTED',
    reasonLabel: ' Vehicle-specific bundle ',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    contextType: 'estimate',
    ...ids,
    recommendedServiceId: null,
    action: 'accepted',
    ruleId: null,
    reasonLabel: 'Vehicle-specific bundle',
  });
});

test('rejects malformed identifiers, actions, and oversized labels', () => {
  for (const payload of [
    { contextType: 'estimate', ...ids, contextId: 'not-a-uuid' },
    { contextType: 'other', ...ids },
    { contextType: 'estimate', ...ids, action: 'deleted' },
    { contextType: 'estimate', ...ids, reasonLabel: 'x'.repeat(161) },
    { contextType: 'estimate', ...ids, recommendedServiceId: '31234567-89ab-4def-8123-456789abcdef' },
    { contextType: 'estimate', contextId: ids.contextId, productId: ids.productId },
  ]) {
    assert.deepEqual(parseUpsellAction(payload), {
      ok: false,
      error: 'Invalid recommendation event.',
    });
  }
});

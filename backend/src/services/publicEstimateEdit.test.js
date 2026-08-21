import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPublicEstimateEditToken,
  PUBLIC_ESTIMATE_EDIT_TOKEN_TTL_MS,
  verifyPublicEstimateEditToken,
} from './publicEstimateEdit.js';

const SECRET = 'a-private-server-secret-with-at-least-thirty-two-characters';
const ESTIMATE_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-08-21T10:00:00.000Z');

test('public quote edit tokens verify only for their estimate and lifetime', () => {
  const token = createPublicEstimateEditToken({
    estimateId: ESTIMATE_ID,
    secret: SECRET,
    now: NOW,
  });

  assert.equal(token.includes(ESTIMATE_ID), false);
  assert.deepEqual(verifyPublicEstimateEditToken(token, { secret: SECRET, now: NOW }), {
    estimateId: ESTIMATE_ID,
    expiresAt: new Date(NOW.getTime() + PUBLIC_ESTIMATE_EDIT_TOKEN_TTL_MS).toISOString(),
  });
  assert.equal(verifyPublicEstimateEditToken(`${token}x`, { secret: SECRET, now: NOW }), null);
  assert.equal(
    verifyPublicEstimateEditToken(token, {
      secret: SECRET,
      now: new Date(NOW.getTime() + PUBLIC_ESTIMATE_EDIT_TOKEN_TTL_MS),
    }),
    null,
  );
});

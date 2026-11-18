import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePosReturnPayload } from './posReturnValidation.js';

const requestId = '8e74ad96-3d1c-42f9-989d-77abfa9a9f48';
const saleItemId = 'b94f9a58-8318-4d9e-9a02-c1c3bc1c432b';

function payload(overrides = {}) {
  return {
    requestId,
    items: [{ saleItemId, quantity: 1, condition: 'resalable' }],
    reason: 'wrong_part',
    reasonNote: '',
    refundMethod: 'cash',
    refundReference: '',
    refundConfirmed: true,
    ...overrides,
  };
}

test('POS return validation keeps only the supported receipt and refund fields', () => {
  assert.deepEqual(validatePosReturnPayload(payload({ unexpected: 'ignored' })), {
    requestId,
    payload: {
      items: [{ saleItemId, quantity: 1, condition: 'resalable' }],
      reason: 'wrong_part', reasonNote: '', refundMethod: 'cash', refundReference: '', refundConfirmed: true,
    },
  });
});

test('POS return validation rejects duplicate receipt lines', () => {
  assert.throws(() => validatePosReturnPayload(payload({
    items: [
      { saleItemId, quantity: 1, condition: 'resalable' },
      { saleItemId, quantity: 1, condition: 'damaged' },
    ],
  })), /only appear once/);
});

test('POS return validation requires a check reference and an issued-refund confirmation', () => {
  assert.throws(() => validatePosReturnPayload(payload({ refundMethod: 'check' })), /check number/);
  assert.throws(() => validatePosReturnPayload(payload({ refundConfirmed: false })), /actually issued/);
});

test('POS return validation requires a note for Other and rejects fractional cents', () => {
  assert.throws(() => validatePosReturnPayload(payload({ reason: 'other' })), /when the return reason is Other/);
  assert.throws(() => validatePosReturnPayload(payload({ items: [{ saleItemId, quantity: 0.001, condition: 'resalable' }] })), /two decimal places/);
});

test('POS return validation accepts fitment reasons and item conditions used by the return workflow', () => {
  const result = validatePosReturnPayload(payload({
    reason: 'wrong_fitment',
    refundMethod: 'account_credit',
    items: [{ saleItemId, quantity: 1, condition: 'opened_resalable' }],
  }));
  assert.equal(result.payload.reason, 'wrong_fitment');
  assert.equal(result.payload.refundMethod, 'account_credit');
  assert.equal(result.payload.items[0].condition, 'opened_resalable');
});

test('POS return validation accepts inspection, installed, and damaged return conditions', () => {
  for (const condition of ['inspection', 'installed', 'damaged']) {
    const result = validatePosReturnPayload(payload({ items: [{ saleItemId, quantity: 1, condition }] }));
    assert.equal(result.payload.items[0].condition, condition);
  }
  assert.throws(() => validatePosReturnPayload(payload({
    refundMethod: 'account_credit', refundConfirmed: false,
  })), /unpaid balance should be reduced/);
});

test('POS return validation prevents a defective part from going straight back to saleable stock', () => {
  assert.throws(() => validatePosReturnPayload(payload({
    reason: 'defective',
    items: [{ saleItemId, quantity: 1, condition: 'opened_resalable' }],
  })), /defective part must be held for inspection/);
  assert.equal(validatePosReturnPayload(payload({
    reason: 'defective',
    items: [{ saleItemId, quantity: 1, condition: 'inspection' }],
  })).payload.items[0].condition, 'inspection');
});

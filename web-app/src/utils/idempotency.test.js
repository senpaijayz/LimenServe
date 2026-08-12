import { describe, expect, it } from 'vitest';
import { createIdempotencyKey } from './idempotency';

describe('createIdempotencyKey', () => {
  it('creates distinct, header-safe keys in the backend length bounds', () => {
    const first = createIdempotencyKey('stock receipt');
    const second = createIdempotencyKey('stock receipt');

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
    expect(first).toMatch(/^stock-receipt-/);
  });
});

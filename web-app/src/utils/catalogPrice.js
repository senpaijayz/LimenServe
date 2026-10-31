// A missing/zero ordinary part price needs review, not an implicit free item.
// Approved package allocations have separate server-authorized pricing rules.
export function hasPositivePartPrice(value) {
  const amount = Number(value);
  return value !== null && value !== undefined && value !== '' && typeof value !== 'boolean'
    && Number.isFinite(amount) && Math.round((amount + Number.EPSILON) * 100) > 0;
}

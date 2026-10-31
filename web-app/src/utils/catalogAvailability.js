export function catalogAvailability(product) {
  const raw = product?.availableStock;
  const known = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0;
  const inStock = known && raw > 0;
  return {
    known,
    inStock,
    label: !known ? 'Availability not confirmed' : inStock ? 'In stock' : 'Out of stock',
    detail: !known ? 'Ask the shop to confirm availability.' : `${raw} unit${raw === 1 ? '' : 's'} available`,
  };
}

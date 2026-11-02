// Selling prices already include VAT. Extract its portion; never add it again.
export function includedVat(amount) {
  const cents = Math.round((Number(amount) + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Enter a valid VAT-inclusive amount.');
  return Number((BigInt(cents) * 12n + 56n) / 112n) / 100;
}

export function vatInclusiveTotals(items, discountPercent = 0) {
  const subtotalCents = Math.round(items.reduce((sum, item) => sum + Math.round(Number(item.price) * 100) * Number(item.quantity), 0));
  const percent = Math.min(100, Math.max(0, Math.round(Number(discountPercent) * 100) / 100));
  const discountCents = Number((BigInt(subtotalCents) * BigInt(Math.round(percent * 100)) + 5000n) / 10000n);
  const total = (subtotalCents - discountCents) / 100;
  return { rawSubtotal: subtotalCents / 100, discountAmount: discountCents / 100, subtotal: total,
    tax: includedVat(total), total, itemCount: items.reduce((sum, item) => sum + Number(item.quantity), 0) };
}

// Frozen totals determine the basis, not today's catalog. Old sales stay unchanged.
export function documentIncludesVat(document = {}) {
  const subtotal = document.subtotal ?? document.subtotalBeforeDiscount;
  const discount = document.discountTotal ?? document.discount_total ?? document.bundleDiscountTotal ?? 0;
  const total = document.totalAmount ?? document.total_amount ?? document.grand_total ?? document.total;
  return subtotal != null && total != null && Number.isFinite(Number(subtotal)) && Number.isFinite(Number(total))
    && Math.round(Number(subtotal) * 100) - Math.round(Number(discount) * 100) - Math.round(Number(total) * 100) === 0;
}

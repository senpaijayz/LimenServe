import { describe, expect, it } from 'vitest';
import { calculateQuoteTotals } from '../modules/public/utils/bundleQuotePricing';
import { makeManagedOffer, managedOfferLines, managedSelectionsFromLines, replaceManagedLines } from '../modules/public/utils/managedQuotePackages';

const ids = Array.from({ length: 5 }, (_, index) => `${index + 1}`.repeat(8) + '-1111-4111-8111-111111111111');
const publication = { revisionId: ids[1], definition: { id: ids[0], name: 'Recorded offer' } };
const price = { variantId: ids[2], label: 'Approved option', valid: true, catalogTotal: 300, packageTotal: 270,
  lines: [{ itemId: ids[3], productId: ids[4], kind: 'product', name: 'Recorded part', sku: 'PART-1', quantity: 3,
    catalogUnitPrice: 100, allocations: [{ quantity: 3, unitPrice: 90 }] }] };

describe('database-published package cart', () => {
  it('preserves approved allocations when another regular item is added', () => {
    const offer = makeManagedOffer(publication, price);
    const lines = managedOfferLines(offer);
    const totals = calculateQuoteTotals([...lines, { id: 'ordinary', price: 50, catalogPrice: 50, quantity: 1 }]);
    expect(totals).toMatchObject({ subtotal: 320, bundleDiscountTotal: 30, vat: 38.4, total: 358.4 });
    expect(managedSelectionsFromLines(lines)).toEqual([offer.selection]);
  });

  it('replaces a complete group without duplicating it and only consumes ordinary quantities on initial addition', () => {
    const offer = makeManagedOffer(publication, price);
    const ordinary = [{ id: ids[4], price: 100, catalogPrice: 100, quantity: 5 }];
    const initial = replaceManagedLines(ordinary, offer, 'product', { consumeOrdinary: true });
    expect(initial.find((line) => !line.bundleKey).quantity).toBe(2);
    const nextOffer = makeManagedOffer(publication, price, 2);
    const next = replaceManagedLines(initial, nextOffer, 'product');
    expect(next.filter((line) => line.bundleKey)).toHaveLength(1);
    expect(next.find((line) => line.bundleKey)).toMatchObject({ quantity: 6, price: 90 });
    expect(next.find((line) => !line.bundleKey).quantity).toBe(2);
  });

  it('rejects mismatched totals, free unpriced parts, and inconsistent package selections', () => {
    expect(() => makeManagedOffer(publication, { ...price, packageTotal: 269 })).toThrow('totals do not match');
    expect(() => makeManagedOffer(publication, { ...price, lines: [{ ...price.lines[0], catalogUnitPrice: 0 }] })).toThrow('verified price');
    const line = managedOfferLines(makeManagedOffer(publication, price))[0];
    expect(() => managedSelectionsFromLines([line, { ...line, managedSelection: { ...line.managedSelection, quantity: 2 } }])).toThrow('inconsistent');
  });
});

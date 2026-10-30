import { describe, expect, it } from 'vitest';
import { summarizeDashboardOperations } from '../services/dashboardApi';

describe('dashboard operational summary', () => {
  it('uses authoritative global totals rather than bounded lists', () => {
    const summary = summarizeDashboardOperations({
      sales: {totalAmount:2000,transactionCount:2},
      catalog: { inventoryValue: 50000, totalProducts: 120 },
      serviceAttention:{summary:{active:150}},
      quoteSummary:{activeCount:240},
    });

    expect(summary).toMatchObject({
      todaySalesTotal: 2000,
      todaySalesCount: 2,
      inventoryValue: 50000,
      catalogProductCount: 120,
      openServiceOrderCount: 150,
      activeEstimateCount: 240,
    });
  });

  it('does not present unavailable sources as genuine zero totals', () => {
    expect(summarizeDashboardOperations({ errors: ['Inventory: unavailable'] })).toMatchObject({
      todaySalesTotal: null,
      todaySalesCount: null,
      inventoryValue: null,
      openServiceOrderCount: null,
      activeEstimateCount: null,
      errors: ['Inventory: unavailable'],
    });
  });
});

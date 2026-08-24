import { describe, expect, it } from 'vitest';
import { summarizeDashboardOperations } from '../services/dashboardApi';

describe('dashboard operational summary', () => {
  it('summarizes live sales, stock, service, reservation, and estimate data', () => {
    const summary = summarizeDashboardOperations({
      sales: {
        sales: [
          { total_amount: 1250.5 },
          { totalAmount: 749.5 },
        ],
        pagination: { total: 2 },
      },
      catalog: { inventoryValue: 50000, totalProducts: 120 },
      serviceOrders: [
        { status: 'pending' },
        { status: 'in_progress' },
        { status: 'completed' },
      ],
      reservations: {
        reservations: [
          { status: 'pending' },
          { status: 'available' },
          { status: 'cancelled' },
        ],
      },
      estimates: [
        { status: 'draft' },
        { status: 'sent' },
        { status: 'expired' },
      ],
    });

    expect(summary).toMatchObject({
      todaySalesTotal: 2000,
      todaySalesCount: 2,
      inventoryValue: 50000,
      catalogProductCount: 120,
      openServiceOrderCount: 2,
      pendingReservationCount: 1,
      activeReservationCount: 2,
      activeEstimateCount: 2,
    });
  });

  it('returns safe zero values when an optional source is unavailable', () => {
    expect(summarizeDashboardOperations({ errors: ['Reservations: unavailable'] })).toMatchObject({
      todaySalesTotal: 0,
      todaySalesCount: 0,
      inventoryValue: 0,
      openServiceOrderCount: 0,
      pendingReservationCount: 0,
      activeEstimateCount: 0,
      errors: ['Reservations: unavailable'],
    });
  });
});

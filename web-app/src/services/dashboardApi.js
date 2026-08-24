import { listEstimates } from './estimatesApi';
import { listPosSales } from './posApi';
import { listReservations } from './reservationsApi';
import { listServiceOrders } from './serviceOrdersApi';
import { getCatalogSummary } from './catalogApi';

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayRange() {
  const today = new Date();
  const date = formatLocalDate(today);
  return { startDate: date, endDate: date };
}

function settledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

function errorMessage(result, label) {
  if (result.status === 'fulfilled') {
    return null;
  }

  return `${label}: ${result.reason?.message || 'temporarily unavailable'}`;
}

/**
 * Loads the operational numbers used by the dashboard in parallel. Each
 * source is independent so a missing optional table does not hide the other
 * live metrics.
 */
export async function getDashboardOperationsSnapshot() {
  const { startDate, endDate } = todayRange();
  const [salesResult, catalogResult, serviceResult, reservationResult, estimateResult] = await Promise.allSettled([
    listPosSales({ limit: 100, page: 1, startDate, endDate }),
    getCatalogSummary(),
    listServiceOrders({ status: 'all', limit: 100 }),
    listReservations({ status: 'all', limit: 200 }),
    listEstimates('', 100),
  ]);

  return {
    range: { startDate, endDate },
    sales: settledValue(salesResult),
    catalog: settledValue(catalogResult),
    serviceOrders: settledValue(serviceResult),
    reservations: settledValue(reservationResult),
    estimates: settledValue(estimateResult),
    errors: [
      errorMessage(salesResult, 'Sales'),
      errorMessage(catalogResult, 'Inventory'),
      errorMessage(serviceResult, 'Service orders'),
      errorMessage(reservationResult, 'Reservations'),
      errorMessage(estimateResult, 'Quotations'),
    ].filter(Boolean),
    loadedAt: new Date().toISOString(),
  };
}

const ACTIVE_RESERVATION_STATUSES = new Set([
  'pending',
  'approved',
  'waiting_for_stock',
  'partially_available',
  'available',
]);

const OPEN_SERVICE_STATUSES = new Set([
  'pending',
  'in_progress',
  'scheduled',
  'assigned',
]);

/** Converts the live endpoint responses into stable KPI values. */
export function summarizeDashboardOperations(snapshot = {}) {
  const sales = Array.isArray(snapshot.sales?.sales) ? snapshot.sales.sales : [];
  const salesTotal = sales.reduce((total, sale) => total + Number(sale.total_amount ?? sale.totalAmount ?? 0), 0);
  const serviceOrders = Array.isArray(snapshot.serviceOrders) ? snapshot.serviceOrders : [];
  const reservations = Array.isArray(snapshot.reservations?.reservations) ? snapshot.reservations.reservations : [];
  const estimates = Array.isArray(snapshot.estimates) ? snapshot.estimates : [];

  return {
    todaySalesTotal: salesTotal,
    todaySalesCount: Number(snapshot.sales?.pagination?.total ?? sales.length),
    inventoryValue: Number(snapshot.catalog?.inventoryValue ?? 0),
    catalogProductCount: Number(snapshot.catalog?.totalProducts ?? 0),
    openServiceOrderCount: serviceOrders.filter((order) => OPEN_SERVICE_STATUSES.has(String(order.status || '').toLowerCase())).length,
    pendingReservationCount: reservations.filter((reservation) => String(reservation.status || '').toLowerCase() === 'pending').length,
    activeReservationCount: reservations.filter((reservation) => ACTIVE_RESERVATION_STATUSES.has(String(reservation.status || '').toLowerCase())).length,
    activeEstimateCount: estimates.filter((estimate) => !['expired', 'rejected', 'converted_sale', 'converted_service'].includes(String(estimate.status || '').toLowerCase())).length,
    errors: snapshot.errors ?? [],
    loadedAt: snapshot.loadedAt ?? null,
  };
}

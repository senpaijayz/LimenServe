import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import SalesReport from '../modules/reports/pages/SalesReport';
const api = vi.hoisted(() => ({ report: vi.fn(), sales: vi.fn(), aggregates: vi.fn() }));
vi.mock('../services/analyticsApi', () => ({ getRecordedSalesReport: api.report }));
vi.mock('../services/posApi', () => ({ listPosSales: api.sales, listHistoricalSalesAggregates: api.aggregates, getPosSaleDetail: vi.fn() }));
vi.mock('../services/catalogApi', () => ({ getManagedCategories: vi.fn().mockResolvedValue([]) }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ isAdmin: true, user: { fullName: 'Evaluator' } }) }));
vi.mock('../modules/dashboard/components/SalesChart', () => ({ default: ({ data }) => <div data-testid="trend">{JSON.stringify(data)}</div> }));
vi.mock('../modules/reports/components/HistoricalSaleEditorModal.jsx', () => ({ default: () => null }));
vi.mock('../modules/reports/components/HistoricalAggregateEditorModal.jsx', () => ({ default: () => null }));
vi.mock('recharts', () => {
 const Wrapper = ({ children }) => <div>{children}</div>;
 return { ResponsiveContainer: Wrapper, BarChart: Wrapper, Bar: () => null, CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null };
});
const report = { generatedAt: '2026-10-14T00:00:00Z', topSellingItems: [{ product_id: 'one', product_name: 'Recorded thermostat', quantity: 2, revenue: 100 }], peakPeriods: [], categories: [], itemTrend: [
 { period_start: '2026-10-01', label: 'Oct 2026', revenue: 100, quantity: 2 },
 { period_start: '2026-10-01', label: 'Oct 2026', revenue: 50, quantity: 1 },
] };
beforeEach(() => { vi.clearAllMocks(); api.report.mockResolvedValue(report); api.sales.mockResolvedValue({ sales: [] }); api.aggregates.mockResolvedValue({ aggregates: [] }); });
afterEach(cleanup);
const mount = () => render(<MemoryRouter><SalesReport /></MemoryRouter>);
it('shows database results and groups product rows into one chart point per period without fake trends', async () => {
 mount();
 await screen.findAllByText('Recorded thermostat');
 expect(screen.getByTestId('trend').textContent).toContain('"revenue":150');
 expect(screen.getByTestId('trend').textContent).toContain('"quantity":3');
 expect(screen.queryByText('vs last period')).toBeNull();
 expect(screen.getByText(/Completed POS and encoded itemized sales only/)).toBeTruthy();
});
it('refreshes directly from recorded sales and shows unavailable rather than invented zeroes after failure', async () => {
 mount();
 await screen.findAllByText('Recorded thermostat');
 api.report.mockRejectedValue(new Error('Database unavailable'));
 fireEvent.click(screen.getByRole('button', { name: 'Refresh Analytics' }));
 await screen.findByText('Database unavailable');
 expect(screen.queryByText('Recorded thermostat')).toBeNull();
 expect(screen.getAllByText('Unavailable')).toHaveLength(4);
 await waitFor(() => expect(api.report).toHaveBeenCalledTimes(2));
 expect(screen.getByRole('button', { name: 'Print PDF' }).disabled).toBe(true);
});
it('shows honest empty data when there are no completed recorded sales', async () => {
 api.report.mockResolvedValue({ topSellingItems: [], itemTrend: [], peakPeriods: [], categories: [] });
 mount();
 await screen.findAllByText('No recorded sales');
 expect(screen.getByTestId('trend').textContent).toBe('[]');
});

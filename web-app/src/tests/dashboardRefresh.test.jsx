import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDashboard from '../modules/dashboard/pages/AdminDashboard';
import { getAnalyticsDashboardSnapshot, runFullAnalyticsRefresh } from '../services/analyticsApi';
import { getDashboardOperationsSnapshot } from '../services/dashboardApi';

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({ isProfileReady: true, profileWarning: '' }),
}));
vi.mock('../services/analyticsApi', () => ({
  getAnalyticsDashboardSnapshot: vi.fn(),
  runFullAnalyticsRefresh: vi.fn(),
}));
vi.mock('../services/dashboardApi', async (importOriginal) => ({
  ...(await importOriginal()),
  getDashboardOperationsSnapshot: vi.fn(),
}));
vi.mock('../modules/dashboard/components/SalesChart', () => ({ default: () => null }));
vi.mock('../modules/dashboard/components/InventoryMovementLedger', () => ({ default: () => null }));
vi.mock('../modules/dashboard/components/RecentTransactions', () => ({ default: () => null }));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('dashboard refresh feedback', () => {
  beforeEach(() => {
    vi.mocked(getAnalyticsDashboardSnapshot).mockReset().mockResolvedValue({});
    vi.mocked(getDashboardOperationsSnapshot).mockReset().mockResolvedValue({});
    vi.mocked(runFullAnalyticsRefresh).mockReset();
  });

  afterEach(() => cleanup());

  it('reloads dashboard data without rebuilding analytics', async () => {
    const reload = deferred();
    vi.mocked(getAnalyticsDashboardSnapshot)
      .mockResolvedValueOnce({})
      .mockReturnValueOnce(reload.promise);

    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' }).disabled).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByRole('button', { name: 'Refreshing…' }).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Refreshing dashboard');
    expect(screen.getByRole('status').textContent).toContain('Loading the latest dashboard data');
    expect(screen.getByRole('status').parentElement.classList.contains('fixed')).toBe(true);
    expect(screen.getByRole('status').closest('[aria-busy]')?.getAttribute('aria-busy')).toBe('true');
    expect(runFullAnalyticsRefresh).not.toHaveBeenCalled();

    await act(async () => { reload.resolve({}); });
    expect(getAnalyticsDashboardSnapshot).toHaveBeenCalledTimes(2);
    expect(getDashboardOperationsSnapshot).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh' }).disabled).toBe(false);
  });

  it('clears the overlay and keeps retry available after a failed reload', async () => {
    const reload = deferred();
    vi.mocked(getAnalyticsDashboardSnapshot)
      .mockResolvedValueOnce({})
      .mockReturnValueOnce(reload.promise);

    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await act(async () => { reload.reject(new Error('Refresh failed')); });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh' }).disabled).toBe(false);
    expect(screen.getByText('Refresh failed')).toBeTruthy();
    expect(runFullAnalyticsRefresh).not.toHaveBeenCalled();
  });
});

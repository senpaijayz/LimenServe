import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { getHistory } = vi.hoisted(() => ({ getHistory: vi.fn() }));
vi.mock('../services/catalogApi', () => ({ getProductPriceHistory: getHistory }));
import ProductPriceHistory from '../modules/inventory/components/ProductPriceHistory';
const data = { productId: 'a', currentPrice: 90, firstListedYear: 2025, activeList: { year: 2026, revision: 1, listed: false }, versions: [
  { id: 'new', year: 2026, revision: 1, listed: false, previousPrice: 100, change: 'not_listed', isActive: true },
  { id: 'old', year: 2025, revision: 1, listed: true, price: 100, previousPrice: 120, difference: -20, change: 'decrease' },
] };
afterEach(cleanup);
beforeEach(() => { getHistory.mockReset(); });
describe('price timeline', () => {
  it('shows current price, previous year, changes, and explicit missing price', async () => {
    getHistory.mockResolvedValue(data); render(<ProductPriceHistory productId="a" />);
    expect(await screen.findByText('2025 · revision 1')).toBeTruthy();
    expect(screen.getByText('Price decreased')).toBeTruthy();
    expect(screen.getByText(/Omitted from this list/)).toBeTruthy();
    expect(screen.getByText(/First listed in 2025/)).toBeTruthy();
  });
  it('offers retry instead of pretending a failed request is an empty history', async () => {
    getHistory.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(data);
    render(<ProductPriceHistory productId="a" />); expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry')); expect(await screen.findByText('2025 · revision 1')).toBeTruthy();
  });
  it('aborts on close and ignores results after unmount', async () => {
    let resolve; getHistory.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const view = render(<ProductPriceHistory productId="a" />); const signal = getHistory.mock.calls[0][1]; view.unmount();
    expect(signal.aborted).toBe(true); await act(async () => resolve(data));
  });
});

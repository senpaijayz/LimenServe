import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductManagement from '../modules/products/pages/ProductManagement';

const api = vi.hoisted(() => ({ getArchivedCatalogProducts: vi.fn(), getSuppliers: vi.fn(), getManagedCategories: vi.fn(), deleteArchivedCatalogProduct: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../services/catalogApi', () => ({ ...api, archiveCatalogProduct: vi.fn(), createCatalogProduct: vi.fn(), getCatalogProductByPartNumber: vi.fn(), getProductStockHistory: vi.fn(), updateCatalogProduct: vi.fn() }));
vi.mock('../hooks/useProductCatalog', () => ({ default: () => ({ products: [], categories: [], pagination: { totalCount: 0, totalPages: 1 }, loading: false }) }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ success: api.success, error: api.error, info: vi.fn(), warning: vi.fn() }) }));
vi.mock('../modules/products/api/productCatalogQueries', () => ({ invalidateProductCatalog: vi.fn() }));
vi.mock('../components/ui/LargeBarcodeModal', () => ({ default: () => null }));
vi.mock('../modules/inventory/components/ProductPriceHistory', () => ({ default: () => null }));
const archived = { id: 'product-1', name: 'Unused thermostat', sku: 'MD094120', stock: 0, reserved: 0, price: 100 };
const mount = () => render(<QueryClientProvider client={new QueryClient()}><ProductManagement /></QueryClientProvider>);
beforeEach(() => { vi.clearAllMocks(); api.getArchivedCatalogProducts.mockResolvedValue([archived]); api.getSuppliers.mockResolvedValue([]); api.getManagedCategories.mockResolvedValue([]); });
afterEach(cleanup);

it('requires confirmation before deleting an archived product and removes it after success', async () => {
  api.deleteArchivedCatalogProduct.mockResolvedValue({ deleted: true });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }));
  expect(api.deleteArchivedCatalogProduct).not.toHaveBeenCalled();
  expect(screen.getByText(/This cannot be undone/)).toBeTruthy();
  expect(screen.getByText(/Inventory-only movement and receiving logs will be removed/)).toBeTruthy();
  expect(screen.getByText(/Products with sales, reservations, quotes, service orders/)).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete permanently' }).find((button) => button.closest('[role="dialog"]')));
  await waitFor(() => expect(api.deleteArchivedCatalogProduct).toHaveBeenCalledWith(archived.id, archived.sku));
  await screen.findByText('No archived products yet.');
});

it('keeps a linked product in the archive and shows the server explanation', async () => {
  api.deleteArchivedCatalogProduct.mockRejectedValue(new Error('This product has sales history. Keep it archived.'));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete permanently' }).find((button) => button.closest('[role="dialog"]')));
  await waitFor(() => expect(api.error).toHaveBeenCalledWith(expect.stringContaining('sales history')));
  expect(screen.queryByText('No archived products yet.')).toBeNull();
});

it('disables deletion while stock remains', async () => {
  api.getArchivedCatalogProducts.mockResolvedValue([{ ...archived, stock: 2 }]);
  mount();
  expect((await screen.findByRole('button', { name: 'Delete permanently' })).disabled).toBe(true);
});

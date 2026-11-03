import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), receive: vi.fn(), received: vi.fn() }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'receiving-staff', role: 'stock_clerk' } }) }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ sidebarCollapsed: false }) }));
vi.mock('../services/catalogApi', () => ({
    getSuppliers: async () => [], getProductCatalog: mocks.catalog, receiveInventoryBatch: mocks.receive,
}));
vi.mock('../modules/locator3d/store/useLocator3DStore', () => ({ useLocator3DStore: { getState: () => ({ setRecentlyReceivedStock: mocks.received }) } }));
vi.mock('../components/ui/CameraScannerModal', () => ({ default: ({ isOpen, onScan }) => isOpen ? <button onClick={() => onScan('MD094120')}>Read barcode fixture</button> : null }));
import ReceiveStock from '../modules/inventory/pages/ReceiveStock';

const product = { id: 'part-1', sku: 'MD094120', name: 'Oil filter', stock: 2 };
const storageKey = 'limen:receiving:v1:receiving-staff';
const mount = () => render(<MemoryRouter><ReceiveStock /></MemoryRouter>);
async function addByBarcode() {
    fireEvent.click(screen.getByRole('button', { name: 'Scan barcode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Read barcode fixture' }));
    await screen.findByText('Oil filter');
}
beforeEach(() => {
    localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
    mocks.catalog.mockResolvedValue({ products: [product] });
    mocks.receive.mockResolvedValue({ receiptId: 'receipt-1', totalLines: 1, totalQuantity: 1, items: [{ productId: product.id, partNumber: product.sku, description: product.name, quantity: 1 }] });
});
afterEach(cleanup);
describe('manual receiving after invoice scanner removal', () => {
    it('has no invoice upload/scanning action but retains product barcode scanning', () => {
        const { container } = mount();
        expect(screen.queryByRole('button', { name: /invoice/i })).toBeNull();
        expect(container.querySelector('input[type="file"]')).toBeNull();
        expect(screen.getByRole('button', { name: 'Scan barcode' })).toBeTruthy();
        expect(screen.getByText('Reference number (Optional)')).toBeTruthy();
    });
    it('receives barcode-selected parts without a supplier through the manual batch endpoint', async () => {
        mount(); await addByBarcode();
        fireEvent.click(screen.getByRole('button', { name: 'Review & Receive Stock' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Receive Stock' }));
        await screen.findByRole('heading', { name: 'Stock received' });
        expect(mocks.receive).toHaveBeenCalledTimes(1);
        expect(mocks.receive).toHaveBeenCalledWith(expect.objectContaining({ items: [{ productId: product.id, quantity: 1 }], supplierId: null }), { idempotencyKey: expect.any(String) });
        expect(localStorage.getItem(storageKey)).toBeNull();
    });
    it('recovers a manual receiving draft on this device', async () => {
        localStorage.setItem(storageKey, JSON.stringify({ version: 1, items: [{ productId: product.id, partNumber: product.sku, description: product.name, currentStock: 2, quantity: 4 }], supplierId: '', referenceNumber: 'INV-DRAFT', receivedDate: '2026-11-03', notes: '', requestKey: 'receipt-draft-123' }));
        mount();
        expect(await screen.findByText('Oil filter')).toBeTruthy();
        expect(screen.getByDisplayValue('INV-DRAFT')).toBeTruthy();
        expect(screen.getByDisplayValue('4')).toBeTruthy();
    });
    it('keeps an uncertain receipt and reuses its identity instead of duplicating stock', async () => {
        mocks.receive.mockRejectedValueOnce(new Error('Connection interrupted'));
        mount(); await addByBarcode();
        fireEvent.click(screen.getByRole('button', { name: 'Review & Receive Stock' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Receive Stock' }));
        await screen.findByRole('button', { name: 'Check / retry receipt' });
        const key = mocks.receive.mock.calls[0][1].idempotencyKey;
        expect(JSON.parse(localStorage.getItem(storageKey)).submitted).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Check / retry receipt' }));
        await waitFor(() => expect(mocks.receive).toHaveBeenCalledTimes(2));
        expect(mocks.receive.mock.calls[1][1].idempotencyKey).toBe(key);
        await screen.findByRole('heading', { name: 'Stock received' });
    });
});

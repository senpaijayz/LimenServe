import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';

vi.mock('../hooks/useProductCatalog', () => ({
    default: () => ({ products: [], pagination: { page: 1, pageSize: 8, totalCount: 0, totalPages: 1 }, loading: false, error: null }),
}));
vi.mock('../hooks/useServiceCatalog', () => ({
    default: () => ({ services: [], loading: false, error: null }),
}));
vi.mock('../hooks/usePublicVehicleSelection', () => ({
    default: () => ({ vehicle: { model: '', year: '', displayLabel: '' }, updateVehicle: vi.fn(), clearVehicle: vi.fn(), hasVehicle: false }),
}));
vi.mock('../hooks/usePackageVehicleConfigurations', () => ({
    default: () => ({ configurations: [], loading: false, error: null }),
}));
vi.mock('../hooks/useManagedQuotePackages', () => ({
    default: () => ({ offers: [], repriceIds: [], reset: vi.fn(), acknowledge: vi.fn(), hydrate: vi.fn() }),
}));
vi.mock('../modules/public/components/ManagedQuotePackages', () => ({
    default: () => null,
}));
vi.mock('../services/estimatesApi', () => ({
    createEstimate: vi.fn(),
    revisePublicEstimate: vi.fn(),
    lookupPublicEstimate: vi.fn(async () => ({
        estimate: {
            estimate_number: 'Q-202610241234',
            issued_at: '2026-10-24T00:00:00.000Z',
            valid_until: '2026-11-23',
            subtotal: 100,
            discount_total: 0,
            tax_total: 12,
            grand_total: 112,
        },
        customer: { name: 'Test Customer', phone: '09171234567' },
        vehicle: { make: 'Mitsubishi', model: 'Montero' },
        items: [{ id: 'line-1', line_type: 'product', product_sku: 'MD12345', product_name: 'Oil Filter', quantity: 1, unit_price: 100, line_total: 100 }],
    })),
}));
vi.mock('../modules/quotation/utils/downloadQuotationPdf', () => ({ downloadQuotationPdf: vi.fn(async () => {}) }));

import PublicEstimate from '../modules/public/pages/PublicEstimate';
import { lookupPublicEstimate } from '../services/estimatesApi';
import { downloadQuotationPdf } from '../modules/quotation/utils/downloadQuotationPdf';

describe('public quotation PDF download', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    });

    it('downloads a retrieved quote with its part number and totals', async () => {
        render(<MemoryRouter><ToastProvider><PublicEstimate /></ToastProvider></MemoryRouter>);

        fireEvent.click(screen.getByRole('button', { name: 'Find a Quote' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Quote number' }), { target: { value: 'Q-202610241234' } });
        fireEvent.change(screen.getByRole('textbox', { name: 'Phone number used for quote' }), { target: { value: '09171234567' } });
        fireEvent.click(screen.getByRole('button', { name: 'Retrieve Quote' }));

        await waitFor(() => expect(lookupPublicEstimate).toHaveBeenCalledWith('Q-202610241234', '09171234567'));
        fireEvent.click(await screen.findByRole('button', { name: 'Printable Preview' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));

        await waitFor(() => expect(downloadQuotationPdf).toHaveBeenCalledWith(expect.objectContaining({
            referenceValue: 'Q-202610241234',
            customerName: 'Test Customer',
            total: 112,
            items: [expect.objectContaining({ partNumber: 'MD12345', name: 'Oil Filter', lineTotal: 100 })],
        })));
    });
});

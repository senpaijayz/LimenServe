import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminReservations from '../modules/reservations/pages/AdminReservations';

const api = vi.hoisted(() => ({ createAdminReservation: vi.fn(), getReservation: vi.fn(), getReservationCheckout: vi.fn(), listReservations: vi.fn(), processReservation: vi.fn(), getProductCatalog: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../services/reservationsApi', () => api);
vi.mock('../services/catalogApi', () => ({ getProductCatalog: api.getProductCatalog }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ success: api.success, error: api.error }) }));
const parts = [{ id: 'part-1', name: 'Thermostat', sku: 'MD094120', price: 100 }, { id: 'part-2', name: 'Lock cylinder', sku: '6370A933HA', price: 200 }];
const reservation = { id: 'reservation-1', reservationNumber: 'PR-001-01', product: parts[0], customer: { name: 'Jane', phone: '09171234567' }, requestedQuantity: 2, allocatedQuantity: 2, remainingQuantity: 0, status: 'available', isActive: true, paymentStatus: 'unpaid', unitPrice: 100, lineTotal: 200, order: { id: 'order-1', reservationNumber: 'PR-001', estimatedTotal: 400, partCount: 2, readyForCheckout: true } };

beforeEach(() => {
  vi.clearAllMocks();
  api.listReservations.mockResolvedValue({ reservations: [], total: 0 });
  api.getProductCatalog.mockResolvedValue({ products: parts });
  api.createAdminReservation.mockResolvedValue({ reservation });
});
afterEach(cleanup);

describe('reservation orders', () => {
  it('adds several parts, increments an existing part, totals them and sends only product ids and quantities', async () => {
    render(<AdminReservations />);
    fireEvent.click(screen.getByRole('button', { name: 'Reserve for customer' }));
    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Jane Customer' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '09171234567' } });
    const thermostat = await screen.findByRole('button', { name: /Thermostat.*Add part/ });
    fireEvent.click(thermostat);
    fireEvent.click(thermostat);
    fireEvent.click(screen.getByRole('button', { name: /Lock cylinder.*Add part/ }));
    expect(screen.getAllByLabelText('Quantity').map((input) => input.value)).toEqual(['2', '1']);
    expect(screen.getByText('Estimated total').parentElement.parentElement.textContent).toContain('400.00');
    fireEvent.click(screen.getByRole('button', { name: 'Create reservation' }));
    await waitFor(() => expect(api.createAdminReservation).toHaveBeenCalledTimes(1));
    expect(api.createAdminReservation.mock.calls[0][0].items).toEqual([{ productId: 'part-1', quantity: 2 }, { productId: 'part-2', quantity: 1 }]);
  });

  it('highlights only the missing or invalid fields and clears feedback as they are corrected', async () => {
    render(<AdminReservations />);
    fireEvent.click(screen.getByRole('button', { name: 'Reserve for customer' }));
    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'j' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '09171234567' } });
    fireEvent.click(await screen.findByRole('button', { name: /Thermostat.*Add part/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create reservation' }));
    expect(screen.getByText(/name using at least 2 characters/)).toBeTruthy();
    expect(screen.getByLabelText('Customer name').getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText(/valid phone number/)).toBeNull();
    expect(api.createAdminReservation).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Jane' } });
    expect(screen.queryByText(/name using at least 2 characters/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1.5' } });
    expect(screen.getByText('Use a whole number from 1 to 999.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity for Thermostat' }));
    expect(screen.getByLabelText('Quantity').value).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity for Thermostat' }));
    expect(screen.getByLabelText('Quantity').value).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Thermostat' }));
    expect(screen.getByText(/No parts selected yet/)).toBeTruthy();
    expect(screen.getByText(/Choose at least one part/)).toBeTruthy();
  });

  it('uses current prices and requires cash covering the whole order before posting a sale', async () => {
    api.listReservations.mockResolvedValue({ reservations: [reservation], total: 1 });
    api.getReservationCheckout.mockResolvedValue({ order: reservation.order, items: [{ ...reservation, unitPrice: 150, lineTotal: 300 }], total: 300 });
    api.processReservation.mockResolvedValue({ ...reservation, status: 'completed', sale: { transactionNumber: 'SALE-001', totalAmount: 300 } });
    render(<AdminReservations />);
    fireEvent.click(await screen.findByRole('button', { name: 'Checkout order' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm sale' });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Cash received'), { target: { value: '500' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.processReservation).toHaveBeenCalledWith('reservation-1', expect.objectContaining({ action: 'complete', expectedTotal: 300, paymentMethod: 'cash', cashReceived: 500 })));
    await waitFor(() => expect(api.success).toHaveBeenCalledWith(expect.stringContaining('SALE-001')));
  });

  it('blocks checkout until all order parts are allocated', async () => {
    api.listReservations.mockResolvedValue({ reservations: [{ ...reservation, order: { ...reservation.order, readyForCheckout: false } }], total: 1 });
    render(<AdminReservations />);
    expect((await screen.findByRole('button', { name: 'Checkout order' })).disabled).toBe(true);
    expect(api.getReservationCheckout).not.toHaveBeenCalled();
  });

  it('refreshes changed prices after a rejected checkout without creating another sale', async () => {
    api.listReservations.mockResolvedValue({ reservations: [reservation], total: 1 });
    api.getReservationCheckout.mockResolvedValueOnce({ order: reservation.order, items: [reservation], total: 200 })
      .mockResolvedValueOnce({ order: reservation.order, items: [{ ...reservation, unitPrice: 150, lineTotal: 300 }], total: 300 });
    api.processReservation.mockRejectedValueOnce(new Error('The reservation total changed. Review the current prices before checkout.'));
    render(<AdminReservations />);
    fireEvent.click(await screen.findByRole('button', { name: 'Checkout order' }));
    fireEvent.change(await screen.findByLabelText('Cash received'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sale' }));
    await waitFor(() => expect(screen.getByLabelText('Cash received').min).toBe('300'));
    expect(api.processReservation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Confirm sale' }).disabled).toBe(true);
    expect(api.error).toHaveBeenCalledWith(expect.stringContaining('total changed'));
  });
});

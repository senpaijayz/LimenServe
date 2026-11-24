import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import AuthContext from '../context/auth-context';
import { ToastProvider } from '../components/ui/Toast';

vi.mock('../services/serviceOrdersApi', () => ({
    createServiceOrder: vi.fn(),
    getServiceScheduleSlots: vi.fn(),
    getServiceIntakeResult: vi.fn(async () => ({ orderId: null })),
}));
vi.mock('../services/customerHistoryApi', () => ({ getServiceIntakeContext: vi.fn() }));
vi.mock('../services/mechanicsApi', () => ({ listMechanics: vi.fn() }));
vi.mock('../modules/services/components/SavedCustomerIntake', () => ({ default: () => <div /> }));
vi.mock('../modules/services/components/ServiceOrderModals', () => ({ PartSearch: () => <div /> }));
vi.mock('../components/ui/Modal', () => ({ default: ({ children }) => <div>{children}</div> }));

import ServiceOrderNew from '../modules/services/pages/ServiceOrderNew';
import { createServiceOrder } from '../services/serviceOrdersApi';

function renderForm() {
    localStorage.clear();
    return render(
        <MemoryRouter initialEntries={['/services/new']}>
            <AuthContext.Provider value={{ user: { id: 'staff-1', role: 'cashier' } }}>
                <ToastProvider><ServiceOrderNew /></ToastProvider>
            </AuthContext.Provider>
        </MemoryRouter>,
    );
}

describe('Service order intake validation', () => {
    it('shows separate required-field errors only after Continue is selected', async () => {
        renderForm();
        await waitFor(() => expect(screen.queryByText('Checking this draft for an already-created job…')).toBeNull());

        expect(screen.queryByText('Enter the customer name.')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

        expect(screen.getByText('Enter the customer name.')).toBeTruthy();
        expect(screen.getByText('Enter the vehicle model.')).toBeTruthy();
        expect(screen.getByText('Enter the plate number.')).toBeTruthy();
        expect(screen.queryByText('Add the customer name, vehicle model, and plate number to continue.')).toBeNull();
    });

    it('sanitizes the phone field and accepts a valid Philippine mobile number', async () => {
        renderForm();
        await waitFor(() => expect(screen.queryByText('Checking this draft for an already-created job…')).toBeNull());
        fireEvent.change(screen.getByLabelText(/Customer name/), { target: { value: 'Juan Dela Cruz' } });
        fireEvent.change(screen.getByLabelText(/Vehicle model/), { target: { value: 'Mitsubishi Mirage 2018' } });
        fireEvent.change(screen.getByLabelText(/Plate number/), { target: { value: 'abc 1234' } });
        const phone = screen.getByLabelText(/Phone number/);
        fireEvent.change(phone, { target: { value: 'abc0917-123-4567' } });
        expect(phone.value).toBe('09171234567');
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
        await waitFor(() => expect(screen.getByText('Reported concern and requested work')).toBeTruthy());
        expect(screen.queryByText(/valid Philippine mobile number/)).toBeNull();
    });

    it('preserves the existing intake workflow through service-order creation', async () => {
        createServiceOrder.mockResolvedValueOnce({ id: 'service-1' });
        renderForm();
        await waitFor(() => expect(screen.queryByText('Checking this draft for an already-created job…')).toBeNull());
        fireEvent.change(screen.getByLabelText(/Customer name/), { target: { value: 'Juan Dela Cruz' } });
        fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: '+639171234567' } });
        fireEvent.change(screen.getByLabelText(/Vehicle model/), { target: { value: 'Mitsubishi Mirage 2018' } });
        fireEvent.change(screen.getByLabelText(/Plate number/), { target: { value: 'ABC 1234' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
        await waitFor(() => expect(screen.getByLabelText(/Reported concern/)).toBeTruthy());
        fireEvent.change(screen.getByLabelText(/Reported concern/), { target: { value: 'Brake inspection and cleaning' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
        await waitFor(() => expect(screen.getByText('Optional appointment')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
        await waitFor(() => expect(screen.getByText('Review before creating')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: /Create service order/ }));
        await waitFor(() => expect(createServiceOrder).toHaveBeenCalledWith(expect.objectContaining({
            customerName: 'Juan Dela Cruz', customerPhone: '+639171234567', vehiclePlate: 'ABC 1234', description: 'Brake inspection and cleaning',
        })));
    });
});

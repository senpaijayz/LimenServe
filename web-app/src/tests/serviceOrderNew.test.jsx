import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { createServiceOrder, getServiceScheduleSlots } from '../services/serviceOrdersApi';
import { listMechanics } from '../services/mechanicsApi';

function renderForm(role = 'cashier', { state, draft } = {}) {
    localStorage.clear();
    if (draft) localStorage.setItem('limen-service-intake-draft-v2:staff-1', JSON.stringify(draft));
    return render(
        <MemoryRouter initialEntries={[{ pathname: '/services/new', state }]}>
            <AuthContext.Provider value={{ user: { id: 'staff-1', role } }}>
                <ToastProvider><ServiceOrderNew /></ToastProvider>
            </AuthContext.Provider>
        </MemoryRouter>,
    );
}

describe('Service order intake validation', () => {
    it('adds POS labor to existing requested work before review and submits it as an estimate line', async () => {
        createServiceOrder.mockClear();
        createServiceOrder.mockResolvedValueOnce({ id: 'service-pos' });
        renderForm('cashier', {
            state: { posService: { owner: 'staff-1', id: 'SRV-test', name: 'Brake cleaning', price: 420.25 } },
            draft: { customerName: 'Juan Dela Cruz', vehicleModel: 'Mirage', vehiclePlate: 'ABC 1234', description: 'Inspect front brakes', laborEstimate: '100' },
        });
        const draftButton = screen.getByRole('button', { name: 'Add to this draft' });
        expect(screen.getByRole('button', { name: 'Continue' }).disabled).toBe(true);
        await waitFor(() => expect(draftButton.disabled).toBe(false));
        fireEvent.click(draftButton);
        expect(JSON.parse(localStorage.getItem('limen-service-intake-draft-v2:staff-1')).posLabor).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(screen.getByLabelText(/Reported concern/).value).toBe('Inspect front brakes');
        expect(within(screen.getByRole('region', { name: 'Estimated services from POS' })).getByText('Brake cleaning')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(screen.getByText('Review before creating')).toBeTruthy();
        expect(within(screen.getByRole('region', { name: 'Estimated services from POS' })).getByText(/420\.25/)).toBeTruthy();
        expect(createServiceOrder).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Create service order' }));
        await waitFor(() => expect(createServiceOrder).toHaveBeenCalledWith(expect.objectContaining({
            estimatedCost: 520.25,
            items: [
                expect.objectContaining({ lineType: 'service', itemName: 'Brake cleaning', quantity: 1, unitPrice: 420.25, lineTotal: 420.25 }),
                expect.objectContaining({ lineType: 'service', unitPrice: 100 }),
            ],
        })));
    });

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

    it('shows a red field-level message when an assigned appointment has no selected time', async () => {
        listMechanics.mockResolvedValueOnce([{ id: 'mechanic-1', full_name: 'Test Mechanic', specialization: 'General' }]);
        getServiceScheduleSlots.mockResolvedValueOnce({ slots: [{ start: '2026-11-27T01:00:00.000Z', end: '2026-11-27T02:00:00.000Z', available: true }] });
        renderForm('admin');
        await waitFor(() => expect(screen.queryByText('Checking this draft for an already-created job…')).toBeNull());
        fireEvent.change(screen.getByLabelText(/Customer name/), { target: { value: 'Juan Dela Cruz' } });
        fireEvent.change(screen.getByLabelText(/Vehicle model/), { target: { value: 'Mitsubishi Mirage 2018' } });
        fireEvent.change(screen.getByLabelText(/Plate number/), { target: { value: 'ABC 1234' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
        await waitFor(() => expect(screen.getByLabelText(/Reported concern/)).toBeTruthy());
        fireEvent.change(screen.getByLabelText(/Reported concern/), { target: { value: 'Brake inspection' } });
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
        await waitFor(() => expect(screen.getByText('Optional appointment')).toBeTruthy());
        await waitFor(() => expect(screen.getByRole('option', { name: /Test Mechanic/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Mechanic'), { target: { value: 'mechanic-1' } });
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-27' } });
        await waitFor(() => expect(screen.getByText(/Choose an available time to schedule this appointment/)).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
        expect(screen.getByRole('alert').textContent).toMatch(/Select a mechanic, date, and available time/);
        expect(screen.getByRole('alert').className).toContain('text-red-700');
    });
});

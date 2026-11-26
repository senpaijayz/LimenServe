import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, it, vi } from 'vitest';
import ServiceOrderDetails from '../modules/services/pages/ServiceOrderDetails';
import { finishPosWorkshopIntake, getServiceOrder } from '../services/serviceOrdersApi';

vi.mock('../services/serviceOrdersApi', () => ({
  finishPosWorkshopIntake: vi.fn(),
  getServiceOrder: vi.fn(),
}));
vi.mock('../modules/services/components/SavedCustomerIntake', () => ({ default: () => null }));
vi.mock('../modules/services/components/ServiceOrderModals', () => ({ PriorityBadge: () => null }));
vi.mock('../modules/services/components/ServiceAssignmentPanel', () => ({ default: () => null }));
vi.mock('../modules/services/components/ServiceWorkPanel', () => ({ default: () => <div>Workshop work controls</div> }));

it('shows parts and labor but withholds work and billing until missing customer and vehicle details are saved', async () => {
  const job = { id: 'job-1', posIntakePending: true, status: 'pending', items: [
    { id: 'p1', itemName: 'Brake pads', itemSku: 'BRK', lineType: 'product', quantity: 1, unitPrice: 200, lineTotal: 200 },
    { id: 's1', itemName: 'Install pads', itemSku: 'LABOR', lineType: 'service', quantity: 1, unitPrice: 100, lineTotal: 100 },
  ] };
  getServiceOrder.mockResolvedValueOnce(job);
  finishPosWorkshopIntake.mockResolvedValueOnce({ ...job, posIntakePending: false, customerName: 'Test Customer' });
  render(<MemoryRouter initialEntries={['/services/job-1']}><Routes>
    <Route path="/services/:orderId" element={<ServiceOrderDetails />} />
  </Routes></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Complete customer and vehicle details' });
  expect(screen.getByText('Brake pads')).toBeTruthy();
  expect(screen.getByText('Install pads')).toBeTruthy();
  expect(screen.queryByText('Workshop work controls')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Billing & receipt' })).toBeNull();
  for (const [label, value] of [['Customer name','Test Customer'],['Vehicle make','Mitsubishi'],['Vehicle model','Mirage'],['Plate number','ABC 1234']]) {
    fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
  }
  const save = screen.getByRole('button', { name: 'Save intake details' });
  const phone = screen.getByRole('textbox', { name: 'Phone Number' });
  expect(phone.required).toBe(true);
  expect(phone.maxLength).toBe(9);
  fireEvent.click(save);
  expect(finishPosWorkshopIntake).not.toHaveBeenCalled();
  fireEvent.paste(phone, { clipboardData: { getData: () => '0917 123 4567' } });
  expect(phone.value).toBe('171234567');
  const year = Number(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()));
  const modelYear = screen.getByRole('combobox', { name: 'Vehicle year' });
  expect([...modelYear.options].slice(1).map((option) => Number(option.value)))
    .toEqual(Array.from({ length: year - 1900 + 1 }, (_, index) => year - index));
  fireEvent.change(modelYear, { target: { value: String(year) } });
  fireEvent.click(save);
  await waitFor(() => expect(screen.getByText('Workshop work controls')).toBeTruthy());
  expect(finishPosWorkshopIntake).toHaveBeenCalledWith('job-1', {
    customerName: 'Test Customer', customerPhone: '09171234567',
    vehicleMake: 'Mitsubishi', vehicleModel: 'Mirage', vehiclePlate: 'ABC 1234', vehicleYear: String(year),
  });
  expect(screen.getByText('Install pads')).toBeTruthy();
});

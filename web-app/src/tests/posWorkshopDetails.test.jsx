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
  fireEvent.click(screen.getByRole('button', { name: 'Save intake details' }));
  await waitFor(() => expect(screen.getByText('Workshop work controls')).toBeTruthy());
  expect(finishPosWorkshopIntake).toHaveBeenCalledWith('job-1', {
    customerName: 'Test Customer', vehicleMake: 'Mitsubishi', vehicleModel: 'Mirage', vehiclePlate: 'ABC 1234',
  });
  expect(screen.getByText('Install pads')).toBeTruthy();
});

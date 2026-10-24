import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VehiclePackageShowcase from '../modules/public/components/VehiclePackageShowcase';

const item = (id, name, price, priority, partFunction) => ({
  consequentKind: 'product', packageItemId: `vehicle-part-${id}`,
  recommendedProductId: id, recommendedProductSku: `PART-${priority}`,
  recommendedProductName: name, catalogPrice: price, resolvedPrice: price,
  displayPriority: priority, matchLevel: 'exact_model', partFunction,
});

describe('vehicle package quote card', () => {
  it('updates the headline price and exact contents with the selected tier', () => {
    const onAddBundle = vi.fn();
    render(<VehiclePackageShowcase
      vehicle={{ displayLabel: 'Test vehicle' }}
      packages={[{
        packageKey: 'vehicle-test', packageName: 'Test package',
        packageDescription: 'Verified items', recommendationMode: 'vehicle_bundle', serviceGroup: 'oil_change',
        parts: [item('a', 'Oil filter', 100, 1, 'oil_filter'), item('b', 'Engine oil', 200, 2, 'engine_oil'), item('c', 'Drain washer', 300, 3, 'drain_washer')],
        services: [
          { consequentKind: 'service', packageItemId: 'vehicle-service-one', recommendedServiceId: 'one', recommendedServiceCode: 'LABOR', recommendedServiceName: 'Oil change labor', catalogPrice: 50, resolvedPrice: 50 },
          { consequentKind: 'service', packageItemId: 'vehicle-service-two', recommendedServiceId: 'two', recommendedServiceCode: 'CHECK', recommendedServiceName: 'Inspection', catalogPrice: 75, resolvedPrice: 75 },
        ],
      }]}
      mode="estimate"
      onAddBundle={onAddBundle}
    />);

    expect(screen.getAllByText('₱650.00').length).toBeGreaterThan(0);
    expect(screen.getByText('PART-2')).toBeTruthy();
    expect(screen.getByText('PART-3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Good' }));
    expect(screen.getAllByText('₱350.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('₱650.00')).toBeNull();
    expect(screen.getByText('PART-2')).toBeTruthy();
    expect(screen.queryByText('PART-3')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Best' }));
    expect(screen.getAllByText('₱725.00').length).toBeGreaterThan(0);
    expect(screen.getByText('PART-3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Bundle' }));
    expect(onAddBundle).toHaveBeenCalledWith(expect.objectContaining({ packageKey: 'vehicle-test' }), expect.objectContaining({ tierKey: 'best' }));
  });
});

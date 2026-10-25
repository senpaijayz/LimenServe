import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VehiclePackageShowcase from '../modules/public/components/VehiclePackageShowcase';
import { buildBundleLineItems } from '../modules/public/utils/bundleQuotePricing';

const ids = {
  a: '11111111-1111-4111-8111-111111111111',
  b: '22222222-2222-4222-8222-222222222222',
  c: '33333333-3333-4333-8333-333333333333',
  one: '44444444-4444-4444-8444-444444444444',
  two: '55555555-5555-4555-8555-555555555555',
};

const item = (id, name, price, priority, partFunction) => ({
  consequentKind: 'product', packageItemId: `vehicle-part-${id}`,
  recommendedProductId: ids[id], recommendedProduct: { id: ids[id], name, sku: `PART-${priority}`, price }, recommendedProductSku: `PART-${priority}`,
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
          { consequentKind: 'service', packageItemId: 'vehicle-service-one', recommendedServiceId: ids.one, recommendedServiceCode: 'LABOR', recommendedServiceName: 'Oil change labor', catalogPrice: 50, resolvedPrice: 50 },
          { consequentKind: 'service', packageItemId: 'vehicle-service-two', recommendedServiceId: ids.two, recommendedServiceCode: 'CHECK', recommendedServiceName: 'Inspection', catalogPrice: 75, resolvedPrice: 75 },
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
    const [selectedPackage, selectedTier] = onAddBundle.mock.calls[0];
    const quoteLines = buildBundleLineItems(selectedPackage, selectedTier);
    expect(quoteLines).toHaveLength(5);
    expect(new Set(quoteLines.map((line) => line.id))).toEqual(new Set([ids.a, ids.b, ids.c, ids.one, ids.two]));
    expect(quoteLines.reduce((total, line) => total + line.price, 0)).toBe(725);
  });
});

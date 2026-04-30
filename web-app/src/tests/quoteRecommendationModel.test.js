import { describe, expect, it } from 'vitest';
import { buildSmartQuoteModel } from '../modules/public/utils/quoteRecommendationModel';

const productItem = (id, name, price, priority = 1) => ({
  consequentKind: 'product',
  recommendedProductId: id,
  recommendedProductName: name,
  recommendedPrice: price,
  resolvedPrice: price,
  catalogPrice: price,
  displayPriority: priority,
});

const serviceItem = (id, name, price, priority = 1) => ({
  consequentKind: 'service',
  recommendedServiceId: id,
  recommendedServiceName: name,
  recommendedPrice: price,
  resolvedPrice: price,
  catalogPrice: price,
  displayPriority: priority,
});

describe('quoteRecommendationModel', () => {
  it('chooses the better tier by default and separates labor from optional add-ons', () => {
    const model = buildSmartQuoteModel({
      selectedProduct: { id: 'anchor', name: 'Brake Pad Set', price: 1500 },
      selectedParts: [{ id: 'anchor', name: 'Brake Pad Set', price: 1500, quantity: 2 }],
      selectedServices: [{ id: 'svc-install', name: 'Brake Installation', price: 950 }],
      packages: [{
        packageKey: 'brake-service-package',
        packageName: 'Smart Brake Care Bundle',
        packageDescription: 'Brake parts and labor package.',
        priority: 1,
        parts: [
          productItem('rotor', 'Disc Rotor', 2100, 1),
          productItem('cleaner', 'Brake Cleaner', 320, 2),
          productItem('fluid', 'Brake Fluid', 420, 3),
        ],
        services: [
          serviceItem('svc-install', 'Brake Installation', 950, 1),
          serviceItem('svc-overhaul', 'Brake System Overhaul', 1200, 2),
        ],
      }],
      optionalAddOnIds: ['product:fluid'],
    });

    expect(model.bestPackage.packageKey).toBe('brake-service-package');
    expect(model.activeTier.tierKey).toBe('better');
    expect(model.includedLabor.map((item) => item.name)).toEqual([
      'Brake Installation',
      'Brake System Overhaul',
    ]);
    expect(model.optionalAddOns.map((item) => item.name)).toContain('Brake Fluid');
    expect(model.totals.partsSubtotal).toBe(3000);
    expect(model.totals.servicesSubtotal).toBe(950);
    expect(model.totals.optionalAddOnsSubtotal).toBe(420);
    expect(model.totals.estimatedTotal).toBe(4894.4);
  });

  it('returns a friendly empty reason when no package can be built', () => {
    const model = buildSmartQuoteModel({
      selectedProduct: { id: 'misc', name: 'Unclassified Clip', price: 25 },
      selectedParts: [],
      selectedServices: [],
      packages: [],
      recommendations: [],
    });

    expect(model.bestPackage).toBeNull();
    expect(model.activeTier).toBeNull();
    expect(model.emptyReason).toBe('No automatic bundle found for this product yet. You can still request a custom quotation.');
    expect(model.totals.estimatedTotal).toBe(0);
  });
});

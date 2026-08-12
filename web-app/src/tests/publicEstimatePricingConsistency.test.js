import { describe, expect, it } from 'vitest';

import {
  buildEstimatePayload,
  normalizePublicRecommendationPricing,
} from '../modules/public/pages/PublicEstimate';
import { buildSmartQuoteModel } from '../modules/public/utils/quoteRecommendationModel';
import { getAppliedBundleSummaries } from '../modules/public/utils/bundleQuotePricing';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

describe('public estimate pricing consistency', () => {
  it('shows and submits catalogue pricing for an unverifiable synthetic bundle item', () => {
    const pricing = normalizePublicRecommendationPricing({
      recommendationRuleId: `vehicle-part-${PRODUCT_ID}`,
      resolvedPrice: 95,
      catalogPrice: 100,
      bundleMeta: {
        bundleKey: 'vehicle-maintenance:better',
        bundleName: 'Maintenance bundle',
        bundleTierLabel: 'Better',
      },
    });
    const selectedPart = {
      id: PRODUCT_ID,
      name: 'Oil Filter',
      sku: 'FILTER-1',
      quantity: 1,
      isUpsell: true,
      recommendationRuleId: pricing.recommendationRuleId,
      price: pricing.price,
      catalogPrice: pricing.catalogPrice,
      ...pricing.bundleMeta,
    };
    const displayed = buildSmartQuoteModel({
      selectedProduct: selectedPart,
      selectedParts: [selectedPart],
      selectedServices: [],
    });
    const submitted = buildEstimatePayload({
      customerName: 'Customer',
      customerPhone: '09171234567',
      vehicle: { model: '', year: '', plateNo: '', displayLabel: '' },
      selectedParts: [selectedPart],
      selectedServices: [],
    });

    expect(pricing).toMatchObject({
      price: 100,
      catalogPrice: 100,
      recommendationRuleId: null,
    });
    expect(pricing.bundleMeta.bundleKey).toBeNull();
    expect(getAppliedBundleSummaries([selectedPart])).toEqual([]);
    expect(displayed.totals).toMatchObject({
      subtotal: 100,
      vat: 12,
      estimatedTotal: 112,
    });
    expect(submitted.estimate).toMatchObject({
      subtotal: displayed.totals.subtotal,
      discount_total: 0,
      tax_total: displayed.totals.vat,
      grand_total: displayed.totals.estimatedTotal,
    });
    expect(submitted.items[0]).toMatchObject({
      unit_price: 100,
      line_total: 100,
      recommendation_rule_id: null,
      bundle_key: null,
    });
  });
});

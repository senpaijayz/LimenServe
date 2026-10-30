import { packageError, priceManagedPackageVariant } from './managedPackageDomain.js';

// Shared by public quotations, staff published previews and CMS list summaries.
export function pricePublishedManagedVariant(publication, variant, references) {
  const approved = Array.isArray(publication.pricingSnapshot)
    ? publication.pricingSnapshot.find((value) => value.variantId === variant.id) : null;
  if (!approved || !Array.isArray(approved.lines)) throw packageError('This package needs a pricing review before it can be added.', 409);
  const basePrices = Object.fromEntries(approved.lines.map((line) => [line.itemId, line.catalogUnitPrice]));
  if (variant.pricing.strategy !== 'live' && variant.items.filter((item) => item.active).some((item) => basePrices[item.id] == null)) {
    throw packageError('This package is missing its approved price snapshot.', 409);
  }
  const price = priceManagedPackageVariant(variant, references, { publishedBasePrices: basePrices });
  return { ...price, valid: true, lines: price.lines.map((line) => ({
    itemId: line.itemId, kind: line.kind, productId: line.productId, serviceId: line.serviceId,
    sku: line.sku, name: line.name, quantity: line.quantity, required: line.required,
    priceMode: line.priceMode, catalogUnitPrice: line.catalogUnitPrice,
    catalogTotal: line.catalogTotal, effectiveTotal: line.effectiveTotal, savings: line.savings,
    allocations: line.allocations,
  })) };
}

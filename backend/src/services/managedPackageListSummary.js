import { priceManagedPackageVariant } from './managedPackageDomain.js';
import { pricePublishedManagedVariant } from './publishedManagedPackagePricing.js';

export function linkedPackagePublication(draft, revision) {
  return revision && revision.id === draft.published_revision_id && revision.package_id === draft.id
    && revision?.definition?.id === draft.id && Array.isArray(revision.definition.variants)
    ? revision : null;
}

export function packageSummaryDefinition(draft, revision) {
  return draft.publication_status === 'published' ? linkedPackagePublication(draft, revision)?.definition || null : draft;
}

export function summarizeManagedPackage(draft, revision, references) {
  const published = draft.publication_status === 'published';
  const definition = packageSummaryDefinition(draft, revision);
  const summary = {
    summarySource: published ? 'published' : 'draft',
    summaryName: definition?.name || null,
    summaryRevision: published ? linkedPackagePublication(draft, revision)?.revision_number ?? null : draft.expectedRevision,
    summaryError: null,
  };
  if (!definition) return { ...summary,
    summaryError: 'The published version could not be confirmed. Draft prices are not shown in its place. Refresh or review the package history.',
    itemCount: null, eligibility: [], variants: [],
  };
  const variants = definition.variants.filter((variant) => variant.active);
  return {
    ...summary,
    itemCount: variants.reduce((count, variant) => count + variant.items.filter((item) => item.active).length, 0),
    eligibility: [...definition.eligibility, ...variants.flatMap((variant) => variant.eligibility)],
    variants: variants.map((variant) => {
      try {
        const price = published
          ? pricePublishedManagedVariant({ pricingSnapshot: revision.pricing_snapshot }, variant, references)
          : priceManagedPackageVariant(variant, references);
        return { variantId: variant.id, label: variant.label, catalogTotal: price.catalogTotal,
          packageTotal: price.packageTotal, savings: price.savings, availability: price.availability };
      } catch (error) {
        if (!error.statusCode) throw error;
        return { variantId: variant.id, label: variant.label, error: error.publicMessage };
      }
    }),
  };
}

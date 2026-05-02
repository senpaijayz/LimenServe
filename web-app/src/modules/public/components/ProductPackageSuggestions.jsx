import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Sparkles, Wrench, PackagePlus, ArrowRight } from 'lucide-react';
import { getProductRecommendationPackages } from '../../../services/analyticsApi';
import { formatCurrency } from '../../../utils/formatters';
import {
  buildPackageTiers,
  formatVehicleDisplayLabel,
  getDefaultHighlightedTier,
  groupRecommendations,
  normalizePackage,
} from '../utils/smartBundleUtils';
import { buildSmartQuoteModel } from '../utils/quoteRecommendationModel';

function getMatchBadge(matchLevel) {
  switch (matchLevel) {
    case 'exact_model':
      return { label: 'Exact Match', className: 'bg-accent-success/10 text-accent-success' };
    case 'family_match':
      return { label: 'Family Match', className: 'bg-accent-blue/10 text-accent-blue' };
    case 'service_bundle':
      return { label: 'Bundle Labor', className: 'bg-accent-primary/10 text-accent-primary' };
    case 'curated_override':
      return { label: 'Curated Match', className: 'bg-accent-warning/10 text-accent-warning' };
    default:
      return { label: 'Smart Match', className: 'bg-primary-100 text-primary-600' };
  }
}

function renderNames(items = [], kind) {
  const filtered = items.filter((item) => ((item.consequentKind || item.consequent_kind) === 'service') === (kind === 'service'));
  return filtered.map((item) => item.recommendedProductName || item.recommendedServiceName).filter(Boolean);
}

function renderItemList(items = [], kind, limit = 4) {
  const names = renderNames(items, kind);
  if (names.length === 0) {
    return ['Not included yet'];
  }

  const visibleNames = names.slice(0, limit);
  return names.length > limit ? [...visibleNames, `+${names.length - limit} more`] : visibleNames;
}

function isTierAdded(tier, selectedProductIds = [], selectedServiceIds = []) {
  if (!tier?.items?.length) {
    return false;
  }

  return tier.items.every((item) => {
    const isService = (item.consequentKind || item.consequent_kind) === 'service';
    const id = isService ? item.recommendedServiceId : item.recommendedProductId;
    return isService ? selectedServiceIds.includes(id) : selectedProductIds.includes(id);
  });
}

const ProductPackageSuggestions = ({
  product,
  vehicleModelId = null,
  vehicleContext = null,
  onAddProduct = null,
  onAddService = null,
  onAddBundle = null,
  selectedProductIds = [],
  selectedServiceIds = [],
  title = 'Smart Mitsubishi Bundles',
  subtitle = 'Data-driven upsell packages of matched parts and services for the selected Mitsubishi part.',
  compact = false,
  smartQuote = false,
  anchorQuantity = 1,
  bundleMode = 'estimate',
  buildBundleHref = null,
  highlightedPackageKey = '',
  onRemoveProduct = null,
  onRemoveService = null,
}) => {
  const [packages, setPackages] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [highlightedTiers, setHighlightedTiers] = useState({});
  const [activePackageKey, setActivePackageKey] = useState('');

  const activeVehicleLabel = vehicleContext?.displayLabel || formatVehicleDisplayLabel({
    model: vehicleModelId || product?.model || product?.vehicleModelName || '',
    year: vehicleContext?.year || '',
    engine: vehicleContext?.engine || '',
  });

  useEffect(() => {
    let active = true;

    if (!product?.id) {
      setPackages([]);
      setRecommendations([]);
      setError(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const loadRecommendations = async () => {
      setLoading(true);
      setError(null);

      try {
        const nextData = await getProductRecommendationPackages(product.id, vehicleContext?.model || vehicleModelId, 6, 4);

        if (!active) {
          return;
        }

        setPackages(nextData?.packages ?? []);
        setRecommendations(nextData?.recommendations ?? []);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setPackages([]);
        setRecommendations([]);
        setError(loadError.message || 'Failed to load smart recommendation bundles.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadRecommendations();

    return () => {
      active = false;
    };
  }, [product?.id, vehicleContext?.model, vehicleModelId]);

  const groupedPackages = useMemo(() => {
    const sourcePackages = packages.length > 0
      ? packages.map((pkg, index) => normalizePackage(pkg, index))
      : groupRecommendations(recommendations).map((pkg, index) => normalizePackage(pkg, index));

    return sourcePackages
      .filter((pkg) => (pkg.parts?.length ?? 0) > 0 || (pkg.services?.length ?? 0) > 0)
      .sort((left, right) => Number(left.priority ?? 100) - Number(right.priority ?? 100));
  }, [packages, recommendations]);

  useEffect(() => {
    const next = {};
    groupedPackages.forEach((pkg) => {
      const tiers = buildPackageTiers(pkg);
      next[pkg.packageKey] = getDefaultHighlightedTier(tiers);
    });
    setHighlightedTiers(next);
  }, [groupedPackages, product?.id]);

  const defaultPackageKey = (
    highlightedPackageKey
      ? groupedPackages.find((pkg) => pkg.packageKey === highlightedPackageKey)?.packageKey
      : null
  ) || groupedPackages[0]?.packageKey || '';
  const resolvedActivePackageKey = groupedPackages.some((pkg) => pkg.packageKey === activePackageKey)
    ? activePackageKey
    : defaultPackageKey;
  const primaryPackage = groupedPackages.find((pkg) => pkg.packageKey === resolvedActivePackageKey) || groupedPackages[0] || null;
  const activeTierKey = primaryPackage
    ? (highlightedTiers[primaryPackage.packageKey] ?? getDefaultHighlightedTier(buildPackageTiers(primaryPackage)))
    : null;
  const smartQuoteModel = buildSmartQuoteModel({
    selectedProduct: product,
    packages: primaryPackage ? [primaryPackage] : groupedPackages,
    recommendations,
    activeTierKey,
  });

  if (!product) {
    return null;
  }

  const handleFallbackBundleAdd = (tier) => {
    tier.items.forEach((item) => {
      const isService = (item.consequentKind || item.consequent_kind) === 'service';
      if (isService) {
        if (typeof onAddService === 'function') {
          onAddService(item);
        }
        return;
      }

      if (typeof onAddProduct === 'function' && item.recommendedProduct) {
        onAddProduct({
          ...item.recommendedProduct,
          price: Number(item.resolvedPrice ?? item.recommendedPrice ?? item.recommendedProduct.price ?? 0),
        });
      }
    });
  };

  const isQuoteItemSelected = (item) => (
    item.kind === 'service'
      ? selectedServiceIds.includes(item.id)
      : selectedProductIds.includes(item.id)
  );

  const handleOptionalAddOnToggle = (item) => {
    if (item.kind === 'service') {
      if (isQuoteItemSelected(item)) {
        onRemoveService?.(item.id);
        return;
      }

      onAddService?.(item.raw);
      return;
    }

    if (isQuoteItemSelected(item)) {
      onRemoveProduct?.(item.id);
      return;
    }

    onAddProduct?.(item.raw);
  };

  const panelClassName = compact
    ? 'min-w-0 overflow-hidden rounded-xl border border-primary-200 bg-primary-50/70 p-2'
    : 'min-w-0 overflow-hidden rounded-[28px] border border-primary-200 bg-primary-50/70 p-4 sm:p-6';

  if (smartQuote) {
    const activeTier = smartQuoteModel.activeTier;
    const activeTierAdded = activeTier ? isTierAdded(activeTier, selectedProductIds, selectedServiceIds) : false;
    const bundleCtaLabel = activeTierAdded ? 'Bundle Added' : activeTier ? `Add ${activeTier.badgeLabel} Bundle` : 'Add Bundle';

    return (
      <div className="overflow-hidden rounded-[28px] border border-primary-200 bg-white shadow-[0_18px_54px_rgba(15,23,42,0.10)]">
        <div className="bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 px-4 py-4 text-white sm:px-5 lg:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/75">
                <Sparkles className="h-3.5 w-3.5" />
                Recommended based on selected product
              </div>
              <h4 className="mt-3 text-xl font-display font-bold tracking-tight text-white sm:text-2xl">
                {title}
              </h4>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
                {subtitle}
              </p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/10 px-4 py-3 lg:min-w-[230px]">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/50">Selected product</p>
              <p className="mt-2 line-clamp-2 text-base font-display font-semibold text-white">{product.name}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-white/65">
                {product.sku && <span className="rounded-full bg-white/10 px-3 py-1">{product.sku}</span>}
                <span className="rounded-full bg-white/10 px-3 py-1">{formatCurrency(Number(product.price ?? 0))}</span>
                <span className="rounded-full bg-white/10 px-3 py-1">Qty {anchorQuantity}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5 lg:p-6">
          {loading ? (
            <div className="flex items-center gap-3 rounded-[24px] border border-primary-200 bg-primary-50 p-5 text-sm text-primary-500">
              <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
              Matching the best bundle, labor, and optional add-ons...
            </div>
          ) : error ? (
            <div className="rounded-[24px] border border-accent-danger/20 bg-accent-danger/5 p-5 text-sm text-accent-danger">
              {error}
              <span className="mt-2 block text-primary-600">You can still continue with a custom quotation.</span>
            </div>
          ) : !smartQuoteModel.bestPackage ? (
            <div className="rounded-[24px] border border-dashed border-primary-300 bg-primary-50/80 p-6 text-sm text-primary-500">
              <p className="text-lg font-display font-semibold text-primary-950">Custom quotation available</p>
              <p className="mt-2">{smartQuoteModel.emptyReason}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {smartQuoteModel.badges.map((badge) => (
                  <div key={badge} className="rounded-2xl border border-primary-200 bg-primary-50/80 px-3 py-2.5">
                    <span className="block text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary-400">Smart badge</span>
                    <span className="mt-1 block text-sm font-semibold text-primary-950">{badge}</span>
                  </div>
                ))}
              </div>

              {groupedPackages.length > 1 && (
                <div className="rounded-[22px] border border-primary-200 bg-primary-50/80 p-2">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {groupedPackages.slice(0, 4).map((pkg, index) => {
                      const isActivePackage = pkg.packageKey === primaryPackage?.packageKey;

                      return (
                        <button
                          key={`${pkg.packageKey}-package-tab`}
                          type="button"
                          onClick={() => setActivePackageKey(pkg.packageKey)}
                          className={`min-h-[68px] rounded-2xl px-3 py-2 text-left transition ${
                            isActivePackage
                              ? 'bg-primary-950 text-white shadow-sm'
                              : 'bg-white text-primary-600 hover:text-primary-950'
                          }`}
                          aria-pressed={isActivePackage}
                        >
                          <span className={`block text-[0.62rem] font-bold uppercase tracking-[0.2em] ${isActivePackage ? 'text-white/55' : 'text-primary-400'}`}>
                            Bundle {index + 1}
                          </span>
                          <span className="mt-1 line-clamp-1 block text-sm font-semibold">{pkg.packageName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="overflow-hidden rounded-[24px] border border-accent-blue/25 bg-accent-blue/5">
                <div className="border-b border-accent-blue/15 bg-white/80 px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-accent-blue">Best recommended bundle</p>
                      <h5 className="mt-2 text-xl font-display font-bold text-primary-950 sm:text-2xl">{smartQuoteModel.bestPackage.packageName}</h5>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-600">{smartQuoteModel.bestPackage.packageDescription}</p>
                    </div>
                    <div className="rounded-[20px] bg-primary-950 px-4 py-3 text-white lg:min-w-[200px]">
                      <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/50">Package impact</p>
                      <p className="mt-2 text-2xl font-display font-bold">{formatCurrency(smartQuoteModel.totals.bundleSubtotal)}</p>
                      {smartQuoteModel.totals.bundleSavings > 0 && (
                        <p className="mt-1 text-sm font-semibold text-accent-success">Save {formatCurrency(smartQuoteModel.totals.bundleSavings)}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-primary-200 bg-white p-1.5">
                    {smartQuoteModel.tiers.map((tier) => {
                      const isActive = tier.tierKey === activeTier?.tierKey;

                      return (
                        <button
                          key={`${smartQuoteModel.bestPackage.packageKey}-${tier.tierKey}-smart-quote`}
                          type="button"
                          onClick={() => setHighlightedTiers((current) => ({
                            ...current,
                            [smartQuoteModel.bestPackage.packageKey]: tier.tierKey,
                          }))}
                          className={`min-h-12 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] transition ${
                            isActive
                              ? 'bg-accent-blue text-white shadow-sm'
                              : 'bg-primary-50 text-primary-500 hover:text-primary-950'
                          }`}
                          aria-pressed={isActive}
                        >
                          {tier.badgeLabel}
                        </button>
                      );
                    })}
                  </div>

                  {activeTier && (
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="rounded-[24px] border border-primary-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <span className="inline-flex rounded-full bg-accent-blue px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white">
                              {activeTier.badgeLabel}
                            </span>
                            <h6 className="mt-3 text-xl font-display font-bold text-primary-950">{activeTier.title}</h6>
                            <p className="mt-2 text-sm leading-6 text-primary-500">
                              {activeTier.description} This bundle includes the most commonly requested labor for this product.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => (typeof onAddBundle === 'function' ? onAddBundle(smartQuoteModel.bestPackage, activeTier) : handleFallbackBundleAdd(activeTier))}
                            disabled={activeTierAdded}
                            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-primary-200 disabled:text-primary-500"
                          >
                            {bundleCtaLabel}
                          </button>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-4">
                            <span className="block text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary-400">Included materials</span>
                            <div className="mt-3 space-y-2">
                              {smartQuoteModel.includedParts.length === 0 ? (
                                <p className="text-sm text-primary-500">No extra material included in this tier.</p>
                              ) : smartQuoteModel.includedParts.map((item) => (
                                <div key={item.key} className="flex items-start justify-between gap-3 text-sm">
                                  <span className="font-semibold text-primary-950">{item.name}</span>
                                  <span className="font-bold text-accent-blue">{formatCurrency(item.price)}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-4">
                            <span className="block text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary-400">Included labor / services</span>
                            <div className="mt-3 space-y-2">
                              {smartQuoteModel.includedLabor.length === 0 ? (
                                <p className="text-sm text-primary-500">No automatic labor found. Staff can still confirm service requirements.</p>
                              ) : smartQuoteModel.includedLabor.map((item) => (
                                <div key={item.key} className="flex items-start justify-between gap-3 text-sm">
                                  <span className="font-semibold text-primary-950">{item.name}</span>
                                  <span className="font-bold text-accent-blue">{formatCurrency(item.price)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-primary-200 bg-white p-4">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-primary-400">Recommendation total</p>
                        <div className="mt-4 space-y-3 text-sm">
                          <div className="flex justify-between text-primary-600">
                            <span>Selected product</span>
                            <span className="font-semibold text-primary-950">{formatCurrency(Number(product.price ?? 0) * Number(anchorQuantity ?? 1))}</span>
                          </div>
                          <div className="flex justify-between text-primary-600">
                            <span>{activeTier.badgeLabel} bundle</span>
                            <span className="font-semibold text-primary-950">{formatCurrency(activeTier.smartTotal || 0)}</span>
                          </div>
                          {activeTier.savingsAmount > 0 && (
                            <div className="flex justify-between text-accent-success">
                              <span>Smart savings</span>
                              <span className="font-semibold">{formatCurrency(activeTier.savingsAmount)}</span>
                            </div>
                          )}
                          <div className="border-t border-primary-200 pt-3">
                            <p className="text-xs leading-5 text-primary-500">
                              You can still customize your quotation before submitting. Final price may vary after confirmation.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-primary-200 bg-primary-50/80 p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-primary-400">Optional upgrades</p>
                    <h5 className="mt-2 text-xl font-display font-bold text-primary-950">Add-ons that match this product</h5>
                    <p className="mt-1 text-sm text-primary-500">Select only what the customer wants to include in the quotation.</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {smartQuoteModel.optionalAddOns.length === 0 ? (
                    <div className="md:col-span-2 rounded-2xl border border-dashed border-primary-300 bg-white p-5 text-sm text-primary-500">
                      No optional add-ons beyond the selected tier are available yet.
                    </div>
                  ) : smartQuoteModel.optionalAddOns.map((item) => {
                    const selected = isQuoteItemSelected(item);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleOptionalAddOnToggle(item)}
                        className={`min-h-[92px] rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-accent-blue bg-accent-blue/5 ring-1 ring-accent-blue/20'
                            : 'border-primary-200 bg-white hover:border-accent-blue/50 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="inline-flex rounded-full bg-primary-100 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-primary-500">
                              {item.kind === 'service' ? 'Optional labor' : 'Optional part'}
                            </span>
                            <p className="mt-2 text-sm font-semibold text-primary-950">{item.name}</p>
                            {item.reasonLabel && <p className="mt-1 text-xs text-primary-500">{item.reasonLabel}</p>}
                          </div>
                          <span className="shrink-0 text-sm font-bold text-accent-blue">{formatCurrency(item.price)}</span>
                        </div>
                        <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          selected ? 'bg-accent-success/10 text-accent-success' : 'bg-primary-50 text-primary-500'
                        }`}>
                          {selected ? 'Added to quote' : 'Add to quote'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={panelClassName}>
      <div className={`${compact ? 'mb-2' : 'mb-5'} flex items-start gap-3`}>
        <div className={`${compact ? 'hidden' : 'flex'} h-10 w-10 items-center justify-center rounded-2xl border border-accent-primary/20 bg-accent-primary/5 text-accent-primary`}>
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`${compact ? 'text-base' : 'text-lg'} font-display font-semibold text-primary-950`}>{title}</h4>
            {!compact && <span className="rounded-full bg-primary-950 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">Good / Better / Best</span>}
          </div>
          {!compact && <p className="mt-1 text-sm text-primary-500">{subtitle}</p>}
          <p className={`${compact ? 'mt-1 text-[10px]' : 'mt-2 text-xs'} font-semibold uppercase tracking-[0.22em] text-primary-400`}>
            Based on: {product.name} - {activeVehicleLabel}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-primary-200 bg-white p-4 text-sm text-primary-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
          Loading smart Mitsubishi bundles...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-accent-danger/20 bg-accent-danger/5 p-4 text-sm text-accent-danger">{error}</div>
      ) : groupedPackages.length === 0 ? (
        <div className="rounded-2xl border border-primary-200 bg-white p-4 text-sm text-primary-500 shadow-sm">
          No smart package has been learned for {activeVehicleLabel} yet.
        </div>
      ) : (
        <div className="space-y-4">
          {groupedPackages.slice(0, 1).map((pkg) => {
            const tiers = buildPackageTiers(pkg);
            const highlightedTierKey = highlightedTiers[pkg.packageKey] ?? getDefaultHighlightedTier(tiers);
            const activeTier = tiers.find((tier) => tier.tierKey === highlightedTierKey) || tiers[0];
            const quantityRequirement = Number(pkg.minAnchorQuantity ?? 1) > 1
              ? `${pkg.minAnchorQuantity}x selected part required`
              : 'Bundle-ready';
            const isQuantityEligible = Number(anchorQuantity ?? 1) >= Number(pkg.minAnchorQuantity ?? 1);
            const added = isTierAdded(activeTier, selectedProductIds, selectedServiceIds);
            const ctaLabel = bundleMode === 'catalog' ? 'Build This Bundle' : added ? 'Bundle Added' : 'Add Bundle';
            const linkTarget = typeof buildBundleHref === 'function' ? buildBundleHref(pkg, activeTier) : '#';
            const activeParts = renderItemList(activeTier?.items || [], 'product', compact ? 2 : 4);
            const activeServices = renderItemList(activeTier?.items || [], 'service', compact ? 2 : 4);

            return (
              <div
                key={pkg.packageKey}
                className={`overflow-hidden rounded-[22px] border bg-white shadow-sm ${highlightedPackageKey === pkg.packageKey ? 'border-accent-blue ring-2 ring-accent-blue/20' : 'border-primary-200'}`}
              >
                <div className={`${compact ? 'px-3 py-2' : 'px-4 py-3 sm:px-5'} border-b border-primary-200 bg-gradient-to-br from-white to-primary-50`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="text-base font-display font-semibold text-primary-950 sm:text-lg">{pkg.packageName}</h5>
                        {!compact && <span className="rounded-full bg-primary-950 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">{pkg.recommendationLabel || 'Smart Recommendation'}</span>}
                      </div>
                      {!compact && <p className="mt-1 text-sm text-primary-500">{pkg.packageDescription}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {pkg.serviceGroup && (
                        <span className="rounded-full bg-primary-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary-600">{pkg.serviceGroup.replace(/_/g, ' ')}</span>
                      )}
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${isQuantityEligible ? 'bg-accent-success/10 text-accent-success' : 'bg-accent-warning/10 text-accent-warning'}`}>{quantityRequirement}</span>
                    </div>
                  </div>
                </div>

                <div className={compact ? 'px-3 py-3' : 'px-4 py-4 sm:px-5'}>
                  <div className={`${compact ? 'mb-2 rounded-xl px-3 py-2' : 'mb-3 rounded-2xl px-4 py-3'} bg-primary-950 text-white`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">{activeTier?.badgeLabel || 'Bundle'} total</p>
                        <div className="mt-1 flex items-end gap-3">
                          <p className={`${compact ? 'text-lg' : 'text-xl'} font-display font-bold text-white`}>{formatCurrency(activeTier?.smartTotal || 0)}</p>
                          {(activeTier?.savingsAmount || 0) > 0 && <p className="text-xs text-white/45 line-through">{formatCurrency(activeTier?.catalogTotal || 0)}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">{activeTier?.items?.length || 0} smart item{activeTier?.items?.length === 1 ? '' : 's'}</p>
                        <p className="mt-1 text-sm font-semibold text-accent-success">{(activeTier?.savingsAmount || 0) > 0 ? `Save ${formatCurrency(activeTier.savingsAmount)}` : 'Fitment-first pricing'}</p>
                      </div>
                    </div>
                  </div>

                  <div className={`${compact ? 'mb-2 gap-1 rounded-xl p-1' : 'mb-3 gap-2 rounded-2xl p-1.5'} grid grid-cols-3 border border-primary-200 bg-primary-50`}>
                    {tiers.map((tier) => {
                      const isHighlighted = tier.tierKey === highlightedTierKey;

                      return (
                        <button
                          key={`${pkg.packageKey}-${tier.tierKey}`}
                          type="button"
                          onClick={() => setHighlightedTiers((current) => ({ ...current, [pkg.packageKey]: tier.tierKey }))}
                          className={`${compact ? 'min-h-9 rounded-lg py-1.5 text-[10px]' : 'min-h-11 rounded-xl py-2 text-[11px] sm:text-xs'} px-2 text-center font-bold uppercase tracking-[0.16em] transition ${isHighlighted ? 'bg-accent-blue text-white shadow-sm' : 'bg-white text-primary-500 hover:text-primary-950'}`}
                        >
                          {tier.badgeLabel}
                        </button>
                      );
                    })}
                  </div>

                  <div className={`${compact ? 'rounded-xl p-3' : 'rounded-2xl p-4'} border border-primary-200 bg-white`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <span className="inline-flex rounded-full bg-accent-blue/10 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-accent-blue">{activeTier?.badgeLabel}</span>
                        <h6 className={`${compact ? 'mt-1 text-base' : 'mt-2 text-lg'} font-display font-semibold text-primary-950`}>{activeTier?.title}</h6>
                        {!compact && <p className="mt-1 text-sm leading-relaxed text-primary-500">{activeTier?.description}</p>}
                      </div>
                      {(activeTier?.savingsAmount || 0) > 0 && (
                        <span className="shrink-0 rounded-full bg-accent-success/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-accent-success">Save {formatCurrency(activeTier.savingsAmount)}</span>
                      )}
                    </div>

                    <div className={`${compact ? 'mt-2 gap-2' : 'mt-4 gap-3'} grid sm:grid-cols-2`}>
                      <div className={`${compact ? 'rounded-xl p-2' : 'rounded-2xl p-3'} bg-primary-50`}>
                        <span className="block text-[0.64rem] font-bold uppercase tracking-[0.2em] text-primary-400">Included parts</span>
                        <div className="mt-1 space-y-0.5">
                          {activeParts.map((name) => (
                            <p key={`part-${name}`} className="text-sm font-semibold text-primary-950">{name}</p>
                          ))}
                        </div>
                      </div>
                      <div className={`${compact ? 'rounded-xl p-2' : 'rounded-2xl p-3'} bg-primary-50`}>
                        <span className="block text-[0.64rem] font-bold uppercase tracking-[0.2em] text-primary-400">Included labor</span>
                        <div className="mt-1 space-y-0.5">
                          {activeServices.map((name) => (
                            <p key={`service-${name}`} className="text-sm font-semibold text-primary-950">{name}</p>
                          ))}
                        </div>
                      </div>
                    </div>

                    {!compact && <div className="mt-3 flex flex-wrap gap-2">
                      {(activeTier?.items || []).slice(0, 3).map((item) => {
                        const matchBadge = getMatchBadge(item.matchLevel);
                        const isService = (item.consequentKind || item.consequent_kind) === 'service';
                        return (
                          <span key={`${item.recommendedProductId || item.recommendedServiceId}-${item.matchLevel || item.match_level || 'tier'}`} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${matchBadge.className}`}>
                            {isService ? <Wrench className="h-3 w-3" /> : <PackagePlus className="h-3 w-3" />} {matchBadge.label}
                          </span>
                        );
                      })}
                    </div>}

                    <div className={`${compact ? 'mt-3 pt-3' : 'mt-4 pt-4'} flex flex-col gap-3 border-t border-primary-200 sm:flex-row sm:items-center sm:justify-between`}>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-3 text-primary-500">
                          <span>Normal total</span>
                          <span className="font-semibold text-primary-400 line-through">{formatCurrency(activeTier?.catalogTotal || 0)}</span>
                        </div>
                        <div className="flex items-center gap-3 font-semibold text-primary-950">
                          <span>Package total</span>
                          <span className="text-accent-blue">{formatCurrency(activeTier?.smartTotal || 0)}</span>
                        </div>
                      </div>

                      {bundleMode === 'catalog' ? (
                        <Link to={linkTarget} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-800">
                          {ctaLabel} <ArrowRight className="h-4 w-4" />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => (typeof onAddBundle === 'function' ? onAddBundle(pkg, activeTier) : handleFallbackBundleAdd(activeTier))}
                          disabled={added}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-primary-200 disabled:text-primary-500"
                        >
                          {ctaLabel}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductPackageSuggestions;

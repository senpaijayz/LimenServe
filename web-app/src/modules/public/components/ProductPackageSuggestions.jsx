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
  anchorQuantity = 1,
  bundleMode = 'estimate',
  buildBundleHref = null,
  highlightedPackageKey = '',
}) => {
  const [packages, setPackages] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [highlightedTiers, setHighlightedTiers] = useState({});

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

  const panelClassName = compact
    ? 'min-w-0 overflow-hidden rounded-xl border border-primary-200 bg-primary-50/70 p-2'
    : 'min-w-0 overflow-hidden rounded-[28px] border border-primary-200 bg-primary-50/70 p-4 sm:p-6';

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

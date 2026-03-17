import { useEffect, useMemo, useState } from 'react';
import { Loader2, PackagePlus, Sparkles, Wrench } from 'lucide-react';
import { getProductRecommendationPackages } from '../../../services/analyticsApi';
import { formatCurrency } from '../../../utils/formatters';

const defaultPackageDescription = 'Matched parts and labor that fit this Mitsubishi vehicle.';

function getDefaultTab(pkg) {
  return (pkg.parts?.length ?? 0) > 0 ? 'parts' : 'services';
}

function normalizePackage(pkg = {}, index = 0) {
  return {
    packageId: pkg.packageId ?? pkg.package_id ?? null,
    packageKey: pkg.packageKey ?? pkg.package_key ?? pkg.packageName ?? `suggested-package-${index}`,
    packageName: pkg.packageName ?? pkg.package_name ?? 'Suggested Package',
    packageDescription: pkg.packageDescription ?? pkg.package_description ?? defaultPackageDescription,
    serviceGroup: pkg.serviceGroup ?? pkg.service_group ?? null,
    minAnchorQuantity: Number(pkg.minAnchorQuantity ?? pkg.min_anchor_quantity ?? 1),
    priority: Number(pkg.priority ?? pkg.packagePriority ?? pkg.package_priority ?? 100),
    vehicleModelName: pkg.vehicleModelName ?? pkg.vehicle_model_name ?? null,
    vehicleFamily: pkg.vehicleFamily ?? pkg.vehicle_family ?? null,
    parts: Array.isArray(pkg.parts) ? pkg.parts : [],
    services: Array.isArray(pkg.services) ? pkg.services : [],
  };
}

function groupRecommendations(recommendations = []) {
  const groupedPackages = new Map();

  recommendations.forEach((recommendation, index) => {
    const packageKey = recommendation.packageKey || recommendation.package_key || recommendation.packageName || `suggested-package-${index}`;
    const kind = recommendation.consequentKind || recommendation.consequent_kind || (recommendation.recommendedServiceId ? 'service' : 'product');

    if (!groupedPackages.has(packageKey)) {
      groupedPackages.set(packageKey, normalizePackage({
        packageId: recommendation.packageId ?? recommendation.package_id ?? null,
        packageKey,
        packageName: recommendation.packageName || recommendation.package_name || 'Suggested Package',
        packageDescription: recommendation.packageDescription || recommendation.package_description || defaultPackageDescription,
        serviceGroup: recommendation.serviceGroup || recommendation.service_group || null,
        minAnchorQuantity: recommendation.minAnchorQuantity ?? recommendation.min_anchor_quantity ?? recommendation.packageMinAnchorQuantity ?? 1,
        vehicleModelName: recommendation.vehicleModelName || recommendation.vehicle_model_name || null,
        vehicleFamily: recommendation.vehicleFamily || recommendation.vehicle_family || null,
      }, index));
    }

    const targetPackage = groupedPackages.get(packageKey);
    const targetItems = kind === 'service' ? targetPackage.services : targetPackage.parts;
    targetItems.push(recommendation);
  });

  return Array.from(groupedPackages.values());
}

function getMatchBadge(matchLevel) {
  switch (matchLevel) {
    case 'exact_model':
      return { label: 'Exact Vehicle Match', className: 'bg-accent-success/10 text-accent-success' };
    case 'family_match':
      return { label: 'Same Mitsubishi Family', className: 'bg-accent-blue/10 text-accent-blue' };
    case 'service_bundle':
      return { label: 'Service Bundle', className: 'bg-accent-primary/10 text-accent-primary' };
    case 'curated_override':
      return { label: 'Curated Rule', className: 'bg-accent-warning/10 text-accent-warning' };
    default:
      return { label: 'Compatible Match', className: 'bg-primary-100 text-primary-600' };
  }
}

function getPricingBadge(pricingMode, displayPriceLabel) {
  if (pricingMode === 'complimentary') {
    return { label: displayPriceLabel || 'Free With Package', className: 'bg-accent-success/10 text-accent-success' };
  }

  if (pricingMode === 'override') {
    return { label: displayPriceLabel || 'Package Rate', className: 'bg-accent-warning/10 text-accent-warning' };
  }

  if (displayPriceLabel) {
    return { label: displayPriceLabel, className: 'bg-primary-100 text-primary-600' };
  }

  return null;
}

const ProductPackageSuggestions = ({
  product,
  vehicleModelId = null,
  onAddProduct = null,
  onAddService = null,
  selectedProductIds = [],
  selectedServiceIds = [],
  title = 'Compatible Mitsubishi Package',
  subtitle = 'Vehicle-matched parts and services based on the selected Mitsubishi part.',
  compact = false,
  anchorQuantity = 1,
}) => {
  const [packages, setPackages] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTabs, setActiveTabs] = useState({});

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
        const nextData = await getProductRecommendationPackages(product.id, vehicleModelId, 6, 4);

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
        setError(loadError.message || 'Failed to load package suggestions.');
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
  }, [product?.id, vehicleModelId]);

  const groupedPackages = useMemo(() => {
    const sourcePackages = packages.length > 0
      ? packages.map((pkg, index) => normalizePackage(pkg, index))
      : groupRecommendations(recommendations).map((pkg, index) => normalizePackage(pkg, index));

    return sourcePackages
      .filter((pkg) => (pkg.parts?.length ?? 0) > 0 || (pkg.services?.length ?? 0) > 0)
      .sort((left, right) => Number(left.priority ?? 100) - Number(right.priority ?? 100));
  }, [packages, recommendations]);

  useEffect(() => {
    setActiveTabs((currentTabs) => {
      const nextTabs = {};

      groupedPackages.forEach((pkg) => {
        nextTabs[pkg.packageKey] = currentTabs[pkg.packageKey] ?? getDefaultTab(pkg);
      });

      return nextTabs;
    });
  }, [groupedPackages]);

  const activeVehicleLabel = vehicleModelId || product?.model || product?.vehicleModelName || 'this Mitsubishi vehicle';

  if (!product) {
    return null;
  }

  const panelClassName = compact
    ? 'min-w-0 overflow-hidden rounded-2xl border border-primary-200 bg-primary-50/70 p-3 sm:p-4'
    : 'min-w-0 overflow-hidden rounded-2xl border border-primary-200 bg-primary-50/70 p-4 sm:p-6';
  const panelHeaderClassName = compact ? 'mb-4 flex items-start gap-2.5' : 'mb-5 flex items-start gap-3';
  const panelIconClassName = compact
    ? 'flex h-9 w-9 items-center justify-center rounded-xl border border-accent-primary/20 bg-accent-primary/5 text-accent-primary'
    : 'flex h-10 w-10 items-center justify-center rounded-xl border border-accent-primary/20 bg-accent-primary/5 text-accent-primary';
  const panelTitleClassName = compact ? 'text-base font-display font-semibold text-primary-950' : 'text-lg font-display font-semibold text-primary-950';
  const panelSubtitleClassName = compact ? 'mt-1 text-xs leading-relaxed text-primary-500' : 'mt-1 text-sm text-primary-500';
  const panelMetaClassName = compact
    ? 'mt-2 break-words text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-400'
    : 'mt-2 break-words text-xs font-semibold uppercase tracking-[0.22em] text-primary-400';
  const packageCardClassName = compact
    ? 'min-w-0 rounded-2xl border border-primary-200 bg-white p-3 shadow-sm'
    : 'min-w-0 rounded-2xl border border-primary-200 bg-white p-4 shadow-sm';
  const packageTitleClassName = compact ? 'text-sm font-display font-semibold text-primary-950' : 'text-base font-display font-semibold text-primary-950';
  const packageDescriptionClassName = compact ? 'mt-1 text-xs leading-relaxed text-primary-500' : 'mt-1 text-sm text-primary-500';
  const itemCardClassName = compact
    ? 'flex w-[14.75rem] shrink-0 snap-start flex-col gap-2.5 rounded-xl border border-primary-200 bg-primary-50/60 p-3 sm:w-[16rem] lg:w-[17.5rem] xl:w-[18.25rem]'
    : 'flex w-[16.5rem] shrink-0 snap-start flex-col gap-3 rounded-xl border border-primary-200 bg-primary-50/60 p-4 sm:w-[18.75rem] lg:w-[21.25rem] xl:w-[23.25rem]';
  const itemBadgeClassName = compact
    ? 'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]'
    : 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.2em]';
  const itemMatchBadgeClassName = compact
    ? 'inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]'
    : 'inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em]';
  const itemServiceGroupClassName = compact
    ? 'text-[10px] font-medium uppercase tracking-[0.14em] text-primary-500'
    : 'text-xs font-medium uppercase tracking-[0.16em] text-primary-500';
  const itemNameClassName = compact
    ? 'break-words text-[13px] font-semibold leading-snug text-primary-950'
    : 'break-words text-sm font-semibold text-primary-950';
  const itemReasonClassName = compact
    ? 'mt-1 break-words text-[11px] leading-relaxed text-primary-500'
    : 'mt-1 break-words text-xs text-primary-500';
  const itemPriceClassName = compact
    ? 'text-[13px] font-bold text-accent-blue'
    : 'text-sm font-bold text-accent-blue';
  const itemButtonClassName = compact
    ? 'inline-flex w-full min-w-[120px] items-center justify-center rounded-xl border border-primary-200 px-3 py-2 text-xs font-semibold text-primary-700 transition hover:border-accent-primary hover:bg-accent-primary/5 hover:text-accent-primary disabled:cursor-not-allowed disabled:border-primary-100 disabled:bg-primary-100 disabled:text-primary-400'
    : 'inline-flex w-full min-w-[132px] items-center justify-center rounded-xl border border-primary-200 px-4 py-2 text-sm font-semibold text-primary-700 transition hover:border-accent-primary hover:bg-accent-primary/5 hover:text-accent-primary disabled:cursor-not-allowed disabled:border-primary-100 disabled:bg-primary-100 disabled:text-primary-400';

  return (
    <div className={panelClassName}>
      <div className={panelHeaderClassName}>
        <div className={panelIconClassName}>
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h4 className={panelTitleClassName}>{title}</h4>
          <p className={panelSubtitleClassName}>{subtitle}</p>
          <p className={panelMetaClassName}>
            Based on: {product.name} {activeVehicleLabel ? ` - ${activeVehicleLabel}` : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-white p-4 text-sm text-primary-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
          Loading compatible Mitsubishi package suggestions...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 p-4 text-sm text-accent-danger">
          {error}
        </div>
      ) : groupedPackages.length === 0 ? (
        <div className="rounded-xl border border-primary-200 bg-white p-4 text-sm text-primary-500 shadow-sm">
          No same-vehicle package has been learned for {activeVehicleLabel} yet.
        </div>
      ) : (
        <div className="space-y-4">
          {groupedPackages.map((pkg) => {
            const activeTab = activeTabs[pkg.packageKey] ?? getDefaultTab(pkg);
            const activeItems = activeTab === 'services' ? pkg.services : pkg.parts;
            const isQuantityEligible = Number(anchorQuantity ?? 1) >= Number(pkg.minAnchorQuantity ?? 1);
            const quantityRequirement = Number(pkg.minAnchorQuantity ?? 1) > 1
              ? `${pkg.minAnchorQuantity}x selected part required`
              : 'Bundle-ready';

            return (
              <div key={pkg.packageKey} className={packageCardClassName}>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h5 className={packageTitleClassName}>{pkg.packageName}</h5>
                      <p className={packageDescriptionClassName}>{pkg.packageDescription || defaultPackageDescription}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {pkg.serviceGroup && (
                        <span className="rounded-full bg-primary-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary-600">
                          {pkg.serviceGroup.replace(/_/g, ' ')}
                        </span>
                      )}
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${isQuantityEligible ? 'bg-accent-success/10 text-accent-success' : 'bg-accent-warning/10 text-accent-warning'}`}>
                        {quantityRequirement}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-primary-50 p-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveTabs((current) => ({ ...current, [pkg.packageKey]: 'parts' }))}
                      className={`rounded-xl px-3 py-2 text-left transition ${activeTab === 'parts' ? 'bg-white shadow-sm text-primary-950' : 'text-primary-500 hover:text-primary-900'}`}
                    >
                      <span className="block text-[11px] font-bold uppercase tracking-[0.18em]">Recommended Parts</span>
                      <span className="mt-1 block text-sm font-semibold">{pkg.parts.length} item{pkg.parts.length === 1 ? '' : 's'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTabs((current) => ({ ...current, [pkg.packageKey]: 'services' }))}
                      className={`rounded-xl px-3 py-2 text-left transition ${activeTab === 'services' ? 'bg-white shadow-sm text-primary-950' : 'text-primary-500 hover:text-primary-900'}`}
                    >
                      <span className="block text-[11px] font-bold uppercase tracking-[0.18em]">Recommended Services</span>
                      <span className="mt-1 block text-sm font-semibold">{pkg.services.length} item{pkg.services.length === 1 ? '' : 's'}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 w-full max-w-full overflow-hidden">
                  {activeItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/60 p-4 text-sm text-primary-500">
                      No {activeTab === 'services' ? 'service' : 'part'} recommendations are available for this package yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto overscroll-x-contain pb-2">
                      <div className="flex w-max min-w-full snap-x snap-mandatory gap-3 lg:gap-4">
                        {activeItems.map((item) => {
                          const isProduct = (item.consequentKind || item.consequent_kind) === 'product';
                          const id = isProduct ? item.recommendedProductId : item.recommendedServiceId;
                          const isSelected = isProduct
                            ? selectedProductIds.includes(id)
                            : selectedServiceIds.includes(id);
                          const itemName = isProduct ? item.recommendedProductName : item.recommendedServiceName;
                          const actionHandler = isProduct ? onAddProduct : onAddService;
                          const canAdd = typeof actionHandler === 'function' && id;
                          const matchBadge = getMatchBadge(item.matchLevel);
                          const pricingBadge = getPricingBadge(item.pricingMode, item.displayPriceLabel);
                          const requiresQuantity = !isProduct && item.pricingMode === 'complimentary' && !isQuantityEligible;
                          const resolvedPrice = Number(item.resolvedPrice ?? item.recommendedPrice ?? 0);

                          return (
                            <div
                              key={`${item.consequentKind || item.consequent_kind}-${id || itemName}`}
                              className={itemCardClassName}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`${itemBadgeClassName} ${isProduct ? 'bg-accent-blue/10 text-accent-blue' : 'bg-accent-success/10 text-accent-success'}`}>
                                    {isProduct ? <PackagePlus className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
                                    {isProduct ? 'Part' : 'Service'}
                                  </span>
                                  <span className={`${itemMatchBadgeClassName} ${matchBadge.className}`}>
                                    {matchBadge.label}
                                  </span>
                                  {pricingBadge && (
                                    <span className={`${itemMatchBadgeClassName} ${pricingBadge.className}`}>
                                      {pricingBadge.label}
                                    </span>
                                  )}
                                  {item.serviceGroup && (
                                    <span className={itemServiceGroupClassName}>
                                      {item.serviceGroup.replace(/_/g, ' ')}
                                    </span>
                                  )}
                                </div>

                                <div className="mt-2 flex flex-col gap-2">
                                  <div className="min-w-0">
                                    <p className={itemNameClassName}>{itemName}</p>
                                    <p className={itemReasonClassName}>
                                      {item.reasonLabel || 'Compatible Mitsubishi recommendation'}
                                      {item.vehicleModelName ? ` - ${item.vehicleModelName}` : ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <p className={itemPriceClassName}>
                                      {item.pricingMode === 'complimentary' ? (item.displayPriceLabel || 'Free With Package') : formatCurrency(resolvedPrice)}
                                    </p>
                                    {requiresQuantity && (
                                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-warning">
                                        Need {pkg.minAnchorQuantity}x selected part
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {canAdd && (
                                <button
                                  type="button"
                                  onClick={() => actionHandler(item)}
                                  disabled={isSelected || requiresQuantity}
                                  className={itemButtonClassName}
                                >
                                  {requiresQuantity
                                    ? `Need ${pkg.minAnchorQuantity}x Part`
                                    : isSelected
                                      ? 'Added'
                                      : isProduct
                                        ? 'Add Part'
                                        : 'Add Service'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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

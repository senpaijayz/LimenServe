import { useEffect, useMemo, useState } from 'react';
import { Loader2, PackagePlus, Sparkles, Wrench } from 'lucide-react';
import { getProductUpsellRecommendations } from '../../../services/analyticsApi';
import { formatCurrency } from '../../../utils/formatters';

const defaultPackageDescription = 'Matched parts and labor that fit this Mitsubishi vehicle.';

function groupRecommendations(recommendations = []) {
  const groupedPackages = new Map();

  recommendations.forEach((recommendation, index) => {
    const packageKey = recommendation.packageKey || recommendation.packageName || `suggested-package-${index}`;
    const existingPackage = groupedPackages.get(packageKey);

    if (existingPackage) {
      existingPackage.items.push(recommendation);
      return;
    }

    groupedPackages.set(packageKey, {
      key: packageKey,
      name: recommendation.packageName || 'Suggested Package',
      description: recommendation.packageDescription || defaultPackageDescription,
      items: [recommendation],
    });
  });

  return Array.from(groupedPackages.values());
}

function getMatchBadge(matchLevel) {
  switch (matchLevel) {
    case 'exact_model':
      return { label: 'Exact Vehicle Match', className: 'bg-accent-success/10 text-accent-success' };
    case 'family_match':
      return { label: 'Same Mitsubishi Family', className: 'bg-accent-blue/10 text-accent-blue' };
    case 'curated_override':
      return { label: 'Curated Rule', className: 'bg-accent-warning/10 text-accent-warning' };
    default:
      return { label: 'Compatible Match', className: 'bg-primary-100 text-primary-600' };
  }
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
}) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    if (!product?.id) {
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
        const nextRecommendations = await getProductUpsellRecommendations(product.id, vehicleModelId, 6);

        if (!active) {
          return;
        }

        setRecommendations(nextRecommendations);
      } catch (loadError) {
        if (!active) {
          return;
        }

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

  const groupedPackages = useMemo(() => groupRecommendations(recommendations), [recommendations]);
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
  const packageHeaderClassName = compact
    ? 'mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'
    : 'mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between';
  const packageTitleClassName = compact ? 'text-sm font-display font-semibold text-primary-950' : 'text-base font-display font-semibold text-primary-950';
  const packageDescriptionClassName = compact ? 'mt-1 text-xs leading-relaxed text-primary-500' : 'mt-1 text-sm text-primary-500';
  const packageCountClassName = compact
    ? 'w-fit rounded-full bg-primary-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary-600'
    : 'w-fit rounded-full bg-primary-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-primary-600';
  const itemCardClassName = compact
    ? 'flex w-[14.5rem] shrink-0 snap-start flex-col gap-2.5 rounded-xl border border-primary-200 bg-primary-50/60 p-3 sm:w-[15.75rem] lg:w-[17rem] xl:w-[18rem] sm:flex-row sm:items-center sm:justify-between'
    : 'flex w-[16.5rem] shrink-0 snap-start flex-col gap-3 rounded-xl border border-primary-200 bg-primary-50/60 p-4 sm:w-[18.5rem] lg:w-[21rem] xl:w-[23rem] sm:flex-row sm:items-center sm:justify-between';
  const itemBadgeClassName = compact
    ? 'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]'
    : 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.2em]';
  const itemMatchBadgeClassName = compact
    ? 'inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]'
    : 'inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em]';
  const itemServiceGroupClassName = compact
    ? 'text-[10px] font-medium uppercase tracking-[0.14em] text-primary-500'
    : 'text-xs font-medium uppercase tracking-[0.16em] text-primary-500';
  const itemBodyClassName = compact
    ? 'mt-1.5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between'
    : 'mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between';
  const itemNameClassName = compact
    ? 'break-words text-[13px] font-semibold leading-snug text-primary-950'
    : 'break-words text-sm font-semibold text-primary-950';
  const itemReasonClassName = compact
    ? 'mt-1 break-words text-[11px] leading-relaxed text-primary-500'
    : 'mt-1 break-words text-xs text-primary-500';
  const itemPriceClassName = compact
    ? 'text-[13px] font-bold text-accent-blue sm:pl-2'
    : 'text-sm font-bold text-accent-blue sm:pl-3';
  const itemButtonClassName = compact
    ? 'inline-flex w-full min-w-[120px] items-center justify-center rounded-xl border border-primary-200 px-3 py-2 text-xs font-semibold text-primary-700 transition hover:border-accent-primary hover:bg-accent-primary/5 hover:text-accent-primary disabled:cursor-not-allowed disabled:border-primary-100 disabled:bg-primary-100 disabled:text-primary-400 sm:w-auto'
    : 'inline-flex w-full min-w-[132px] items-center justify-center rounded-xl border border-primary-200 px-4 py-2 text-sm font-semibold text-primary-700 transition hover:border-accent-primary hover:bg-accent-primary/5 hover:text-accent-primary disabled:cursor-not-allowed disabled:border-primary-100 disabled:bg-primary-100 disabled:text-primary-400 sm:w-auto';

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
          {groupedPackages.map((pkg) => (
            <div key={pkg.key} className={packageCardClassName}>
              <div className={packageHeaderClassName}>
                <div className="min-w-0">
                  <h5 className={packageTitleClassName}>{pkg.name}</h5>
                  <p className={packageDescriptionClassName}>{pkg.description || defaultPackageDescription}</p>
                </div>
                <span className={packageCountClassName}>
                  {pkg.items.length} items
                </span>
              </div>

              <div className="w-full max-w-full overflow-hidden">
                <div className="overflow-x-auto overscroll-x-contain pb-2">
                  <div className="flex w-max min-w-full snap-x snap-mandatory gap-3 lg:gap-4">
                    {pkg.items.map((item) => {
                      const isProduct = item.consequentKind === 'product';
                      const id = isProduct ? item.recommendedProductId : item.recommendedServiceId;
                      const isSelected = isProduct
                        ? selectedProductIds.includes(id)
                        : selectedServiceIds.includes(id);
                      const itemName = isProduct ? item.recommendedProductName : item.recommendedServiceName;
                      const actionHandler = isProduct ? onAddProduct : onAddService;
                      const canAdd = typeof actionHandler === 'function' && id;
                      const matchBadge = getMatchBadge(item.matchLevel);

                      return (
                        <div
                          key={`${item.consequentKind}-${id || itemName}`}
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
                              {item.serviceGroup && (
                                <span className={itemServiceGroupClassName}>
                                  {item.serviceGroup.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>

                            <div className={itemBodyClassName}>
                              <div className="min-w-0">
                                <p className={itemNameClassName}>{itemName}</p>
                                <p className={itemReasonClassName}>
                                  {item.reasonLabel || 'Compatible Mitsubishi recommendation'}
                                  {item.vehicleModelName ? ` - ${item.vehicleModelName}` : ''}
                                </p>
                              </div>
                              <p className={itemPriceClassName}>{formatCurrency(Number(item.recommendedPrice ?? 0))}</p>
                            </div>
                          </div>

                          {canAdd && (
                            <button
                              type="button"
                              onClick={() => actionHandler(item)}
                              disabled={isSelected}
                              className={itemButtonClassName}
                            >
                              {isSelected ? 'Added' : isProduct ? 'Add Part' : 'Add Service'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductPackageSuggestions;

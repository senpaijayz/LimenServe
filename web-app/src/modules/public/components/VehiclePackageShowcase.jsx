import { BatteryCharging, Droplets, Gauge, ShieldCheck, Sparkles, Thermometer, Wrench, ArrowRight, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../../utils/formatters';
import {
  buildPackageTiers,
  getDefaultHighlightedTier,
  normalizePackage,
} from '../utils/smartBundleUtils';

const serviceGroupIconMap = {
  oil_change: Droplets,
  brake_service: ShieldCheck,
  cooling_service: Thermometer,
  battery_service: BatteryCharging,
  tune_up: Gauge,
  filter_service: Filter,
  tire_service: Wrench,
};

function summarizeIncluded(items = [], kind) {
  const relevantItems = items.filter((item) => ((item.consequentKind || item.consequent_kind) === 'service') === (kind === 'service'));
  return relevantItems.map((item) => item.recommendedProductName || item.recommendedServiceName).filter(Boolean);
}

function renderPreviewList(items = []) {
  if (items.length === 0) {
    return 'None yet';
  }

  const preview = items.slice(0, 2).join(' • ');
  return items.length > 2 ? `${preview} +${items.length - 2} more` : preview;
}

function isTierSelected(tier, selectedProductIds = [], selectedServiceIds = []) {
  if (!tier?.items?.length) {
    return false;
  }

  return tier.items.every((item) => {
    const isService = (item.consequentKind || item.consequent_kind) === 'service';
    const id = isService ? item.recommendedServiceId : item.recommendedProductId;
    return isService ? selectedServiceIds.includes(id) : selectedProductIds.includes(id);
  });
}

export default function VehiclePackageShowcase({
  vehicle,
  packages = [],
  loading = false,
  error = null,
  mode = 'catalog',
  onAddBundle = null,
  buildBundleHref = null,
  selectedProductIds = [],
  selectedServiceIds = [],
  title = 'Recommended service bundles',
  subtitle = 'Visual Mitsubishi service-led bundles tuned to the vehicle you selected.',
  emptyLabel = 'Choose a vehicle to unlock recommended packages.',
  highlightPackageKey = '',
}) {
  const normalizedPackages = packages.map((pkg, index) => normalizePackage(pkg, index));

  return (
    <div className="surface p-5 md:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary-400">Vehicle packages</p>
          <h3 className="mt-2 text-2xl font-display font-semibold text-primary-950">{title}</h3>
          <p className="mt-2 max-w-3xl text-sm text-primary-500">{subtitle}</p>
        </div>
        {vehicle?.displayLabel && (
          <div className="rounded-[22px] border border-primary-200 bg-primary-50/70 px-4 py-3 text-sm text-primary-600">
            <span className="block text-[0.68rem] font-bold uppercase tracking-[0.22em] text-primary-400">Best for your selected vehicle</span>
            <span className="mt-2 block text-base font-semibold text-primary-950">{vehicle.displayLabel}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-primary-200 bg-white p-4 text-sm text-primary-500">Loading matched Mitsubishi packages...</div>
      ) : error ? (
        <div className="rounded-2xl border border-accent-danger/20 bg-accent-danger/5 p-4 text-sm text-accent-danger">{error}</div>
      ) : normalizedPackages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-primary-200 bg-white p-5 text-sm text-primary-500">{emptyLabel}</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {normalizedPackages.map((pkg) => {
            const Icon = serviceGroupIconMap[pkg.serviceGroup] || Sparkles;
            const tiers = buildPackageTiers(pkg);
            const highlightedTierKey = getDefaultHighlightedTier(tiers);

            return (
              <div
                key={pkg.packageKey}
                className={`overflow-hidden rounded-[28px] border bg-white shadow-sm transition ${highlightPackageKey === pkg.packageKey ? 'border-accent-blue ring-2 ring-accent-blue/20' : 'border-primary-200'}`}
              >
                <div className="border-b border-primary-200 bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 px-5 py-5 text-white">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/80">
                        <Icon className="h-3.5 w-3.5" /> Service-led bundle
                      </div>
                      <h4 className="mt-3 text-2xl font-display font-semibold tracking-tight text-white">{pkg.packageName}</h4>
                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">{pkg.packageDescription}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-left lg:min-w-[180px] lg:text-right">
                      <span className="block text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/55">Package total</span>
                      <span className="mt-2 block text-2xl font-bold text-white">{formatCurrency(pkg.smartTotal || 0)}</span>
                      {pkg.savingsAmount > 0 && (
                        <span className="mt-1 block text-sm font-semibold text-accent-success">Save {formatCurrency(pkg.savingsAmount)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-5 py-5">
                  <div className="mb-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-primary-200 bg-primary-50/70 px-4 py-3">
                      <span className="block text-[0.68rem] font-bold uppercase tracking-[0.22em] text-primary-400">Included parts</span>
                      <span className="mt-2 block text-sm font-semibold text-primary-950">{renderPreviewList(summarizeIncluded(pkg.parts, 'product'))}</span>
                    </div>
                    <div className="rounded-2xl border border-primary-200 bg-primary-50/70 px-4 py-3">
                      <span className="block text-[0.68rem] font-bold uppercase tracking-[0.22em] text-primary-400">Included labor</span>
                      <span className="mt-2 block text-sm font-semibold text-primary-950">{renderPreviewList(summarizeIncluded(pkg.services, 'service'))}</span>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    {tiers.map((tier) => {
                      const alreadySelected = isTierSelected(tier, selectedProductIds, selectedServiceIds);
                      const isHighlighted = tier.tierKey === highlightedTierKey;
                      const ctaLabel = mode === 'estimate' ? (alreadySelected ? 'Bundle Added' : 'Add Bundle') : 'Build This Bundle';
                      const linkTarget = typeof buildBundleHref === 'function' ? buildBundleHref(pkg, tier) : '#';

                      return (
                        <div
                          key={`${pkg.packageKey}-${tier.tierKey}`}
                          className={`flex h-full flex-col rounded-[24px] border p-4 transition ${isHighlighted ? 'border-accent-blue bg-accent-blue/5 shadow-sm' : 'border-primary-200 bg-primary-50/40'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className={`inline-flex rounded-full px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.22em] ${isHighlighted ? 'bg-accent-blue text-white' : 'bg-white text-primary-600 border border-primary-200'}`}>
                                {tier.badgeLabel}
                              </span>
                              <h5 className="mt-3 text-base font-display font-semibold text-primary-950">{tier.title}</h5>
                            </div>
                            {tier.savingsAmount > 0 && (
                              <span className="rounded-full bg-accent-success/10 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-accent-success">
                                Save {formatCurrency(tier.savingsAmount)}
                              </span>
                            )}
                          </div>

                          <p className="mt-3 text-sm leading-relaxed text-primary-500">{tier.description}</p>

                          <div className="mt-4 space-y-3 rounded-2xl bg-white/80 p-3">
                            <div>
                              <span className="block text-[0.64rem] font-bold uppercase tracking-[0.2em] text-primary-400">Parts</span>
                              <span className="mt-1 block text-sm font-semibold text-primary-950">{renderPreviewList(summarizeIncluded(tier.parts, 'product'))}</span>
                            </div>
                            <div>
                              <span className="block text-[0.64rem] font-bold uppercase tracking-[0.2em] text-primary-400">Labor</span>
                              <span className="mt-1 block text-sm font-semibold text-primary-950">{renderPreviewList(summarizeIncluded(tier.services, 'service'))}</span>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2 rounded-2xl border border-primary-200 bg-white px-3 py-3">
                            <div className="flex items-center justify-between text-sm text-primary-500">
                              <span>Normal total</span>
                              <span className="font-semibold text-primary-400 line-through">{formatCurrency(tier.catalogTotal || 0)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm font-semibold text-primary-950">
                              <span>Package total</span>
                              <span className="text-accent-blue">{formatCurrency(tier.smartTotal || 0)}</span>
                            </div>
                          </div>

                          <div className="mt-4 pt-1">
                            {mode === 'estimate' ? (
                              <button
                                type="button"
                                onClick={() => onAddBundle?.(pkg, tier)}
                                disabled={alreadySelected || typeof onAddBundle !== 'function'}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-primary-200 disabled:text-primary-500"
                              >
                                {ctaLabel}
                              </button>
                            ) : (
                              <Link
                                to={linkTarget}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-800"
                              >
                                {ctaLabel} <ArrowRight className="h-4 w-4" />
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

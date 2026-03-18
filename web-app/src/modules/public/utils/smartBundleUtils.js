const defaultPackageDescription = 'Data-driven Mitsubishi upsell bundles with matched parts, services, and light package savings.';

const tierCopy = {
  good: {
    badge: 'Good',
    title: 'Essential Care',
    description: 'Start with the core matched parts and labor for this job.',
  },
  better: {
    badge: 'Better',
    title: 'Recommended Care',
    description: 'Best-value bundle with stronger coverage and savings.',
  },
  best: {
    badge: 'Best',
    title: 'Complete Care',
    description: 'Full smart bundle for the most complete preventive work.',
  },
};

export const SERVICE_GROUP_MARKETING_COPY = {
  oil_change: {
    heroTitle: 'Oil Change Package',
    subtitle: 'Fresh oil, filter, washer, and labor for a cleaner maintenance stop.',
  },
  brake_service: {
    heroTitle: 'Brake Refresh Package',
    subtitle: 'Pads, cleaner, fluid, and brake labor grouped into one confidence package.',
  },
  cooling_service: {
    heroTitle: 'Cooling System Restore',
    subtitle: 'Cooling-system parts and labor bundled to help prevent heat-related failures.',
  },
  battery_service: {
    heroTitle: 'Battery + Charging Check',
    subtitle: 'Battery support parts and electrical service bundled for a safer start-up routine.',
  },
  tune_up: {
    heroTitle: 'Tune-Up Package',
    subtitle: 'Ignition and intake essentials matched with labor for smoother performance.',
  },
  filter_service: {
    heroTitle: 'Filter Service Package',
    subtitle: 'Air, cabin, and fuel-flow maintenance grouped into one cleaner service stop.',
  },
  tire_service: {
    heroTitle: 'Tire Care Package',
    subtitle: 'Tire support parts plus balancing and alignment-ready service bundle.',
  },
};

export function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function getPublicPackageCopy(serviceGroup, fallbackName, fallbackDescription) {
  const marketingCopy = SERVICE_GROUP_MARKETING_COPY[serviceGroup];

  return {
    packageName: marketingCopy?.heroTitle || fallbackName || 'Smart Mitsubishi Bundle',
    packageDescription: marketingCopy?.subtitle || fallbackDescription || defaultPackageDescription,
  };
}

export function summarizePackageItems(parts = [], services = []) {
  const items = [...parts, ...services];
  const catalogTotal = items.reduce((sum, item) => sum + toNumber(item.catalogPrice ?? item.recommendedPrice ?? item.resolvedPrice, 0), 0);
  const smartTotal = items.reduce((sum, item) => sum + toNumber(item.resolvedPrice ?? item.recommendedPrice, 0), 0);
  const savingsAmount = Math.max(catalogTotal - smartTotal, 0);
  const savingsPercent = catalogTotal > 0 && savingsAmount > 0
    ? Math.round((savingsAmount / catalogTotal) * 100)
    : 0;

  return {
    itemCount: items.length,
    catalogTotal,
    smartTotal,
    savingsAmount,
    savingsPercent,
  };
}

export function normalizePackage(pkg = {}, index = 0) {
  const parts = Array.isArray(pkg.parts) ? pkg.parts : [];
  const services = Array.isArray(pkg.services) ? pkg.services : [];
  const summary = summarizePackageItems(parts, services);
  const packageCopy = getPublicPackageCopy(
    pkg.serviceGroup ?? pkg.service_group ?? null,
    pkg.packageName ?? pkg.package_name ?? null,
    pkg.packageDescription ?? pkg.package_description ?? null,
  );

  return {
    packageId: pkg.packageId ?? pkg.package_id ?? null,
    packageKey: pkg.packageKey ?? pkg.package_key ?? pkg.packageName ?? `suggested-package-${index}`,
    packageName: packageCopy.packageName,
    packageDescription: packageCopy.packageDescription,
    serviceGroup: pkg.serviceGroup ?? pkg.service_group ?? null,
    minAnchorQuantity: Number(pkg.minAnchorQuantity ?? pkg.min_anchor_quantity ?? 1),
    priority: Number(pkg.priority ?? pkg.packagePriority ?? pkg.package_priority ?? 100),
    vehicleModelName: pkg.vehicleModelName ?? pkg.vehicle_model_name ?? null,
    vehicleFamily: pkg.vehicleFamily ?? pkg.vehicle_family ?? null,
    recommendationMode: pkg.recommendationMode ?? pkg.recommendation_mode ?? 'smart_bundle',
    recommendationLabel: pkg.recommendationLabel ?? pkg.recommendation_label ?? 'Smart Recommendation',
    catalogTotal: toNumber(pkg.catalogTotal ?? pkg.catalog_total, summary.catalogTotal),
    smartTotal: toNumber(pkg.smartTotal ?? pkg.smart_total, summary.smartTotal),
    savingsAmount: toNumber(pkg.savingsAmount ?? pkg.savings_amount, summary.savingsAmount),
    savingsPercent: toNumber(pkg.savingsPercent ?? pkg.savings_percent, summary.savingsPercent),
    itemCount: Number(pkg.itemCount ?? pkg.item_count ?? summary.itemCount),
    parts,
    services,
  };
}

export function groupRecommendations(recommendations = []) {
  const groupedPackages = new Map();

  recommendations.forEach((recommendation, index) => {
    const packageKey = recommendation.packageKey || recommendation.package_key || recommendation.packageName || `suggested-package-${index}`;
    const kind = recommendation.consequentKind || recommendation.consequent_kind || (recommendation.recommendedServiceId ? 'service' : 'product');

    if (!groupedPackages.has(packageKey)) {
      groupedPackages.set(packageKey, normalizePackage({
        packageId: recommendation.packageId ?? recommendation.package_id ?? null,
        packageKey,
        packageName: recommendation.packageName || recommendation.package_name || 'Smart Mitsubishi Bundle',
        packageDescription: recommendation.packageDescription || recommendation.package_description || defaultPackageDescription,
        serviceGroup: recommendation.serviceGroup || recommendation.service_group || null,
        minAnchorQuantity: recommendation.minAnchorQuantity ?? recommendation.min_anchor_quantity ?? recommendation.packageMinAnchorQuantity ?? 1,
        vehicleModelName: recommendation.vehicleModelName || recommendation.vehicle_model_name || null,
        vehicleFamily: recommendation.vehicleFamily || recommendation.vehicle_family || null,
        recommendationMode: recommendation.recommendationMode || recommendation.recommendation_mode || 'smart_bundle',
        recommendationLabel: recommendation.recommendationLabel || recommendation.recommendation_label || 'Smart Recommendation',
      }, index));
    }

    const targetPackage = groupedPackages.get(packageKey);
    const targetItems = kind === 'service' ? targetPackage.services : targetPackage.parts;
    targetItems.push(recommendation);
  });

  return Array.from(groupedPackages.values()).map((pkg, index) => normalizePackage(pkg, index));
}

function getMatchScore(matchLevel) {
  switch (matchLevel) {
    case 'exact_model':
      return 0;
    case 'service_bundle':
      return 1;
    case 'family_match':
      return 2;
    case 'curated_override':
      return 3;
    default:
      return 4;
  }
}

export function sortBundleItems(items = []) {
  return [...items].sort((left, right) => {
    const matchScore = getMatchScore(left.matchLevel ?? left.match_level ?? null) - getMatchScore(right.matchLevel ?? right.match_level ?? null);
    if (matchScore !== 0) {
      return matchScore;
    }

    const priorityScore = Number(left.displayPriority ?? left.display_priority ?? 999) - Number(right.displayPriority ?? right.display_priority ?? 999);
    if (priorityScore !== 0) {
      return priorityScore;
    }

    const priceScore = toNumber(left.resolvedPrice ?? left.recommendedPrice, 0) - toNumber(right.resolvedPrice ?? right.recommendedPrice, 0);
    if (priceScore !== 0) {
      return priceScore;
    }

    const nameLeft = left.recommendedProductName || left.recommendedServiceName || '';
    const nameRight = right.recommendedProductName || right.recommendedServiceName || '';
    return nameLeft.localeCompare(nameRight);
  });
}

function distinctItems(items = []) {
  const seen = new Set();

  return items.filter((item) => {
    const key = `${item.consequentKind || item.consequent_kind || (item.recommendedServiceId ? 'service' : 'product')}:${item.recommendedProductId || item.recommendedServiceId || item.id}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildTierItems(sortedParts, sortedServices, partCount, serviceCount) {
  return distinctItems([
    ...sortedParts.slice(0, Math.max(partCount, 0)),
    ...sortedServices.slice(0, Math.max(serviceCount, 0)),
  ]);
}

function createTier(key, pkg, items) {
  const parts = items.filter((item) => (item.consequentKind || item.consequent_kind) !== 'service');
  const services = items.filter((item) => (item.consequentKind || item.consequent_kind) === 'service');
  const summary = summarizePackageItems(parts, services);

  return {
    tierKey: key,
    badgeLabel: tierCopy[key].badge,
    title: tierCopy[key].title,
    description: tierCopy[key].description,
    packageKey: pkg.packageKey,
    packageName: pkg.packageName,
    serviceGroup: pkg.serviceGroup,
    items,
    parts,
    services,
    ...summary,
  };
}

export function buildPackageTiers(pkg) {
  const sortedParts = sortBundleItems(pkg.parts || []);
  const sortedServices = sortBundleItems(pkg.services || []);
  const allItemCount = sortedParts.length + sortedServices.length;

  if (allItemCount === 0) {
    return [];
  }

  let goodPartCount = sortedParts.length > 0 ? 1 : 0;
  let goodServiceCount = sortedServices.length > 0 ? 1 : 0;

  if ((goodPartCount + goodServiceCount) < 2 && sortedParts.length > 1) {
    goodPartCount = 2;
  }

  const betterPartCount = Math.min(sortedParts.length, Math.max(goodPartCount + (sortedParts.length > goodPartCount ? 1 : 0), Math.min(2, sortedParts.length)));
  const betterServiceCount = Math.min(sortedServices.length, goodServiceCount + (sortedServices.length > goodServiceCount ? 1 : 0));

  const candidateTiers = [
    createTier('good', pkg, buildTierItems(sortedParts, sortedServices, goodPartCount, goodServiceCount)),
    createTier('better', pkg, buildTierItems(sortedParts, sortedServices, betterPartCount, betterServiceCount)),
    createTier('best', pkg, buildTierItems(sortedParts, sortedServices, sortedParts.length, sortedServices.length)),
  ];

  const uniqueTiers = [];
  let previousSignature = '';

  candidateTiers.forEach((tier) => {
    const signature = tier.items.map((item) => item.recommendedProductId || item.recommendedServiceId || item.id).join('|');
    if (!signature || signature === previousSignature) {
      return;
    }

    previousSignature = signature;
    uniqueTiers.push(tier);
  });

  return uniqueTiers;
}

export function getDefaultHighlightedTier(tiers = []) {
  return tiers.find((tier) => tier.tierKey === 'better')?.tierKey || tiers[tiers.length - 1]?.tierKey || null;
}

export function formatVehicleDisplayLabel(vehicle) {
  if (!vehicle) {
    return 'your Mitsubishi vehicle';
  }

  const parts = [vehicle.model, vehicle.year].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'your Mitsubishi vehicle';
}

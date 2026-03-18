import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();
const PRODUCT_CATALOG_CACHE_TTL_MS = 60 * 1000;
const FULL_CATALOG_PAGE_SIZE = 1000;
const SERVICE_CATALOG_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_PART_LIMIT = 6;
const DEFAULT_SERVICE_LIMIT = 4;
const DEFAULT_PACKAGE_DESCRIPTION = 'Smart upsell bundle of Mitsubishi-matched parts and services for this vehicle.';
const SMART_PART_DISCOUNT_RATE = 0.05;
const SMART_SERVICE_DISCOUNT_RATE = 0.03;
const SMART_RECOMMENDATION_LABEL = 'Smart Recommendation';

const SERVICE_GROUP_CONFIG = {
  oil_change: {
    packageKey: 'oil-change-package',
    packageName: 'Smart Oil Care Bundle',
    packageDescription: 'Upsell bundle of oil, filter, washer, and labor with light package savings for this Mitsubishi model.',
    serviceKeywords: ['oil change', 'change oil', 'preventive maintenance'],
  },
  brake_service: {
    packageKey: 'brake-service-package',
    packageName: 'Smart Brake Care Bundle',
    packageDescription: 'Upsell bundle of brake parts, installation, and cleaning labor for this Mitsubishi model.',
    serviceKeywords: ['brake', 'installation', 'overhaul'],
  },
  cooling_service: {
    packageKey: 'cooling-service-package',
    packageName: 'Smart Cooling Care Bundle',
    packageDescription: 'Upsell bundle of cooling-system parts and labor with smart package pricing for this Mitsubishi model.',
    serviceKeywords: ['cooling', 'radiator', 'coolant'],
  },
  battery_service: {
    packageKey: 'battery-service-package',
    packageName: 'Smart Battery Care Bundle',
    packageDescription: 'Upsell bundle of battery, terminal, and electrical service recommendations for this Mitsubishi model.',
    serviceKeywords: ['battery', 'terminal', 'electrical'],
  },
  tune_up: {
    packageKey: 'tune-up-package',
    packageName: 'Smart Tune-Up Bundle',
    packageDescription: 'Upsell bundle of ignition, filter, and tune-up labor tailored to this Mitsubishi model.',
    serviceKeywords: ['tune', 'diagnostic', 'inspection', 'engine', 'injector', 'fuel', 'throttle', 'gasket', 'pcv'],
  },
  filter_service: {
    packageKey: 'filter-service-package',
    packageName: 'Smart Filter Service Bundle',
    packageDescription: 'Upsell bundle of replacement filters and labor with light package savings for this Mitsubishi model.',
    serviceKeywords: ['filter', 'maintenance', 'inspection'],
  },
  tire_service: {
    packageKey: 'tire-service-package',
    packageName: 'Smart Tire Care Bundle',
    packageDescription: 'Upsell bundle of tire, wheel, balancing, and alignment services for this Mitsubishi model.',
    serviceKeywords: ['tire', 'wheel alignment', 'wheel balancing', 'installation', 'alignment', 'balancing'],
  },
};

const PART_FUNCTION_RULES = [
  { partFunction: 'oil_filter', serviceGroup: 'oil_change', keywords: ['oil filter'] },
  { partFunction: 'engine_oil', serviceGroup: 'oil_change', keywords: ['engine oil', 'synthetic oil', 'motor oil'] },
  { partFunction: 'drain_washer', serviceGroup: 'oil_change', keywords: ['drain washer', 'drain plug washer'] },
  { partFunction: 'oil_pan_component', serviceGroup: 'oil_change', keywords: ['oil pan', 'oil level', 'oil pressure', 'eng oil pan', 'oil strainer'] },
  { partFunction: 'brake_pad', serviceGroup: 'brake_service', keywords: ['brake pad'] },
  { partFunction: 'brake_shoe', serviceGroup: 'brake_service', keywords: ['brake shoe'] },
  { partFunction: 'brake_fluid', serviceGroup: 'brake_service', keywords: ['brake fluid'] },
  { partFunction: 'brake_cleaner', serviceGroup: 'brake_service', keywords: ['brake cleaner'] },
  { partFunction: 'disc_rotor', serviceGroup: 'brake_service', keywords: ['disc rotor', 'rotor'] },
  { partFunction: 'spark_plug', serviceGroup: 'tune_up', keywords: ['spark plug', 'glow plug'] },
  { partFunction: 'ignition_coil', serviceGroup: 'tune_up', keywords: ['ignition coil'] },
  { partFunction: 'head_gasket', serviceGroup: 'tune_up', keywords: ['gasket,cylinder head', 'cylinder head gasket', 'head gasket'] },
  { partFunction: 'engine_gasket', serviceGroup: 'tune_up', keywords: ['gasket', 'o-ring', 'seal'] },
  { partFunction: 'breather_hose', serviceGroup: 'tune_up', keywords: ['breather hose', 'rocker cover breather'] },
  { partFunction: 'crank_bearing', serviceGroup: 'tune_up', keywords: ['crankshaft', 'connrod', 'bearing'] },
  { partFunction: 'fuel_injector', serviceGroup: 'tune_up', keywords: ['fuel injector', 'injector'] },
  { partFunction: 'air_intake', serviceGroup: 'tune_up', keywords: ['air cleaner', 'air clnr', 'throt body', 'throttle body', 'air guide', 'duct,air'] },
  { partFunction: 'pcv_component', serviceGroup: 'tune_up', keywords: ['pcv valve'] },
  { partFunction: 'air_filter', serviceGroup: 'filter_service', keywords: ['air filter'] },
  { partFunction: 'cabin_filter', serviceGroup: 'filter_service', keywords: ['cabin air filter', 'cabin filter'] },
  { partFunction: 'fuel_filter', serviceGroup: 'filter_service', keywords: ['fuel filter'] },
  { partFunction: 'battery', serviceGroup: 'battery_service', keywords: ['battery assy', 'battery'] },
  { partFunction: 'battery_terminal', serviceGroup: 'battery_service', keywords: ['battery terminal', 'terminal cleaner', 'terminal'] },
  { partFunction: 'radiator', serviceGroup: 'cooling_service', keywords: ['radiator assy', 'radiator'] },
  { partFunction: 'coolant', serviceGroup: 'cooling_service', keywords: ['coolant'] },
  { partFunction: 'thermostat', serviceGroup: 'cooling_service', keywords: ['thermostat'] },
  { partFunction: 'water_pump', serviceGroup: 'cooling_service', keywords: ['water pump'] },
  { partFunction: 'radiator_hose', serviceGroup: 'cooling_service', keywords: ['radiator hose', 'water feed', 'water pump inlet', 'hose,throt body water', 'hose'] },
  { partFunction: 'tire', serviceGroup: 'tire_service', keywords: ['tire', 'tyre'] },
  { partFunction: 'wheel', serviceGroup: 'tire_service', keywords: ['wheel'] },
  { partFunction: 'wheel_valve', serviceGroup: 'tire_service', keywords: ['valve'] },
  { partFunction: 'lug_nut', serviceGroup: 'tire_service', keywords: ['lug nut', 'wheel nut', 'lug bolt'] },
];

const COMPANION_FUNCTIONS = {
  oil_filter: ['engine_oil', 'drain_washer', 'oil_pan_component'],
  engine_oil: ['oil_filter', 'drain_washer', 'oil_pan_component'],
  drain_washer: ['engine_oil', 'oil_filter', 'oil_pan_component'],
  oil_pan_component: ['engine_oil', 'oil_filter', 'drain_washer'],
  brake_pad: ['disc_rotor', 'brake_cleaner', 'brake_fluid', 'brake_shoe'],
  brake_shoe: ['brake_cleaner', 'brake_fluid', 'brake_pad'],
  brake_fluid: ['brake_pad', 'brake_shoe', 'brake_cleaner'],
  brake_cleaner: ['brake_pad', 'brake_shoe', 'brake_fluid'],
  disc_rotor: ['brake_pad', 'brake_cleaner', 'brake_fluid'],
  spark_plug: ['air_filter', 'cabin_filter', 'fuel_filter', 'ignition_coil', 'fuel_injector'],
  ignition_coil: ['spark_plug', 'air_filter', 'fuel_injector'],
  head_gasket: ['engine_gasket', 'breather_hose', 'fuel_injector', 'air_intake'],
  engine_gasket: ['head_gasket', 'breather_hose', 'oil_pan_component', 'fuel_injector'],
  breather_hose: ['engine_gasket', 'air_intake', 'head_gasket'],
  crank_bearing: ['engine_gasket', 'oil_pan_component'],
  fuel_injector: ['air_intake', 'fuel_filter', 'spark_plug'],
  air_intake: ['fuel_injector', 'air_filter', 'spark_plug', 'pcv_component'],
  pcv_component: ['air_filter', 'engine_gasket', 'air_intake'],
  air_filter: ['cabin_filter', 'fuel_filter', 'spark_plug', 'air_intake'],
  cabin_filter: ['air_filter', 'fuel_filter'],
  fuel_filter: ['air_filter', 'cabin_filter', 'spark_plug', 'fuel_injector'],
  battery: ['battery_terminal'],
  battery_terminal: ['battery'],
  radiator: ['coolant', 'thermostat', 'water_pump', 'radiator_hose'],
  coolant: ['radiator', 'thermostat', 'radiator_hose'],
  thermostat: ['coolant', 'radiator', 'water_pump', 'radiator_hose'],
  water_pump: ['coolant', 'thermostat', 'radiator_hose', 'radiator'],
  radiator_hose: ['coolant', 'radiator', 'thermostat', 'water_pump'],
  tire: ['wheel', 'wheel_valve', 'lug_nut'],
  wheel: ['tire', 'wheel_valve', 'lug_nut'],
  wheel_valve: ['tire', 'wheel'],
  lug_nut: ['tire', 'wheel'],
};

const RECOMMENDATION_STOP_WORDS = new Set([
  'assy', 'kit', 'set', 'rh', 'lh', 'upr', 'lwr', 'eng', 'body', 'case', 'cover', 'support', 'main', 'pc', 'md', 'for', 'the', 'and', 'with'
]);

let productCatalogCache = {
  data: null,
  fetchedAt: 0,
};

let serviceCatalogCache = {
  data: null,
  fetchedAt: 0,
};

function parsePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Number(numeric.toFixed(2)) : null;
}

function normalizePriceListItems(items = []) {
  return items
    .map((item) => ({
      sku: String(item?.sku || '').trim().toUpperCase(),
      price: parsePrice(item?.price),
    }))
    .filter((item) => item.sku && item.price !== null);
}

function getPreviousDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function parsePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function roundCurrency(value, fallback = 0) {
  const parsed = parsePrice(value);
  return parsed === null ? fallback : parsed;
}

function shouldUseSmartPackageCopy(value) {
  const normalized = normalizeText(value);
  return !normalized
    || normalized.startsWith('compatible ')
    || normalized.startsWith('matched ')
    || normalized.startsWith('suggested ')
    || normalized.includes('parts and services for this vehicle');
}

function getServiceGroupConfig(serviceGroup) {
  return SERVICE_GROUP_CONFIG[serviceGroup] || null;
}

function buildSmartPackageCopy(serviceGroup, packageName, packageDescription) {
  const groupConfig = getServiceGroupConfig(serviceGroup);

  return {
    packageName: shouldUseSmartPackageCopy(packageName)
      ? (groupConfig?.packageName || 'Smart Mitsubishi Bundle')
      : packageName,
    packageDescription: shouldUseSmartPackageCopy(packageDescription)
      ? (groupConfig?.packageDescription || DEFAULT_PACKAGE_DESCRIPTION)
      : packageDescription,
  };
}

function getSmartDiscountRate({ consequentKind, serviceGroup, matchLevel }) {
  if (consequentKind === 'service') {
    return serviceGroup === 'brake_service' || serviceGroup === 'tire_service'
      ? SMART_PART_DISCOUNT_RATE
      : SMART_SERVICE_DISCOUNT_RATE;
  }

  return matchLevel === 'family_match' ? SMART_SERVICE_DISCOUNT_RATE : SMART_PART_DISCOUNT_RATE;
}

function resolveSmartPricing({ recommendation, matchedProduct = null, matchedService = null, consequentKind, serviceGroup, matchLevel, minAnchorQuantity }) {
  const serviceCode = recommendation.recommendedServiceCode
    ?? recommendation.recommended_service_code
    ?? matchedService?.code
    ?? null;
  const catalogPrice = roundCurrency(
    recommendation.catalogPrice
      ?? recommendation.catalog_price
      ?? recommendation.listPrice
      ?? recommendation.list_price
      ?? matchedProduct?.price
      ?? matchedService?.price
      ?? recommendation.recommendedCatalogPrice
      ?? recommendation.recommended_catalog_price
      ?? recommendation.recommendedPrice
      ?? recommendation.recommended_price
      ?? 0
  );
  const explicitPricingMode = recommendation.pricingMode ?? recommendation.pricing_mode ?? null;
  const explicitResolvedPrice = recommendation.resolvedPrice ?? recommendation.resolved_price ?? null;
  let pricingMode = explicitPricingMode;
  let resolvedPrice = explicitResolvedPrice !== null && explicitResolvedPrice !== undefined
    ? roundCurrency(explicitResolvedPrice)
    : null;

  if (!pricingMode) {
    if (consequentKind === 'service' && serviceGroup === 'oil_change' && serviceCode === 'SVC-OIL') {
      pricingMode = 'complimentary';
      resolvedPrice = 0;
    } else {
      const discountRate = getSmartDiscountRate({ consequentKind, serviceGroup, matchLevel });
      pricingMode = discountRate > 0 && catalogPrice > 0 ? 'override' : 'catalog';
      resolvedPrice = pricingMode === 'override'
        ? roundCurrency(catalogPrice * (1 - discountRate))
        : catalogPrice;
    }
  }

  if (pricingMode === 'complimentary') {
    resolvedPrice = 0;
  } else if (resolvedPrice === null) {
    const discountRate = getSmartDiscountRate({ consequentKind, serviceGroup, matchLevel });
    resolvedPrice = pricingMode === 'override' && catalogPrice > 0
      ? roundCurrency(catalogPrice * (1 - discountRate))
      : catalogPrice;
  }

  const savingsAmount = roundCurrency(Math.max(catalogPrice - resolvedPrice, 0));
  const discountPercent = catalogPrice > 0 && savingsAmount > 0
    ? Math.round((savingsAmount / catalogPrice) * 100)
    : 0;
  const fallbackDisplayLabel = pricingMode === 'complimentary'
    ? (Number(minAnchorQuantity ?? 1) > 1 ? `Free With ${minAnchorQuantity}x Part` : 'Free With Package')
    : pricingMode === 'override' && discountPercent > 0
      ? `Smart Save ${discountPercent}%`
      : pricingMode === 'override'
        ? 'Smart Package Rate'
        : null;
  const providedLabel = recommendation.displayPriceLabel ?? recommendation.display_price_label ?? null;

  return {
    catalogPrice,
    resolvedPrice,
    pricingMode,
    displayPriceLabel: providedLabel && providedLabel !== 'Package Rate' ? providedLabel : fallbackDisplayLabel,
    savingsAmount,
    discountPercent,
  };
}

function summarizePackagePricing(items = []) {
  const catalogTotal = roundCurrency(items.reduce((sum, item) => sum + Number(item.catalogPrice ?? item.resolvedPrice ?? 0), 0));
  const smartTotal = roundCurrency(items.reduce((sum, item) => sum + Number(item.resolvedPrice ?? 0), 0));
  const savingsAmount = roundCurrency(Math.max(catalogTotal - smartTotal, 0));
  const savingsPercent = catalogTotal > 0 && savingsAmount > 0
    ? Math.round((savingsAmount / catalogTotal) * 100)
    : 0;

  return {
    catalogTotal,
    smartTotal,
    savingsAmount,
    savingsPercent,
  };
}

function invalidateProductCatalogCache() {
  productCatalogCache = {
    data: null,
    fetchedAt: 0,
  };
}

function mapCatalogRow(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    model: row.model,
    category: row.category,
    price: Number(row.price ?? 0),
    stock: Number(row.stock ?? 0),
    status: row.status,
    uom: row.uom,
    brand: row.brand,
    location: row.location ?? {},
  };
}

function mapServiceRow(service) {
  return {
    id: service.id,
    code: service.code,
    name: service.name,
    description: service.description,
    price: Number(service.price ?? 0),
    estimatedDurationMinutes: Number(service.estimated_duration_minutes ?? service.estimatedDurationMinutes ?? 0),
  };
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesAnyKeyword(text, keywords = []) {
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

function buildProductSearchText(product) {
  return normalizeText([product.name, product.category, product.model, product.sku].filter(Boolean).join(' '));
}

function buildServiceSearchText(service) {
  return normalizeText([service.name, service.description, service.code].filter(Boolean).join(' '));
}

function extractVehicleFamily(modelName) {
  const base = String(modelName || '').split('(')[0].trim();
  return base || null;
}

function inferHeuristicServiceGroup(text) {
  if (matchesAnyKeyword(text, ['radiator', 'coolant', 'thermostat', 'water pump', 'water feed', 'hose'])) {
    return 'cooling_service';
  }
  if (matchesAnyKeyword(text, ['brake', 'rotor'])) {
    return 'brake_service';
  }
  if (matchesAnyKeyword(text, ['battery', 'terminal'])) {
    return 'battery_service';
  }
  if (matchesAnyKeyword(text, ['tire', 'tyre', 'wheel', 'lug', 'valve'])) {
    return 'tire_service';
  }
  if (matchesAnyKeyword(text, ['filter'])) {
    return 'filter_service';
  }
  if (matchesAnyKeyword(text, ['oil', 'drain'])) {
    return 'oil_change';
  }
  if (matchesAnyKeyword(text, ['gasket', 'injector', 'throt body', 'throttle body', 'air cleaner', 'pcv', 'bearing', 'crankshaft', 'connrod', 'mounting', 'breather'])) {
    return 'tune_up';
  }
  return null;
}

function extractMeaningfulTokens(text) {
  return Array.from(new Set(
    normalizeText(text)
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !RECOMMENDATION_STOP_WORDS.has(token))
  ));
}

function inferProductProfile(product) {
  const text = buildProductSearchText(product);
  const matchingRule = PART_FUNCTION_RULES.find((rule) => matchesAnyKeyword(text, rule.keywords));
  const normalizedModel = normalizeText(product.model);
  const vehicleFamily = extractVehicleFamily(product.model);

  return {
    productId: product.id,
    sku: product.sku,
    modelName: product.model || null,
    normalizedModel,
    vehicleFamily,
    normalizedVehicleFamily: normalizeText(vehicleFamily),
    partFunction: matchingRule?.partFunction || null,
    serviceGroup: matchingRule?.serviceGroup || inferHeuristicServiceGroup(text),
    keywords: extractMeaningfulTokens([product.name, product.model].filter(Boolean).join(' ')),
    isVehicleSpecific: Boolean(product.model && !normalizeText(product.model).includes('various') && !normalizeText(product.model).includes('universal')),
  };
}

function findMatchingServices({ serviceCatalog, serviceGroup, limitCount = DEFAULT_SERVICE_LIMIT }) {
  const groupConfig = SERVICE_GROUP_CONFIG[serviceGroup];

  if (!groupConfig) {
    return [];
  }

  return serviceCatalog
    .map((service) => ({
      service,
      text: buildServiceSearchText(service),
    }))
    .filter(({ text }) => matchesAnyKeyword(text, groupConfig.serviceKeywords))
    .sort((left, right) => left.service.name.localeCompare(right.service.name))
    .slice(0, limitCount)
    .map(({ service }) => service);
}

function dedupeRecommendations(recommendations = []) {
  const seen = new Set();

  return recommendations.filter((item) => {
    const key = item.recommendedProductId
      ? `product:${item.recommendedProductId}`
      : `service:${item.recommendedServiceId}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function scoreCandidate(candidate, desiredFunction, matchLevel) {
  const stockScore = Number(candidate.product.stock ?? 0);
  const exactFunctionBonus = candidate.profile.partFunction === desiredFunction ? 1000 : 0;
  const matchBonus = matchLevel === 'exact_model' ? 500 : 250;
  return exactFunctionBonus + matchBonus + stockScore;
}

function scoreKeywordCandidate(candidate, clickedKeywords, matchLevel, preferredServiceGroup) {
  const overlap = candidate.profile.keywords.filter((token) => clickedKeywords.includes(token)).length;
  const stockScore = Number(candidate.product.stock ?? 0);
  const groupBonus = preferredServiceGroup && candidate.profile.serviceGroup === preferredServiceGroup ? 200 : 0;
  const matchBonus = matchLevel === 'exact_model' ? 300 : 150;
  return overlap * 100 + stockScore + groupBonus + matchBonus;
}

function pickKeywordClusterProducts({ clickedProduct, catalog, clickedProfile, limitCount }) {
  const clickedKeywords = clickedProfile.keywords || [];

  if (!clickedProfile.modelName || clickedKeywords.length === 0) {
    return [];
  }

  const catalogProfiles = catalog.map((product) => ({ product, profile: inferProductProfile(product) }));
  const matchByTokens = (targetMatchLevel) => catalogProfiles
    .filter(({ product, profile }) => product.id !== clickedProduct.id)
    .filter(({ profile }) => {
      if (targetMatchLevel === 'exact_model') {
        return profile.normalizedModel && profile.normalizedModel === clickedProfile.normalizedModel;
      }
      return profile.normalizedVehicleFamily && profile.normalizedVehicleFamily === clickedProfile.normalizedVehicleFamily;
    })
    .map((candidate) => ({
      ...candidate,
      overlap: candidate.profile.keywords.filter((token) => clickedKeywords.includes(token)).length,
    }))
    .filter((candidate) => candidate.overlap > 0)
    .sort((left, right) => scoreKeywordCandidate(right, clickedKeywords, targetMatchLevel, clickedProfile.serviceGroup) - scoreKeywordCandidate(left, clickedKeywords, targetMatchLevel, clickedProfile.serviceGroup));

  const exactMatches = matchByTokens('exact_model').slice(0, limitCount).map(({ product }) => ({
    ruleId: null,
    consequentKind: 'product',
    recommendedProductId: product.id,
    recommendedProductName: product.name,
    recommendedServiceId: null,
    recommendedServiceName: null,
    recommendedPrice: Number(product.price ?? 0),
    support: null,
    confidence: null,
    lift: null,
    sampleCount: null,
    reasonLabel: 'Smart upsell add-on for the same exact Mitsubishi model',
    packageKey: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageKey || 'vehicle-package',
    packageName: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageName || 'Compatible Mitsubishi Package',
    packageDescription: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageDescription || 'Compatible Mitsubishi parts and services for this vehicle.',
    matchLevel: 'exact_model',
    vehicleModelName: clickedProfile.modelName,
    vehicleFamily: clickedProfile.vehicleFamily,
    serviceGroup: clickedProfile.serviceGroup,
  }));

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return matchByTokens('family_match').slice(0, limitCount).map(({ product }) => ({
    ruleId: null,
    consequentKind: 'product',
    recommendedProductId: product.id,
    recommendedProductName: product.name,
    recommendedServiceId: null,
    recommendedServiceName: null,
    recommendedPrice: Number(product.price ?? 0),
    support: null,
    confidence: null,
    lift: null,
    sampleCount: null,
    reasonLabel: 'Smart upsell add-on for the same Mitsubishi family',
    packageKey: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageKey || 'vehicle-package',
    packageName: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageName || 'Compatible Mitsubishi Package',
    packageDescription: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageDescription || 'Compatible Mitsubishi parts and services for this vehicle family.',
    matchLevel: 'family_match',
    vehicleModelName: clickedProfile.modelName,
    vehicleFamily: clickedProfile.vehicleFamily,
    serviceGroup: clickedProfile.serviceGroup,
  }));
}

function pickCompanionProducts({ clickedProduct, catalog, clickedProfile, limitCount }) {
  const companionFunctions = COMPANION_FUNCTIONS[clickedProfile.partFunction] || [];

  if (!clickedProfile.modelName || companionFunctions.length === 0) {
    return [];
  }

  const catalogProfiles = catalog.map((product) => ({ product, profile: inferProductProfile(product) }));
  const exactModelMatches = [];
  const familyMatches = [];
  const usedProductIds = new Set([clickedProduct.id]);

  for (const desiredFunction of companionFunctions) {
    const exactCandidate = catalogProfiles
      .filter(({ product, profile }) => !usedProductIds.has(product.id))
      .filter(({ profile }) => profile.partFunction === desiredFunction)
      .filter(({ profile }) => profile.normalizedModel && profile.normalizedModel === clickedProfile.normalizedModel)
      .sort((left, right) => scoreCandidate(right, desiredFunction, 'exact_model') - scoreCandidate(left, desiredFunction, 'exact_model'))[0];

    if (exactCandidate) {
      usedProductIds.add(exactCandidate.product.id);
      exactModelMatches.push(exactCandidate);
      continue;
    }

    const familyCandidate = catalogProfiles
      .filter(({ product, profile }) => !usedProductIds.has(product.id))
      .filter(({ profile }) => profile.partFunction === desiredFunction)
      .filter(({ profile }) => profile.normalizedVehicleFamily && profile.normalizedVehicleFamily === clickedProfile.normalizedVehicleFamily)
      .sort((left, right) => scoreCandidate(right, desiredFunction, 'family_match') - scoreCandidate(left, desiredFunction, 'family_match'))[0];

    if (familyCandidate) {
      usedProductIds.add(familyCandidate.product.id);
      familyMatches.push(familyCandidate);
    }
  }

  const exactRecommendations = exactModelMatches.map(({ product, profile }) => ({
    ruleId: null,
    consequentKind: 'product',
    recommendedProductId: product.id,
    recommendedProductName: product.name,
    recommendedServiceId: null,
    recommendedServiceName: null,
    recommendedPrice: Number(product.price ?? 0),
    support: null,
    confidence: null,
    lift: null,
    sampleCount: null,
    reasonLabel: `Smart bundle add-on: ${profile.partFunction?.replace(/_/g, ' ') || 'part'} for the same vehicle`,
    packageKey: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageKey || `${clickedProfile.serviceGroup || 'vehicle'}-package`,
    packageName: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageName || 'Compatible Mitsubishi Package',
    packageDescription: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageDescription || 'Compatible Mitsubishi parts and services for this vehicle.',
    matchLevel: 'exact_model',
    vehicleModelName: clickedProfile.modelName,
    vehicleFamily: clickedProfile.vehicleFamily,
    serviceGroup: clickedProfile.serviceGroup,
  }));

  if (exactRecommendations.length > 0) {
    return exactRecommendations.slice(0, limitCount);
  }

  return familyMatches.map(({ product }) => ({
    ruleId: null,
    consequentKind: 'product',
    recommendedProductId: product.id,
    recommendedProductName: product.name,
    recommendedServiceId: null,
    recommendedServiceName: null,
    recommendedPrice: Number(product.price ?? 0),
    support: null,
    confidence: null,
    lift: null,
    sampleCount: null,
    reasonLabel: `Smart bundle add-on for ${clickedProfile.vehicleFamily}`,
    packageKey: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageKey || `${clickedProfile.serviceGroup || 'vehicle'}-package`,
    packageName: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageName || 'Compatible Mitsubishi Package',
    packageDescription: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageDescription || 'Compatible Mitsubishi parts and services for this vehicle family.',
    matchLevel: 'family_match',
    vehicleModelName: clickedProfile.modelName,
    vehicleFamily: clickedProfile.vehicleFamily,
    serviceGroup: clickedProfile.serviceGroup,
  })).slice(0, limitCount);
}

function buildVehicleMatchedRecommendations({ clickedProduct, catalog, serviceCatalog, partLimit, serviceLimit }) {
  const clickedProfile = inferProductProfile(clickedProduct);

  if (!clickedProfile.modelName) {
    return [];
  }

  const directFunctionRecommendations = clickedProfile.partFunction
    ? pickCompanionProducts({
        clickedProduct,
        catalog,
        clickedProfile,
        limitCount: partLimit,
      })
    : [];

  const keywordClusterRecommendations = directFunctionRecommendations.length === 0
    ? pickKeywordClusterProducts({
        clickedProduct,
        catalog,
        clickedProfile,
        limitCount: partLimit,
      })
    : [];

  const partRecommendations = [...directFunctionRecommendations, ...keywordClusterRecommendations].slice(0, partLimit);

  const services = clickedProfile.serviceGroup
    ? findMatchingServices({
        serviceCatalog,
        serviceGroup: clickedProfile.serviceGroup,
        limitCount: serviceLimit,
      })
    : [];

  const serviceRecommendations = services.map((service) => ({
    ruleId: null,
    consequentKind: 'service',
    recommendedProductId: null,
    recommendedProductName: null,
    recommendedServiceId: service.id,
    recommendedServiceName: service.name,
    recommendedPrice: Number(service.price ?? 0),
        support: null,
    confidence: null,
    lift: null,
    sampleCount: null,
    reasonLabel: clickedProfile.partFunction
      ? 'Smart service bundle for ' + clickedProfile.partFunction.replace(/_/g, ' ')
      : 'Smart service bundle based on this Mitsubishi part and vehicle',
    packageKey: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageKey || 'vehicle-service-package',
    packageName: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageName || 'Smart Mitsubishi Service Bundle',
    packageDescription: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageDescription || DEFAULT_PACKAGE_DESCRIPTION,
    matchLevel: 'service_bundle',
    vehicleModelName: clickedProfile.modelName,
    vehicleFamily: clickedProfile.vehicleFamily,
    serviceGroup: clickedProfile.serviceGroup,
    minAnchorQuantity: clickedProfile.serviceGroup === 'oil_change' && clickedProfile.partFunction === 'engine_oil' ? 4 : 1,
  }));

  return [...partRecommendations, ...serviceRecommendations];
}
function normalizeMatchMetadata(recommendation, clickedProduct, recommendedProduct) {
  const clickedProfile = inferProductProfile(clickedProduct);
  const recommendedProfile = recommendedProduct ? inferProductProfile(recommendedProduct) : null;
  const isExactModel = Boolean(
    recommendedProfile?.normalizedModel &&
    clickedProfile.normalizedModel &&
    recommendedProfile.normalizedModel === clickedProfile.normalizedModel
  );
  const isFamilyMatch = Boolean(
    !isExactModel &&
    recommendedProfile?.normalizedVehicleFamily &&
    clickedProfile.normalizedVehicleFamily &&
    recommendedProfile.normalizedVehicleFamily === clickedProfile.normalizedVehicleFamily
  );

  return {
    ...recommendation,
    matchLevel: recommendation.matchLevel || (isExactModel ? 'exact_model' : isFamilyMatch ? 'family_match' : 'curated_override'),
    vehicleModelName: recommendation.vehicleModelName || clickedProduct.model || null,
    vehicleFamily: recommendation.vehicleFamily || clickedProfile.vehicleFamily || null,
    serviceGroup: recommendation.serviceGroup || clickedProfile.serviceGroup || null,
  };
}

function normalizeRecommendationRecord({ recommendation, clickedProduct, matchedProduct = null, matchedService = null }) {
  const clickedProfile = inferProductProfile(clickedProduct);
  const consequentKind = recommendation.consequentKind
    ?? recommendation.consequent_kind
    ?? recommendation.itemKind
    ?? recommendation.item_kind
    ?? ((recommendation.recommendedServiceId ?? recommendation.recommended_service_id) ? 'service' : 'product');
  const packageItemId = recommendation.packageItemId ?? recommendation.package_item_id ?? recommendation.ruleId ?? recommendation.rule_id ?? null;
  const minAnchorQuantity = Number(recommendation.minAnchorQuantity ?? recommendation.min_anchor_quantity ?? recommendation.packageMinAnchorQuantity ?? 1);
  const rawServiceGroup = recommendation.serviceGroup ?? recommendation.service_group ?? clickedProfile.serviceGroup ?? null;
  const basePackageCopy = buildSmartPackageCopy(
    rawServiceGroup,
    recommendation.packageName ?? recommendation.package_name ?? null,
    recommendation.packageDescription ?? recommendation.package_description ?? null,
  );
  const baseRecord = {
    ...recommendation,
    packageId: recommendation.packageId ?? recommendation.package_id ?? null,
    packageKey: recommendation.packageKey ?? recommendation.package_key ?? recommendation.packageName ?? recommendation.package_name ?? null,
    packageName: basePackageCopy.packageName,
    packageDescription: basePackageCopy.packageDescription,
    minAnchorQuantity,
    priority: Number(recommendation.priority ?? recommendation.packagePriority ?? recommendation.package_priority ?? 100),
    recommendationMode: recommendation.recommendationMode ?? recommendation.recommendation_mode ?? 'smart_bundle',
    recommendationLabel: recommendation.recommendationLabel ?? recommendation.recommendation_label ?? SMART_RECOMMENDATION_LABEL,
    packageItemId,
    ruleId: packageItemId,
    consequentKind,
    recommendedProductId: recommendation.recommendedProductId ?? recommendation.recommended_product_id ?? null,
    recommendedProductName: recommendation.recommendedProductName ?? recommendation.recommended_product_name ?? matchedProduct?.name ?? null,
    recommendedServiceId: recommendation.recommendedServiceId ?? recommendation.recommended_service_id ?? null,
    recommendedServiceName: recommendation.recommendedServiceName ?? recommendation.recommended_service_name ?? matchedService?.name ?? null,
    reasonLabel: recommendation.reasonLabel ?? recommendation.reason_label ?? 'Smart Mitsubishi upsell recommendation',
    vehicleModelName: recommendation.vehicleModelName ?? recommendation.vehicle_model_name ?? clickedProduct.model ?? null,
    vehicleFamily: recommendation.vehicleFamily ?? recommendation.vehicle_family ?? null,
    serviceGroup: rawServiceGroup,
    matchLevel: recommendation.matchLevel ?? recommendation.match_level ?? null,
    recommendedProduct: matchedProduct ?? recommendation.recommendedProduct ?? null,
    recommendedService: matchedService ?? recommendation.recommendedService ?? null,
    recommendedProductSku: recommendation.recommendedProductSku ?? recommendation.recommended_product_sku ?? matchedProduct?.sku ?? null,
    recommendedServiceCode: recommendation.recommendedServiceCode ?? recommendation.recommended_service_code ?? matchedService?.code ?? null,
  };
  const normalizedRecord = normalizeMatchMetadata(baseRecord, clickedProduct, matchedProduct);
  const smartPricing = resolveSmartPricing({
    recommendation: normalizedRecord,
    matchedProduct,
    matchedService,
    consequentKind: normalizedRecord.consequentKind,
    serviceGroup: normalizedRecord.serviceGroup,
    matchLevel: normalizedRecord.matchLevel,
    minAnchorQuantity: normalizedRecord.minAnchorQuantity,
  });
  const refinedPackageCopy = buildSmartPackageCopy(
    normalizedRecord.serviceGroup,
    normalizedRecord.packageName,
    normalizedRecord.packageDescription,
  );

  return {
    ...normalizedRecord,
    packageName: refinedPackageCopy.packageName,
    packageDescription: refinedPackageCopy.packageDescription,
    recommendedProduct: matchedProduct ?? recommendation.recommendedProduct ?? null,
    recommendedService: matchedService ?? recommendation.recommendedService ?? null,
    recommendedProductSku: normalizedRecord.recommendedProductSku,
    recommendedServiceCode: normalizedRecord.recommendedServiceCode,
    pricingMode: smartPricing.pricingMode,
    catalogPrice: smartPricing.catalogPrice,
    recommendedPrice: smartPricing.resolvedPrice,
    resolvedPrice: smartPricing.resolvedPrice,
    displayPriceLabel: smartPricing.displayPriceLabel,
    savingsAmount: smartPricing.savingsAmount,
    discountPercent: smartPricing.discountPercent,
    minAnchorQuantity: normalizedRecord.minAnchorQuantity,
    packageItemId,
    ruleId: packageItemId,
    priority: normalizedRecord.priority,
    recommendationMode: normalizedRecord.recommendationMode,
    recommendationLabel: normalizedRecord.recommendationLabel,
  };
}

function groupPackageRecommendations(recommendations = [], partLimit = DEFAULT_PART_LIMIT, serviceLimit = DEFAULT_SERVICE_LIMIT) {
  const groupedPackages = new Map();

  recommendations.forEach((recommendation, index) => {
    const packageKey = recommendation.packageKey || recommendation.packageName || ('suggested-package-' + index);

    if (!groupedPackages.has(packageKey)) {
      const packageCopy = buildSmartPackageCopy(
        recommendation.serviceGroup || null,
        recommendation.packageName || null,
        recommendation.packageDescription || null,
      );

      groupedPackages.set(packageKey, {
        packageId: recommendation.packageId ?? null,
        packageKey,
        packageName: packageCopy.packageName || 'Smart Mitsubishi Bundle',
        packageDescription: packageCopy.packageDescription || DEFAULT_PACKAGE_DESCRIPTION,
        serviceGroup: recommendation.serviceGroup || null,
        vehicleModelName: recommendation.vehicleModelName || null,
        vehicleFamily: recommendation.vehicleFamily || null,
        minAnchorQuantity: Number(recommendation.minAnchorQuantity ?? 1),
        priority: Number(recommendation.priority ?? 100),
        recommendationMode: recommendation.recommendationMode ?? 'smart_bundle',
        recommendationLabel: recommendation.recommendationLabel ?? SMART_RECOMMENDATION_LABEL,
        parts: [],
        services: [],
      });
    }

    const targetPackage = groupedPackages.get(packageKey);
    const isService = recommendation.consequentKind === 'service';
    const targetItems = isService ? targetPackage.services : targetPackage.parts;
    const itemLimit = isService ? serviceLimit : partLimit;
    const itemId = isService ? recommendation.recommendedServiceId : recommendation.recommendedProductId;

    targetPackage.minAnchorQuantity = Math.max(targetPackage.minAnchorQuantity, Number(recommendation.minAnchorQuantity ?? 1));
    targetPackage.priority = Math.min(targetPackage.priority, Number(recommendation.priority ?? 100));

    if (itemId && targetItems.some((item) => (isService ? item.recommendedServiceId : item.recommendedProductId) === itemId)) {
      return;
    }

    if (targetItems.length >= itemLimit) {
      return;
    }

    targetItems.push(recommendation);
  });

  return Array.from(groupedPackages.values())
    .filter((pkg) => pkg.parts.length > 0 || pkg.services.length > 0)
    .map((pkg) => {
      const packageCopy = buildSmartPackageCopy(pkg.serviceGroup, pkg.packageName, pkg.packageDescription);
      const packageItems = [...pkg.parts, ...pkg.services];

      return {
        ...pkg,
        packageName: packageCopy.packageName,
        packageDescription: packageCopy.packageDescription,
        itemCount: packageItems.length,
        recommendationMode: pkg.recommendationMode || 'smart_bundle',
        recommendationLabel: pkg.recommendationLabel || SMART_RECOMMENDATION_LABEL,
        ...summarizePackagePricing(packageItems),
      };
    })
    .sort((left, right) => Number(left.priority ?? 100) - Number(right.priority ?? 100));
}

function flattenPackageRecommendations(packages = []) {

  return packages.flatMap((pkg) => [...pkg.parts, ...pkg.services]);
}

function buildPackageResponse({ recommendationRows = [], clickedProduct, productMap, serviceMap, partLimit, serviceLimit }) {
  const normalizedRecommendations = recommendationRows
    .map((recommendation) => {
      const matchedProduct = (recommendation.recommendedProductId ?? recommendation.recommended_product_id)
        ? productMap.get(recommendation.recommendedProductId ?? recommendation.recommended_product_id) ?? null
        : null;
      const matchedService = (recommendation.recommendedServiceId ?? recommendation.recommended_service_id)
        ? serviceMap.get(recommendation.recommendedServiceId ?? recommendation.recommended_service_id) ?? null
        : null;

      return normalizeRecommendationRecord({
        recommendation,
        clickedProduct,
        matchedProduct,
        matchedService,
      });
    })
    .filter((recommendation) => recommendation.consequentKind === 'service' || recommendation.recommendedProduct);

  const packages = groupPackageRecommendations(normalizedRecommendations, partLimit, serviceLimit);

  return {
    packages,
    recommendations: flattenPackageRecommendations(packages),
  };
}

async function getOptionalCuratedRecommendations(productId, vehicleModelId, limitCount) {
  try {
    const rows = await callRpc('get_curated_quote_recommendations', {
      p_product_id: productId,
      p_vehicle_model_name: vehicleModelId,
      p_limit_count: limitCount,
    });

    return rows ?? [];
  } catch (error) {
    const message = String(error?.message || error || '');

    if (message.includes('get_curated_quote_recommendations') || message.includes('schema cache')) {
      return [];
    }

    throw error;
  }
}

async function getOptionalPackageRecommendationRows(productId, vehicleModelId, partLimit, serviceLimit) {
  try {
    const rows = await callRpc('get_product_recommendation_packages', {
      p_product_id: productId,
      p_vehicle_model_name: vehicleModelId,
      p_part_limit: partLimit,
      p_service_limit: serviceLimit,
    });

    return rows ?? [];
  } catch (error) {
    const message = String(error?.message || error || '');

    if (message.includes('get_product_recommendation_packages') || message.includes('schema cache')) {
      return [];
    }

    throw error;
  }
}

async function fetchProductCatalogPage({ page, pageSize, searchQuery = null, selectedCategory = 'all', sortBy = 'name-asc' }) {
  return callRpc('get_product_catalog_page', {
    p_page: page,
    p_page_size: pageSize,
    p_search: searchQuery || null,
    p_category: selectedCategory,
    p_sort_by: sortBy,
  });
}

async function getCachedProductCatalog() {
  const now = Date.now();
  if (productCatalogCache.data && (now - productCatalogCache.fetchedAt) < PRODUCT_CATALOG_CACHE_TTL_MS) {
    return productCatalogCache.data;
  }

  const firstPageRows = await fetchProductCatalogPage({
    page: 1,
    pageSize: FULL_CATALOG_PAGE_SIZE,
  });

  const totalCount = Number(firstPageRows?.[0]?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / FULL_CATALOG_PAGE_SIZE));

  let allRows = firstPageRows ?? [];

  if (totalPages > 1) {
    const remainingPageRequests = Array.from({ length: totalPages - 1 }, (_, index) => (
      fetchProductCatalogPage({
        page: index + 2,
        pageSize: FULL_CATALOG_PAGE_SIZE,
      })
    ));

    const remainingPages = await Promise.all(remainingPageRequests);
    allRows = allRows.concat(remainingPages.flat());
  }

  const products = allRows.map(mapCatalogRow);
  productCatalogCache = {
    data: products,
    fetchedAt: now,
  };

  return productCatalogCache.data;
}

async function getCachedServiceCatalog() {
  const now = Date.now();
  if (serviceCatalogCache.data && (now - serviceCatalogCache.fetchedAt) < SERVICE_CATALOG_CACHE_TTL_MS) {
    return serviceCatalogCache.data;
  }

  const services = await callRpc('get_service_catalog');
  const mappedServices = (services ?? []).map(mapServiceRow);

  serviceCatalogCache = {
    data: mappedServices,
    fetchedAt: now,
  };

  return serviceCatalogCache.data;
}

router.get('/products', async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1, 10000);
    const pageSize = parsePositiveInteger(req.query.pageSize, 10, 100);
    const searchQuery = String(req.query.q || '').trim();
    const selectedCategory = String(req.query.category || 'all');
    const sortBy = String(req.query.sortBy || 'name-asc');

    const [pageRows, categoryRows] = await Promise.all([
      fetchProductCatalogPage({
        page,
        pageSize,
        searchQuery,
        selectedCategory,
        sortBy,
      }),
      callRpc('get_product_catalog_categories', {
        p_search: searchQuery || null,
      }),
    ]);

    const products = (pageRows ?? []).map(mapCatalogRow);

    const totalCount = Number(pageRows?.[0]?.total_count ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const categoryCountTotal = (categoryRows ?? []).reduce((sum, row) => sum + Number(row.count ?? 0), 0);
    const categories = [
      { value: 'all', label: 'All Categories', count: categoryCountTotal || totalCount },
      ...(categoryRows ?? []).map((row) => ({
        value: row.value,
        label: row.label,
        count: Number(row.count ?? 0),
      })),
    ];

    res.json({
      products,
      categories,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/products/all', async (_req, res, next) => {
  try {
    const products = await getCachedProductCatalog();
    res.json({ products: products ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/summary', requireRole('admin', 'stock_clerk'), async (_req, res, next) => {
  try {
    const summaryRows = await callRpc('get_catalog_summary');
    const summary = Array.isArray(summaryRows) ? (summaryRows[0] ?? null) : summaryRows;

    res.json({
      summary: {
        totalProducts: Number(summary?.total_products ?? 0),
        pricelistRows: Number(summary?.pricelist_rows ?? 0),
        uniqueProducts: Number(summary?.unique_products ?? 0),
        currentPrices: Number(summary?.current_prices ?? 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/services', async (_req, res, next) => {
  try {
    const services = await getCachedServiceCatalog();

    res.json({
      services,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/prices/current', requireRole('admin'), async (_req, res, next) => {
  try {
    const products = await getCachedProductCatalog();
    const priceList = (products ?? []).map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      model: product.model,
      category: product.category,
      price: Number(product.price ?? 0),
    }));

    res.json({ priceList });
  } catch (error) {
    next(error);
  }
});

router.post('/prices/bulk-replace', requireRole('admin'), async (req, res, next) => {
  try {
    const items = normalizePriceListItems(req.body?.items);
    const effectiveFrom = req.body?.effectiveFrom || new Date().toISOString().slice(0, 10);

    if (items.length === 0) {
      return res.status(400).json({ error: 'Provide at least one valid SKU and price.' });
    }

    const uniqueItems = Array.from(
      items.reduce((map, item) => map.set(item.sku, item), new Map()).values()
    );

    const skuList = uniqueItems.map((item) => item.sku);
    const { data: products, error: productsError } = await supabaseAdmin
      .schema('app')
      .from('products')
      .select('id, sku, name')
      .in('sku', skuList);

    if (productsError) {
      throw productsError;
    }

    const productMap = new Map((products ?? []).map((product) => [product.sku, product]));
    const matchedItems = uniqueItems.filter((item) => productMap.has(item.sku));
    const skippedItems = uniqueItems.filter((item) => !productMap.has(item.sku));

    if (matchedItems.length === 0) {
      return res.status(404).json({ error: 'No matching SKUs were found in the catalog.', skippedItems });
    }

    const matchedProductIds = matchedItems.map((item) => productMap.get(item.sku).id);
    const previousDate = getPreviousDate(effectiveFrom);

    const { error: archiveError } = await supabaseAdmin
      .schema('app')
      .from('product_prices')
      .update({
        is_current: false,
        effective_to: previousDate,
        updated_at: new Date().toISOString(),
      })
      .eq('price_type', 'retail')
      .eq('is_current', true)
      .in('product_id', matchedProductIds);

    if (archiveError) {
      throw archiveError;
    }

    const newPrices = matchedItems.map((item) => ({
      product_id: productMap.get(item.sku).id,
      price_type: 'retail',
      amount: item.price,
      currency: 'PHP',
      effective_from: effectiveFrom,
      effective_to: null,
      is_current: true,
      business_date: effectiveFrom,
    }));

    const { error: insertError } = await supabaseAdmin
      .schema('app')
      .from('product_prices')
      .insert(newPrices);

    if (insertError) {
      throw insertError;
    }

    invalidateProductCatalogCache();

    res.json({
      updatedCount: matchedItems.length,
      skippedCount: skippedItems.length,
      skippedItems,
      effectiveFrom,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/products/:productId/recommendations', async (req, res, next) => {
  try {
    const limitCount = parsePositiveInteger(req.query.limit, DEFAULT_PART_LIMIT, 24);
    const partLimit = parsePositiveInteger(req.query.partLimit, limitCount, 24);
    const serviceLimit = parsePositiveInteger(req.query.serviceLimit, limitCount, 24);
    const vehicleModelId = req.query.vehicleModelId || null;

    const [catalog, serviceCatalog] = await Promise.all([
      getCachedProductCatalog(),
      getCachedServiceCatalog(),
    ]);

    const clickedProduct = catalog.find((product) => product.id === req.params.productId);

    if (!clickedProduct) {
      return res.json({ packages: [], recommendations: [] });
    }

    const productMap = new Map(catalog.map((product) => [product.id, product]));
    const serviceMap = new Map(serviceCatalog.map((service) => [service.id, service]));
    const packageRows = await getOptionalPackageRecommendationRows(req.params.productId, vehicleModelId, partLimit, serviceLimit);

    if (packageRows.length > 0) {
      return res.json(buildPackageResponse({
        recommendationRows: packageRows,
        clickedProduct,
        productMap,
        serviceMap,
        partLimit,
        serviceLimit,
      }));
    }

    const mergedLimit = Math.min(partLimit + serviceLimit, 24);
    const [directRecommendations, curatedRecommendations] = await Promise.all([
      callRpc('get_product_upsell_recommendations', {
        product_id: req.params.productId,
        vehicle_model_id: vehicleModelId,
        limit_count: mergedLimit,
      }).catch(() => []),
      getOptionalCuratedRecommendations(req.params.productId, vehicleModelId, mergedLimit),
    ]);

    const fallbackRecommendations = buildVehicleMatchedRecommendations({
      clickedProduct,
      catalog,
      serviceCatalog,
      partLimit,
      serviceLimit,
    });

    const normalizeExternalRecommendations = (recommendations = []) => recommendations
      .map((recommendation) => {
        const matchedProduct = (recommendation.recommendedProductId ?? recommendation.recommended_product_id)
          ? productMap.get(recommendation.recommendedProductId ?? recommendation.recommended_product_id) ?? null
          : null;
        const matchedService = (recommendation.recommendedServiceId ?? recommendation.recommended_service_id)
          ? serviceMap.get(recommendation.recommendedServiceId ?? recommendation.recommended_service_id) ?? null
          : null;

        return normalizeRecommendationRecord({
          recommendation,
          clickedProduct,
          matchedProduct,
          matchedService,
        });
      })
      .filter((recommendation) => recommendation.consequentKind === 'service' || recommendation.recommendedProduct);

    const mergedRecommendations = dedupeRecommendations([
      ...normalizeExternalRecommendations(curatedRecommendations ?? []),
      ...fallbackRecommendations,
      ...normalizeExternalRecommendations(directRecommendations ?? []),
    ]);

    res.json(buildPackageResponse({
      recommendationRows: mergedRecommendations,
      clickedProduct,
      productMap,
      serviceMap,
      partLimit,
      serviceLimit,
    }));
  } catch (error) {
    next(error);
  }
});

export default router;















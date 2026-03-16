import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();
const PRODUCT_CATALOG_CACHE_TTL_MS = 60 * 1000;
const FULL_CATALOG_PAGE_SIZE = 1000;
const SERVICE_CATALOG_CACHE_TTL_MS = 60 * 1000;

const PACKAGE_RULES = [
  {
    id: 'oil-change',
    name: 'Oil Change Package',
    description: 'Common consumables and labor for routine oil service.',
    anchorKeywords: ['engine oil', 'oil filter', 'drain plug washer'],
    productGroups: [
      { keywords: ['engine oil'], reasonLabel: 'Engine oil bundle match' },
      { keywords: ['oil filter'], reasonLabel: 'Oil filter bundle match' },
      { keywords: ['drain plug washer'], reasonLabel: 'Drain washer bundle match' },
    ],
    serviceGroups: [
      { keywords: ['oil change', 'preventive maintenance'], reasonLabel: 'Recommended oil service labor' },
    ],
  },
  {
    id: 'brake-refresh',
    name: 'Brake Refresh Package',
    description: 'Brake parts often sold together with cleaning fluid and installation work.',
    anchorKeywords: ['brake pad', 'brake shoe', 'brake cleaner', 'brake fluid', 'disc rotor'],
    productGroups: [
      { keywords: ['brake pad', 'brake shoe'], reasonLabel: 'Brake friction set pairing' },
      { keywords: ['brake cleaner'], reasonLabel: 'Brake cleaning add-on' },
      { keywords: ['brake fluid'], reasonLabel: 'Brake fluid add-on' },
    ],
    serviceGroups: [
      { keywords: ['brake', 'installation'], reasonLabel: 'Recommended brake installation labor' },
    ],
  },
  {
    id: 'filter-maintenance',
    name: 'Filter Maintenance Package',
    description: 'Air and cabin filters matched with preventive maintenance work.',
    anchorKeywords: ['air filter', 'cabin filter', 'fuel filter'],
    productGroups: [
      { keywords: ['air filter'], reasonLabel: 'Air filter bundle match' },
      { keywords: ['cabin filter'], reasonLabel: 'Cabin filter bundle match' },
      { keywords: ['fuel filter'], reasonLabel: 'Fuel filter bundle match' },
    ],
    serviceGroups: [
      { keywords: ['filter', 'preventive maintenance', 'inspection'], reasonLabel: 'Recommended filter installation labor' },
    ],
  },
  {
    id: 'ignition-tune-up',
    name: 'Ignition Tune-Up Package',
    description: 'Ignition parts paired with tune-up labor.',
    anchorKeywords: ['spark plug', 'ignition coil'],
    productGroups: [
      { keywords: ['spark plug'], reasonLabel: 'Spark plug bundle match' },
      { keywords: ['ignition coil'], reasonLabel: 'Ignition coil add-on' },
    ],
    serviceGroups: [
      { keywords: ['tune', 'spark plug', 'ignition'], reasonLabel: 'Recommended tune-up labor' },
    ],
  },
  {
    id: 'battery-care',
    name: 'Battery Care Package',
    description: 'Battery products paired with electrical installation and cleanup.',
    anchorKeywords: ['battery', 'terminal'],
    productGroups: [
      { keywords: ['battery'], reasonLabel: 'Battery package match' },
      { keywords: ['terminal cleaner', 'battery terminal'], reasonLabel: 'Terminal maintenance add-on' },
    ],
    serviceGroups: [
      { keywords: ['battery', 'electrical', 'installation'], reasonLabel: 'Recommended battery installation labor' },
    ],
  },
  {
    id: 'cooling-system',
    name: 'Cooling System Package',
    description: 'Cooling system parts bundled with coolant and installation service.',
    anchorKeywords: ['radiator', 'coolant', 'thermostat', 'water pump'],
    productGroups: [
      { keywords: ['coolant'], reasonLabel: 'Coolant refill add-on' },
      { keywords: ['thermostat'], reasonLabel: 'Thermostat package match' },
      { keywords: ['radiator cap', 'water pump', 'hose'], reasonLabel: 'Cooling system add-on' },
    ],
    serviceGroups: [
      { keywords: ['cooling', 'radiator', 'installation'], reasonLabel: 'Recommended cooling-system labor' },
    ],
  },
];

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

function findBestMatchingProduct({ clickedProduct, catalog, usedProductIds, keywords }) {
  const preferredModel = normalizeText(clickedProduct.model);
  const rankedMatches = catalog
    .filter((candidate) => !usedProductIds.has(candidate.id))
    .map((candidate) => ({
      candidate,
      text: buildProductSearchText(candidate),
      sameModel: preferredModel && normalizeText(candidate.model) === preferredModel,
    }))
    .filter(({ text }) => matchesAnyKeyword(text, keywords))
    .sort((left, right) => {
      if (left.sameModel !== right.sameModel) {
        return left.sameModel ? -1 : 1;
      }

      if ((right.candidate.stock ?? 0) !== (left.candidate.stock ?? 0)) {
        return (right.candidate.stock ?? 0) - (left.candidate.stock ?? 0);
      }

      return left.candidate.name.localeCompare(right.candidate.name);
    });

  return rankedMatches[0]?.candidate ?? null;
}

function findBestMatchingService({ serviceCatalog, keywords }) {
  const rankedMatches = serviceCatalog
    .map((service) => ({
      service,
      text: buildServiceSearchText(service),
    }))
    .filter(({ text }) => matchesAnyKeyword(text, keywords));

  return rankedMatches[0]?.service ?? null;
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

function buildRuleBasedPackageRecommendations({ clickedProduct, catalog, serviceCatalog, limitCount }) {
  const productText = buildProductSearchText(clickedProduct);
  const matchingRule = PACKAGE_RULES.find((rule) => matchesAnyKeyword(productText, rule.anchorKeywords));

  if (!matchingRule) {
    return [];
  }

  const usedProductIds = new Set([clickedProduct.id]);
  const recommendations = [];

  for (const group of matchingRule.productGroups) {
    const matchedProduct = findBestMatchingProduct({
      clickedProduct,
      catalog,
      usedProductIds,
      keywords: group.keywords,
    });

    if (!matchedProduct) {
      continue;
    }

    usedProductIds.add(matchedProduct.id);
    recommendations.push({
      ruleId: null,
      consequentKind: 'product',
      recommendedProductId: matchedProduct.id,
      recommendedProductName: matchedProduct.name,
      recommendedServiceId: null,
      recommendedServiceName: null,
      recommendedPrice: Number(matchedProduct.price ?? 0),
      support: null,
      confidence: null,
      lift: null,
      sampleCount: null,
      reasonLabel: group.reasonLabel,
      packageKey: matchingRule.id,
      packageName: matchingRule.name,
      packageDescription: matchingRule.description,
    });
  }

  for (const group of matchingRule.serviceGroups) {
    const matchedService = findBestMatchingService({
      serviceCatalog,
      keywords: group.keywords,
    });

    if (!matchedService) {
      continue;
    }

    recommendations.push({
      ruleId: null,
      consequentKind: 'service',
      recommendedProductId: null,
      recommendedProductName: null,
      recommendedServiceId: matchedService.id,
      recommendedServiceName: matchedService.name,
      recommendedPrice: Number(matchedService.price ?? 0),
      support: null,
      confidence: null,
      lift: null,
      sampleCount: null,
      reasonLabel: group.reasonLabel,
      packageKey: matchingRule.id,
      packageName: matchingRule.name,
      packageDescription: matchingRule.description,
    });
  }

  return dedupeRecommendations(recommendations).slice(0, limitCount);
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
    const limitCount = Number(req.query.limit || 5);
    const vehicleModelId = req.query.vehicleModelId || null;
    const [directRecommendations, curatedRecommendations, catalog, serviceCatalog] = await Promise.all([
      callRpc('get_product_upsell_recommendations', {
        product_id: req.params.productId,
        vehicle_model_id: vehicleModelId,
        limit_count: limitCount,
      }),
      getOptionalCuratedRecommendations(req.params.productId, vehicleModelId, limitCount),
      getCachedProductCatalog(),
      getCachedServiceCatalog(),
    ]);

    const clickedProduct = catalog.find((product) => product.id === req.params.productId);
    const fallbackRecommendations = clickedProduct
      ? buildRuleBasedPackageRecommendations({
          clickedProduct,
          catalog,
          serviceCatalog,
          limitCount,
        })
      : [];

    const mergedRecommendations = dedupeRecommendations([
      ...(curatedRecommendations ?? []),
      ...(directRecommendations ?? []),
      ...fallbackRecommendations,
    ]).slice(0, limitCount);

    const productMap = new Map(catalog.map((product) => [product.id, product]));
    const serviceMap = new Map(serviceCatalog.map((service) => [service.id, service]));
    const enrichedRecommendations = mergedRecommendations.map((recommendation) => {
      const matchedProduct = recommendation.recommendedProductId
        ? productMap.get(recommendation.recommendedProductId)
        : null;
      const matchedService = recommendation.recommendedServiceId
        ? serviceMap.get(recommendation.recommendedServiceId)
        : null;

      return {
        ...recommendation,
        recommendedProduct: matchedProduct ?? null,
        recommendedService: matchedService ?? null,
      };
    });

    res.json({ recommendations: enrichedRecommendations ?? [] });
  } catch (error) {
    next(error);
  }
});

export default router;




import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();
const PRODUCT_CATALOG_CACHE_TTL_MS = 60 * 1000;

let productCatalogCache = {
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

async function getCachedProductCatalog() {
  const now = Date.now();
  if (productCatalogCache.data && (now - productCatalogCache.fetchedAt) < PRODUCT_CATALOG_CACHE_TTL_MS) {
    return productCatalogCache.data;
  }

  const products = await callRpc('get_product_catalog');
  productCatalogCache = {
    data: products ?? [],
    fetchedAt: now,
  };

  return productCatalogCache.data;
}

function filterBySearch(products, query) {
  const trimmedQuery = String(query || '').trim().toLowerCase();
  if (!trimmedQuery) {
    return products;
  }

  return products.filter((product) => (
    String(product.name || '').toLowerCase().includes(trimmedQuery)
    || String(product.sku || '').toLowerCase().includes(trimmedQuery)
    || String(product.model || '').toLowerCase().includes(trimmedQuery)
  ));
}

function sortProducts(products, sortBy) {
  const items = [...products];

  switch (sortBy) {
    case 'name-desc':
      return items.sort((a, b) => String(b.name || '').localeCompare(String(a.name || '')));
    case 'price-asc':
      return items.sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0) || String(a.name || '').localeCompare(String(b.name || '')));
    case 'price-desc':
      return items.sort((a, b) => Number(b.price ?? 0) - Number(a.price ?? 0) || String(a.name || '').localeCompare(String(b.name || '')));
    case 'name-asc':
    default:
      return items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }
}

function buildCategorySummary(products, totalCount) {
  const counts = new Map();

  products.forEach((product) => {
    const category = String(product.category || 'Uncategorized');
    counts.set(category, (counts.get(category) || 0) + 1);
  });

  return [
    { value: 'all', label: 'All Categories', count: totalCount },
    ...Array.from(counts.entries())
      .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
      .map(([category, count]) => ({ value: category, label: category, count })),
  ];
}

router.get('/products', async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1, 10000);
    const pageSize = parsePositiveInteger(req.query.pageSize, 10, 100);
    const sortBy = String(req.query.sortBy || 'name-asc');
    const selectedCategory = String(req.query.category || 'all');
    const catalog = await getCachedProductCatalog();

    const searchFiltered = filterBySearch(catalog, req.query.q);
    const categories = buildCategorySummary(searchFiltered, searchFiltered.length);
    const categoryFiltered = selectedCategory === 'all'
      ? searchFiltered
      : searchFiltered.filter((product) => String(product.category || '') === selectedCategory);
    const sortedProducts = sortProducts(categoryFiltered, sortBy);
    const totalCount = sortedProducts.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const products = sortedProducts.slice(startIndex, startIndex + pageSize);

    res.json({
      products,
      categories,
      pagination: {
        page: currentPage,
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

router.get('/services', async (_req, res, next) => {
  try {
    const { data: services, error } = await supabaseAdmin
      .schema('app')
      .from('services')
      .select('id, code, name, description, standard_price, estimated_duration_minutes')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    res.json({
      services: (services ?? []).map((service) => ({
        id: service.id,
        code: service.code,
        name: service.name,
        description: service.description,
        price: Number(service.standard_price ?? 0),
        estimatedDurationMinutes: Number(service.estimated_duration_minutes ?? 0),
      })),
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
    const recommendations = await callRpc('get_product_upsell_recommendations', {
      product_id: req.params.productId,
      vehicle_model_id: req.query.vehicleModelId || null,
      limit_count: Number(req.query.limit || 5),
    });

    res.json({ recommendations: recommendations ?? [] });
  } catch (error) {
    next(error);
  }
});

export default router;

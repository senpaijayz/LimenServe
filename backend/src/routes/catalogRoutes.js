import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();
const PRODUCT_CATALOG_CACHE_TTL_MS = 60 * 1000;
const FULL_CATALOG_PAGE_SIZE = 1000;

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
    const [
      { count: pricelistRows, error: pricelistError },
      { count: uniqueProducts, error: productsError },
      { count: currentPriceRows, error: pricesError },
    ] = await Promise.all([
      supabaseAdmin.from('pricelist').select('sku', { count: 'exact', head: true }),
      supabaseAdmin.schema('app').from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabaseAdmin.schema('app').from('product_prices').select('product_id', { count: 'exact', head: true }).eq('price_type', 'retail').eq('is_current', true),
    ]);

    if (pricelistError) {
      throw pricelistError;
    }

    if (productsError) {
      throw productsError;
    }

    if (pricesError) {
      throw pricesError;
    }

    res.json({
      summary: {
        totalProducts: Number(pricelistRows ?? 0),
        pricelistRows: Number(pricelistRows ?? 0),
        uniqueProducts: Number(uniqueProducts ?? 0),
        currentPrices: Number(currentPriceRows ?? 0),
      },
    });
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

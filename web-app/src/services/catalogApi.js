import apiClient, { extractApiError } from './apiClient';
import { ALL_VEHICLE_MODELS, products as fallbackProducts } from '../data/productData';
import inventoryClassifier from '../lib/inventoryClassifier';

const { OPERATIONAL_CATEGORIES, classifyInventoryItem } = inventoryClassifier;

const CURRENT_YEAR = new Date().getFullYear();

function isNetworkFailure(error) {
  return !error?.response;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

let fallbackCatalogPromise = null;

function normalizeFallbackProduct(product, index = 0) {
  const sourceCategory = product.sourceCategory ?? product.source_category ?? null;
  const runtimeClassification = classifyInventoryItem({
    sku: product.sku,
    name: product.name,
    model_name: product.model,
    category: product.category,
    sourceCategory,
    pcc: product.pcc,
    metadata: {
      ...(product.classification ? { classification: product.classification } : {}),
      ...(product.pcc ? { pcc: product.pcc } : {}),
      ...(sourceCategory ? { sourceCategory } : {}),
    },
  });

  return {
    ...product,
    id: product.id ?? `${product.sku || 'fallback'}-${index + 1}`,
    model: product.model ?? product.model_name ?? '',
    category: runtimeClassification.category,
    sourceCategory: runtimeClassification.sourceCategory ?? sourceCategory,
    classification: product.classification ?? runtimeClassification.trace,
  };
}

async function loadFallbackCatalogSource() {
  if (!fallbackCatalogPromise) {
    fallbackCatalogPromise = (async () => {
      try {
        const response = await fetch('/data/fullPricelist.json', { cache: 'force-cache' });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            return data.map(normalizeFallbackProduct);
          }
        }
      } catch {
        // Fall through to the curated embedded sample.
      }

      return fallbackProducts.map(normalizeFallbackProduct);
    })();
  }

  return fallbackCatalogPromise;
}

function buildFallbackCategoryOptions(items, selectedCategory = 'all') {
  const counts = OPERATIONAL_CATEGORIES.map((category) => {
    const categoryCount = items.filter((product) => product.category === category).length;
    return {
      value: category.toLowerCase(),
      label: category,
      count: categoryCount,
    };
  }).filter((category) => category.count > 0 || category.value === selectedCategory);

  return [
    {
      value: 'all',
      label: 'All categories',
      count: items.length,
    },
    ...counts,
  ];
}

function sortFallbackProducts(items, sortBy) {
  const sorted = [...items];

  sorted.sort((left, right) => {
    if (sortBy === 'price-asc') {
      return Number(left.price ?? 0) - Number(right.price ?? 0);
    }

    if (sortBy === 'price-desc') {
      return Number(right.price ?? 0) - Number(left.price ?? 0);
    }

    const leftName = String(left.name || '');
    const rightName = String(right.name || '');
    return sortBy === 'name-desc'
      ? rightName.localeCompare(leftName)
      : leftName.localeCompare(rightName);
  });

  return sorted;
}

function buildFallbackPagination(items, page = 1, pageSize = 12) {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const startIndex = (safePage - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      totalCount,
      totalPages,
    },
  };
}

async function getFallbackCatalog(params = {}) {
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 12;
  const searchQuery = normalizeText(params.q);
  const selectedCategory = normalizeText(params.category || 'all');
  const selectedVehicleModel = normalizeText(params.vehicleModel);
  const selectedVehicleYear = normalizeText(params.vehicleYear);
  const fallbackCatalog = await loadFallbackCatalogSource();

  const filteredProducts = fallbackCatalog.filter((product) => {
    const matchesSearch = !searchQuery || [
      product.name,
      product.sku,
      product.model,
      product.category,
    ].some((field) => normalizeText(field).includes(searchQuery));

    const matchesCategory = selectedCategory === 'all' || normalizeText(product.category) === selectedCategory;
    const matchesVehicleModel = !selectedVehicleModel || normalizeText(product.model).includes(selectedVehicleModel);
    const matchesVehicleYear = !selectedVehicleYear || normalizeText(product.model).includes(selectedVehicleYear);

    return matchesSearch && matchesCategory && matchesVehicleModel && matchesVehicleYear;
  });

  const sortedProducts = sortFallbackProducts(filteredProducts, params.sortBy);
  const paginated = buildFallbackPagination(sortedProducts, page, pageSize);
  const categorySource = fallbackCatalog.filter((product) => {
    const matchesSearch = !searchQuery || [
      product.name,
      product.sku,
      product.model,
      product.category,
    ].some((field) => normalizeText(field).includes(searchQuery));

    const matchesVehicleModel = !selectedVehicleModel || normalizeText(product.model).includes(selectedVehicleModel);
    const matchesVehicleYear = !selectedVehicleYear || normalizeText(product.model).includes(selectedVehicleYear);

    return matchesSearch && matchesVehicleModel && matchesVehicleYear;
  });

  return {
    products: paginated.items,
    pagination: paginated.pagination,
    categories: buildFallbackCategoryOptions(categorySource, selectedCategory),
  };
}

function buildFallbackYearOptions(model) {
  const label = String(model || '').trim();
  const rangeMatch = label.match(/\((\d{4})-(PRESENT|\d{4})\)/i);

  if (!rangeMatch) {
    return [];
  }

  const startYear = Number(rangeMatch[1]);
  const endYear = rangeMatch[2].toUpperCase() === 'PRESENT' ? CURRENT_YEAR : Number(rangeMatch[2]);

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || endYear < startYear) {
    return [];
  }

  const years = [];
  for (let year = endYear; year >= startYear; year -= 1) {
    years.push({
      value: String(year),
      label: String(year),
    });
  }
  return years;
}

function getFallbackVehicleFitmentOptions(model = '') {
  const normalizedModel = normalizeText(model);
  const models = [...new Set(ALL_VEHICLE_MODELS)]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .map((item) => ({
      value: item,
      label: item,
    }));

  const selectedModel = models.find((item) => normalizeText(item.value) === normalizedModel)?.value || model;

  return {
    models,
    years: buildFallbackYearOptions(selectedModel),
  };
}

function buildFallbackVehicleContext(vehicle = {}) {
  const model = String(vehicle.vehicleModel || vehicle.model || '').trim();
  const year = String(vehicle.vehicleYear || vehicle.year || '').trim();
  const displayLabel = [model, year].filter(Boolean).join(' ');

  return {
    model,
    year,
    engine: '',
    displayLabel: displayLabel || model || 'Selected vehicle',
  };
}

export async function getProductCatalog(params = {}) {
  try {
    const { data } = await apiClient.get('/catalog/products', { params });
    return {
      products: data.products ?? [],
      pagination: data.pagination ?? { page: 1, pageSize: 12, totalCount: 0, totalPages: 1 },
      categories: data.categories ?? [],
    };
  } catch (error) {
    if (isNetworkFailure(error)) {
      return getFallbackCatalog(params);
    }
    extractApiError(error, 'Failed to load product catalog.');
  }
}

export async function getVehicleFitmentOptions(params = {}) {
  try {
    const { data } = await apiClient.get('/catalog/vehicle-fitment/options', { params });
    return {
      models: data.models ?? [],
      years: data.years ?? [],
    };
  } catch (error) {
    if (isNetworkFailure(error)) {
      return getFallbackVehicleFitmentOptions(params.model);
    }
    extractApiError(error, 'Failed to load Mitsubishi fitment options.');
  }
}

export async function getVehiclePackages(params = {}) {
  try {
    const { data } = await apiClient.get('/catalog/vehicle-packages', { params });
    return {
      vehicleContext: data.vehicleContext ?? null,
      packages: data.packages ?? [],
    };
  } catch (error) {
    if (isNetworkFailure(error)) {
      return {
        vehicleContext: buildFallbackVehicleContext(params),
        packages: [],
      };
    }
    extractApiError(error, 'Failed to load vehicle smart bundles.');
  }
}

export async function getFullProductCatalog() {
  try {
    const { data } = await apiClient.get('/catalog/products/all');
    return data.products ?? [];
  } catch (error) {
    if (isNetworkFailure(error)) {
      return loadFallbackCatalogSource();
    }
    extractApiError(error, 'Failed to load full product catalog.');
  }
}

export async function getCatalogSummary() {
  try {
    const { data } = await apiClient.get('/catalog/summary');
    return data.summary ?? {
      totalProducts: 0,
      pricelistRows: 0,
      uniqueProducts: 0,
      currentPrices: 0,
    };
  } catch (error) {
    extractApiError(error, 'Failed to load catalog summary.');
  }
}

export async function getServiceCatalog() {
  try {
    const { data } = await apiClient.get('/catalog/services');
    return data.services ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load service catalog.');
  }
}

export async function getCurrentRetailPriceList() {
  try {
    const { data } = await apiClient.get('/catalog/prices/current');
    return data.priceList ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load the current price list.');
  }
}

export async function replaceRetailPriceList(items, effectiveFrom) {
  try {
    const { data } = await apiClient.post('/catalog/prices/bulk-replace', {
      items,
      effectiveFrom,
    });

    return data;
  } catch (error) {
    extractApiError(error, 'Failed to replace the price list.');
  }
}

export async function getAnalyticsRefreshRuns(limitCount = 10) {
  try {
    const { data } = await apiClient.get('/analytics/refresh-runs', {
      params: { limit: limitCount },
    });
    return data.refreshRuns ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load analytics refresh runs.');
  }
}

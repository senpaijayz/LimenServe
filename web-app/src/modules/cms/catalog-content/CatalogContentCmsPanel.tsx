import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { getProductCatalog, getServiceCatalog } from '../../../services/catalogApi';
import { useToast } from '../../../components/ui/Toast';
import {
  deleteCmsFeaturedCatalogItem,
  deleteCmsRecommendationPackage,
  getCmsCatalogContent,
  saveCmsFeaturedCatalogItem,
  saveCmsRecommendationPackage,
} from '../api/cmsCatalogApi';
import type {
  CmsFeaturedCatalogItem,
  CmsRecommendationPackage,
  CmsRecommendationPackageItem,
} from '../types/cmsCatalogTypes';
import {
  createEmptyFeaturedCatalogItem,
  createEmptyRecommendationPackage,
  createEmptyServiceRecommendationPackage,
  hasValidRecommendationPackageItems,
  normalizeFeaturedCatalogItem,
  normalizeRecommendationPackage,
} from './cmsCatalogContentModel';

type CatalogProductOption = {
  id: string;
  sku?: string;
  name?: string;
  category?: string;
};

type ServiceOption = {
  id: string;
  code?: string;
  name?: string;
};

const placementOptions = [
  { value: 'catalog_featured', label: 'Genuine Parts featured' },
  { value: 'estimate_recommended', label: 'Estimate recommended' },
];

const serviceGroupOptions = [
  { value: 'oil_change', label: 'Oil Change Package' },
  { value: 'brake_service', label: 'Brake Service Package' },
  { value: 'cooling_service', label: 'Cooling Service Package' },
  { value: 'battery_service', label: 'Battery Service Package' },
  { value: 'tune_up', label: 'Tune-Up Package' },
  { value: 'filter_service', label: 'Filter Service Package' },
  { value: 'service_package', label: 'Service Package' },
  { value: 'general_service', label: 'General Service Package' },
];

const fieldClassName = 'w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-950 outline-none transition focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/15';

function productLabel(product?: CatalogProductOption): string {
  if (!product) return 'Choose product';
  return `${product.sku || 'No part number'} - ${product.name || 'Unnamed product'}`;
}

function serviceLabel(service?: ServiceOption): string {
  if (!service) return 'Choose service';
  return `${service.code || 'Service'} - ${service.name || 'Unnamed service'}`;
}

function Field({ label, value, onChange, type = 'text' }: {
  label: string;
  value: string | number;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">{label}</span>
      <input className={`${fieldClassName} mt-2`} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">{label}</span>
      <select className={`${fieldClassName} mt-2`} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ProductSearchSelect({ label, value, products, selectedLabel, onChange }: {
  label: string;
  value: string;
  products: CatalogProductOption[];
  selectedLabel?: string;
  onChange: (value: string, product?: CatalogProductOption) => void;
}) {
  const [remoteProducts, setRemoteProducts] = useState<CatalogProductOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const mergedProducts = useMemo(() => {
    const map = new Map<string, CatalogProductOption>();
    [...products, ...remoteProducts].forEach((product) => {
      if (product.id) {
        map.set(product.id, product);
      }
    });
    return [...map.values()];
  }, [products, remoteProducts]);
  const selectedProduct = mergedProducts.find((product) => product.id === value);
  const resolvedSelectedLabel = selectedProduct ? productLabel(selectedProduct) : '';

  useEffect(() => {
    if (query.trim().length < 2) {
      setRemoteProducts([]);
      setIsSearching(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await getProductCatalog({
          page: 1,
          pageSize: 12,
          q: query.trim(),
          includeCategories: false,
          sortBy: 'name-asc',
        });
        if (active) {
          setRemoteProducts(result?.products ?? []);
        }
      } catch {
        if (active) {
          setRemoteProducts([]);
        }
      } finally {
        if (active) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const suggestions = useMemo(() => {
    if (!normalizedQuery && selectedProduct) {
      return [selectedProduct];
    }

    if (!normalizedQuery) {
      return mergedProducts.slice(0, 5);
    }

    return mergedProducts
      .filter((product) => [
        product.sku,
        product.name,
        product.category,
      ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery))
      .slice(0, 5);
  }, [mergedProducts, normalizedQuery, selectedProduct]);

  return (
    <div className="block">
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">{label}</span>
      <input
        className={`${fieldClassName} mt-2`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={resolvedSelectedLabel || selectedLabel || 'Search part number or product name'}
      />
      <div className="mt-2 overflow-hidden rounded-xl border border-primary-200 bg-white">
        {isSearching ? (
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-primary-500">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Searching live catalog...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="px-3 py-3 text-sm text-primary-500">No matching parts found.</div>
        ) : suggestions.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => {
              onChange(product.id, product);
              setQuery('');
            }}
            className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-primary-50 ${
              product.id === value ? 'bg-accent-blue/10 font-semibold text-accent-blue' : 'text-primary-700'
            }`}
          >
            {productLabel(product)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-primary-400">Type at least 2 characters to search the full live catalog.</p>
    </div>
  );
}

function ServiceSearchSelect({ value, services, onChange }: {
  value: string;
  services: ServiceOption[];
  onChange: (value: string) => void;
}) {
  const selectedService = services.find((service) => service.id === value);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!normalizedQuery && selectedService) {
      return [selectedService];
    }

    if (!normalizedQuery) {
      return services.slice(0, 5);
    }

    return services
      .filter((service) => [service.code, service.name].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery))
      .slice(0, 5);
  }, [normalizedQuery, selectedService, services]);

  return (
    <div className="block">
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Service</span>
      <input
        className={`${fieldClassName} mt-2`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={selectedService ? serviceLabel(selectedService) : 'Search service name or code'}
      />
      <div className="mt-2 overflow-hidden rounded-xl border border-primary-200 bg-white">
        {suggestions.length === 0 ? (
          <div className="px-3 py-3 text-sm text-primary-500">No matching services found.</div>
        ) : suggestions.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => {
              onChange(service.id);
              setQuery('');
            }}
            className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-primary-50 ${
              service.id === value ? 'bg-accent-blue/10 font-semibold text-accent-blue' : 'text-primary-700'
            }`}
          >
            {serviceLabel(service)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CatalogContentCmsPanel() {
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [featuredItems, setFeaturedItems] = useState<CmsFeaturedCatalogItem[]>([]);
  const [packages, setPackages] = useState<CmsRecommendationPackage[]>([]);
  const [products, setProducts] = useState<CatalogProductOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  async function refreshContent() {
    setLoading(true);
    try {
      const [content, productCatalog, serviceCatalog] = await Promise.all([
        getCmsCatalogContent(),
        getProductCatalog({ page: 1, pageSize: 250, includeCategories: false }),
        getServiceCatalog(),
      ]);
      setFeaturedItems(content.featuredItems);
      setPackages(content.recommendationPackages);
      setProducts(productCatalog.products ?? []);
      setServices(serviceCatalog ?? []);
    } catch (loadError) {
      showError(loadError instanceof Error ? loadError.message : 'Failed to load catalog CMS content.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshContent();
  }, []);

  const updateFeaturedItem = (index: number, patch: Partial<CmsFeaturedCatalogItem>) => {
    setFeaturedItems((items) => items.map((item, itemIndex) => (
      itemIndex === index ? normalizeFeaturedCatalogItem({ ...item, ...patch }) : item
    )));
  };

  const updatePackage = (index: number, patch: Partial<CmsRecommendationPackage>) => {
    setPackages((items) => items.map((item, itemIndex) => (
      itemIndex === index ? normalizeRecommendationPackage({ ...item, ...patch }) : item
    )));
  };

  const updatePackageItem = (packageIndex: number, itemIndex: number, patch: Partial<CmsRecommendationPackageItem>) => {
    setPackages((items) => items.map((pkg, pkgIndex) => {
      if (pkgIndex !== packageIndex) return pkg;
      return normalizeRecommendationPackage({
        ...pkg,
        items: pkg.items.map((item, nextItemIndex) => (
          nextItemIndex === itemIndex ? { ...item, ...patch } : item
        )),
      });
    }));
  };

  async function saveFeatured(index: number) {
    setSavingKey(`featured-${index}`);
    try {
      const saved = await saveCmsFeaturedCatalogItem(featuredItems[index]);
      setFeaturedItems((items) => items.map((item, itemIndex) => (itemIndex === index ? saved : item)));
      success('Featured product saved.');
    } catch (saveError) {
      showError(saveError instanceof Error ? saveError.message : 'Failed to save featured product.');
    } finally {
      setSavingKey('');
    }
  }

  async function removeFeatured(index: number) {
    const item = featuredItems[index];
    if (!item.id) {
      setFeaturedItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    setSavingKey(`featured-delete-${index}`);
    try {
      await deleteCmsFeaturedCatalogItem(item.id);
      setFeaturedItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
      success('Featured product removed.');
    } catch (deleteError) {
      showError(deleteError instanceof Error ? deleteError.message : 'Failed to remove featured product.');
    } finally {
      setSavingKey('');
    }
  }

  async function savePackage(index: number) {
    setSavingKey(`package-${index}`);
    try {
      if (!hasValidRecommendationPackageItems(packages[index])) {
        showError('Add at least one product or service item before saving this recommendation package.');
        return;
      }

      const saved = await saveCmsRecommendationPackage(packages[index]);
      setPackages((items) => items.map((item, itemIndex) => (itemIndex === index ? saved : item)));
      success('Recommendation package saved.');
    } catch (saveError) {
      showError(saveError instanceof Error ? saveError.message : 'Failed to save recommendation package.');
    } finally {
      setSavingKey('');
    }
  }

  async function removePackage(index: number) {
    const pkg = packages[index];
    if (!pkg.id) {
      setPackages((items) => items.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    setSavingKey(`package-delete-${index}`);
    try {
      await deleteCmsRecommendationPackage(pkg.id);
      setPackages((items) => items.filter((_, itemIndex) => itemIndex !== index));
      success('Recommendation package removed.');
    } catch (deleteError) {
      showError(deleteError instanceof Error ? deleteError.message : 'Failed to remove recommendation package.');
    } finally {
      setSavingKey('');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-primary-500">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
        Loading catalog CMS...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-5 lg:p-6">
      <section className="rounded-3xl border border-primary-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-display font-semibold text-primary-950">Featured Products</h2>
            <p className="mt-1 text-sm text-primary-500">Choose catalog products that appear in the public Genuine Parts page.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setFeaturedItems((items) => [...items, createEmptyFeaturedCatalogItem()])}>
            <Plus className="h-4 w-4" />
            Add Featured Product
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {featuredItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-primary-300 bg-primary-50 p-8 text-center text-primary-500">No featured products yet.</div>
          ) : featuredItems.map((item, index) => (
            <div key={item.id || index} className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField label="Placement" value={item.placementKey} options={placementOptions} onChange={(value) => updateFeaturedItem(index, { placementKey: value })} />
                <ProductSearchSelect label="Product" value={item.productId} products={products} selectedLabel={item.sku || item.name ? `${item.sku || 'No part number'} - ${item.name || 'Unnamed product'}` : ''} onChange={(value, selectedProduct) => {
                  const product = selectedProduct ?? productMap.get(value);
                  updateFeaturedItem(index, { productId: value, sku: product?.sku || '', name: product?.name || '', category: product?.category || '' });
                }} />
              </div>
              <p className="mt-3 text-xs font-semibold text-primary-500">
                Display order is automatic. Newly added featured products appear after the existing featured products.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700">
                  <input type="checkbox" checked={item.isActive} onChange={(event) => updateFeaturedItem(index, { isActive: event.target.checked })} />
                  Active
                </label>
                <button type="button" className="btn btn-primary" disabled={savingKey === `featured-${index}`} onClick={() => void saveFeatured(index)}>
                  {savingKey === `featured-${index}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
                <button type="button" className="btn btn-secondary text-accent-danger" onClick={() => void removeFeatured(index)}>
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-primary-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-display font-semibold text-primary-950">Recommendation Packages</h2>
            <p className="mt-1 text-sm text-primary-500">Curate public smart bundles by anchor product, included parts, and included labor.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setPackages((items) => [...items, createEmptyRecommendationPackage()])}>
              <Plus className="h-4 w-4" />
              Add Package
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setPackages((items) => [...items, createEmptyServiceRecommendationPackage()])}>
              <Plus className="h-4 w-4" />
              Add Service Package
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/10 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-blue">Where it appears</p>
            <p className="mt-2 text-sm font-semibold text-primary-950">Genuine Parts and Get Estimate</p>
            <p className="mt-1 text-sm text-primary-600">Packages show when a customer selects the anchor product or opens a matching smart bundle.</p>
          </div>
          <div className="rounded-2xl border border-primary-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">Anchor product</p>
            <p className="mt-2 text-sm text-primary-600">This is the main part that triggers the package recommendations.</p>
          </div>
          <div className="rounded-2xl border border-primary-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">Package items</p>
            <p className="mt-2 text-sm text-primary-600">Add the parts and labor that should be offered together in the quote builder.</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {packages.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-primary-300 bg-primary-50 p-8 text-center text-primary-500">No curated packages yet.</div>
          ) : packages.map((pkg, packageIndex) => (
            <div key={pkg.id || packageIndex} className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ProductSearchSelect label="Anchor product" value={pkg.anchorProductId} products={products} selectedLabel={pkg.anchorProductSku || pkg.anchorProductName ? `${pkg.anchorProductSku || 'No part number'} - ${pkg.anchorProductName || 'Unnamed product'}` : ''} onChange={(value, selectedProduct) => updatePackage(packageIndex, {
                  anchorProductId: value,
                  anchorProductSku: selectedProduct?.sku || pkg.anchorProductSku,
                  anchorProductName: selectedProduct?.name || pkg.anchorProductName,
                })} />
                <Field label="Package key" value={pkg.packageKey} onChange={(value) => updatePackage(packageIndex, { packageKey: value })} />
                <Field label="Package name" value={pkg.packageName} onChange={(value) => updatePackage(packageIndex, { packageName: value })} />
                <SelectField label="Service group" value={pkg.serviceGroup || 'general_service'} options={serviceGroupOptions} onChange={(value) => updatePackage(packageIndex, { serviceGroup: value })} />
                <Field label="Vehicle model" value={pkg.vehicleModelName} onChange={(value) => updatePackage(packageIndex, { vehicleModelName: value })} />
                <Field label="Vehicle family" value={pkg.vehicleFamily} onChange={(value) => updatePackage(packageIndex, { vehicleFamily: value })} />
                <Field label="Min quantity" type="number" value={pkg.minAnchorQuantity} onChange={(value) => updatePackage(packageIndex, { minAnchorQuantity: Number(value) })} />
                <Field label="Priority" type="number" value={pkg.priority} onChange={(value) => updatePackage(packageIndex, { priority: Number(value) })} />
              </div>
              <label className="mt-4 block">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Description</span>
                <textarea className={`${fieldClassName} mt-2 min-h-20`} value={pkg.packageDescription} onChange={(event) => updatePackage(packageIndex, { packageDescription: event.target.value })} />
              </label>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-primary-500">Package items</h3>
                  <button type="button" className="btn btn-secondary" onClick={() => updatePackage(packageIndex, {
                    items: [...pkg.items, {
                      id: '',
                      itemKind: 'product',
                      productId: '',
                      serviceId: '',
                      productName: '',
                      serviceName: '',
                      reasonLabel: '',
                      displayPriority: (pkg.items.length + 1) * 10,
                      priceMode: 'catalog',
                      priceOverride: null,
                      isActive: true,
                    }],
                  })}>
                    <Plus className="h-4 w-4" />
                    Add Item
                  </button>
                </div>
                {pkg.items.map((item, itemIndex) => (
                  <div key={item.id || itemIndex} className="rounded-2xl border border-primary-200 bg-white p-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[140px_1fr_1fr_120px]">
                      <SelectField label="Type" value={item.itemKind} options={[{ value: 'product', label: 'Product' }, { value: 'service', label: 'Service' }]} onChange={(value) => updatePackageItem(packageIndex, itemIndex, { itemKind: value === 'service' ? 'service' : 'product', productId: '', serviceId: '' })} />
                      {item.itemKind === 'service' ? (
                        <ServiceSearchSelect value={item.serviceId} services={services} onChange={(value) => updatePackageItem(packageIndex, itemIndex, { serviceId: value })} />
                      ) : (
                        <ProductSearchSelect label="Product" value={item.productId} products={products} selectedLabel={item.productName} onChange={(value, selectedProduct) => updatePackageItem(packageIndex, itemIndex, {
                          productId: value,
                          productName: selectedProduct?.name || item.productName,
                        })} />
                      )}
                      <Field label="Reason" value={item.reasonLabel} onChange={(value) => updatePackageItem(packageIndex, itemIndex, { reasonLabel: value })} />
                      <Field label="Order" type="number" value={item.displayPriority} onChange={(value) => updatePackageItem(packageIndex, itemIndex, { displayPriority: Number(value) })} />
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button type="button" className="text-sm font-semibold text-accent-danger" onClick={() => updatePackage(packageIndex, { items: pkg.items.filter((_, nextIndex) => nextIndex !== itemIndex) })}>Remove item</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {!hasValidRecommendationPackageItems(pkg) && (
                  <span className="rounded-full border border-accent-warning/30 bg-accent-warning/10 px-3 py-1 text-xs font-semibold text-accent-warning">
                    Add at least one part or service so this bundle can appear publicly.
                  </span>
                )}
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700">
                  <input type="checkbox" checked={pkg.isActive} onChange={(event) => updatePackage(packageIndex, { isActive: event.target.checked })} />
                  Active
                </label>
                <button type="button" className="btn btn-primary" disabled={savingKey === `package-${packageIndex}`} onClick={() => void savePackage(packageIndex)}>
                  {savingKey === `package-${packageIndex}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Package
                </button>
                <button type="button" className="btn btn-secondary text-accent-danger" onClick={() => void removePackage(packageIndex)}>
                  <Trash2 className="h-4 w-4" />
                  Remove Package
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

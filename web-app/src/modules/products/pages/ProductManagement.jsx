import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, Edit2, Package, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card, { KPICard } from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import useProductCatalog from '../../../hooks/useProductCatalog';
import MitsubishiGenuinePartsLabel from '../../inventory/components/MitsubishiGenuinePartsLabel';
import {
  archiveCatalogProduct,
  createCatalogProduct,
  getArchivedCatalogProducts,
  getManagedCategories,
  getProductStockHistory,
  getSuppliers,
  updateCatalogProduct,
} from '../../../services/catalogApi';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/formatters';
import { getPartNumberSearchSuggestions, getProductPartNumber, normalizeBarcodeToken, stripProductBarcodeSuffix } from '../../../utils/barcode';

const PAGE_SIZE = 12;
const inputClassName = 'w-full rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-950 shadow-sm outline-none transition focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/15';
const MOVEMENT_LABELS = {
  stock_in: 'Stock added',
  stock_out: 'Stock removed',
  sale: 'Sold',
  service_usage: 'Used in service',
  adjustment: 'Stock adjusted',
  reservation: 'Reserved',
  release: 'Released',
};
const emptyForm = {
  sku: '',
  name: '',
  model: '',
  category: 'General Parts & Accessories',
  supplierId: '',
  supplierName: '',
  price: '0',
  stock: 0,
  status: 'in_stock',
  brand: 'Mitsubishi',
  uom: 'PC',
};

function toForm(product = {}) {
  return {
    sku: product.sku || '',
    name: product.name || '',
    model: product.model || '',
    category: product.category || 'General Parts & Accessories',
    supplierId: product.supplierId || '',
    supplierName: product.supplierName || '',
    price: String(product.price ?? 0),
    stock: Number(product.stock ?? product.quantity ?? 0),
    status: product.status || 'in_stock',
    brand: product.brand || 'Mitsubishi',
    uom: product.uom || 'PC',
  };
}

function isStockIncrease(entry = {}) {
  if (['sale', 'stock_out', 'service_usage', 'reservation'].includes(entry.movementType)) {
    return false;
  }
  return entry.movementType === 'stock_in' || Number(entry.quantity ?? 0) > 0;
}

export default function ProductManagement() {
  const { success, error: showError, info } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [suppliers, setSuppliers] = useState([]);
  const [managedCategories, setManagedCategories] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [stockHistory, setStockHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [archivedProducts, setArchivedProducts] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [restoringProductId, setRestoringProductId] = useState(null);

  const { products, categories, pagination, loading, error } = useProductCatalog({
    page: currentPage,
    pageSize: PAGE_SIZE,
    searchQuery,
    selectedCategory,
    includeCategories: true,
    refreshKey,
  });

  const refreshArchivedProducts = useCallback(async () => {
    setArchivedLoading(true);
    try {
      setArchivedProducts(await getArchivedCatalogProducts(8));
    } catch (archiveError) {
      showError(archiveError.message || 'Unable to load archived products.');
    } finally {
      setArchivedLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    async function loadMeta() {
      try {
        const [supplierRows, categoryRows] = await Promise.all([getSuppliers(), getManagedCategories()]);
        setSuppliers(supplierRows);
        setManagedCategories(categoryRows);
      } catch (loadError) {
        showError(loadError.message || 'Unable to load product metadata.');
      }
    }
    void loadMeta();
    void refreshArchivedProducts();
  }, [refreshArchivedProducts, showError]);

  const totalStock = useMemo(() => products.reduce((sum, product) => sum + Number(product.stock ?? product.quantity ?? 0), 0), [products]);
  const partNumberSuggestions = useMemo(() => getPartNumberSearchSuggestions(products, searchQuery, 5), [products, searchQuery]);
  const productCategoryOptions = useMemo(() => {
    const categoryRows = (managedCategories.length > 0 ? managedCategories : categories)
      .map((category) => ({
        id: category.id || category.value || category.name || category.label,
        name: category.name || category.label,
      }))
      .filter((category) => category.name && category.name.toLowerCase() !== 'all categories');

    if (!categoryRows.some((category) => category.name === 'General Parts & Accessories')) {
      categoryRows.unshift({
        id: 'general-parts-accessories',
        name: 'General Parts & Accessories',
      });
    }

    return categoryRows;
  }, [categories, managedCategories]);

  const openCreate = () => {
    setEditingProduct(null);
    setForm({ ...emptyForm });
    setIsModalOpen(true);
  };

  const openEdit = (product) => {
    setEditingProduct(product);
    setForm(toForm(product));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setEditingProduct(null);
    setForm({ ...emptyForm });
    setIsModalOpen(false);
  };

  const openProductDetail = async (product) => {
    setSelectedProduct(product);
    setStockHistory([]);
    setHistoryLoading(true);
    try {
      setStockHistory(await getProductStockHistory(product.id, 30));
    } catch (historyError) {
      showError(historyError.message || 'Unable to load stock history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const partNumber = stripProductBarcodeSuffix(normalizeBarcodeToken(form.sku));
    const productName = String(form.name || '').trim() || partNumber;
    const category = String(form.category || 'General Parts & Accessories').trim();
    const price = Number(form.price || 0);

    if (!partNumber) {
      showError('Part number is required.');
      return;
    }

    if (!category || category === 'all') {
      showError('Choose a product category before saving.');
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      showError('Retail price must be zero or greater.');
      return;
    }

    setSaving(true);
    info(editingProduct ? `Saving ${partNumber}...` : `Registering ${partNumber}...`);
    try {
      const supplier = suppliers.find((item) => item.id === form.supplierId);
      const payload = {
        ...form,
        sku: partNumber,
        name: productName,
        category,
        price,
        supplierName: supplier?.name || form.supplierName,
      };

      if (editingProduct) {
        await updateCatalogProduct(editingProduct.id, payload);
        success(`Product ${partNumber} updated successfully.`);
      } else {
        await createCatalogProduct(payload);
        success(`Product ${partNumber} registered successfully.`);
      }

      closeModal();
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      showError(saveError.message || 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (product) => {
    if (!window.confirm(`Archive product "${product.name}"?`)) return;
    try {
      await archiveCatalogProduct(product.id, { archive: true, reason: 'Archived from Product Management' });
      success('Product archived.');
      setRefreshKey((value) => value + 1);
      await refreshArchivedProducts();
    } catch (archiveError) {
      showError(archiveError.message || 'Unable to archive product.');
    }
  };

  const handleRestore = async (product) => {
    if (!product?.id) return;
    setRestoringProductId(product.id);
    try {
      await archiveCatalogProduct(product.id, { archive: false, reason: 'Restored from Product Management' });
      success('Product restored.');
      setArchivedProducts((current) => current.filter((item) => item.id !== product.id));
      setRefreshKey((value) => value + 1);
    } catch (restoreError) {
      showError(restoreError.message || 'Unable to restore product.');
    } finally {
      setRestoringProductId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-blue">Product Management</p>
          <h2 className="mt-2 text-2xl font-display font-bold text-primary-950">Products</h2>
          <p className="mt-1 max-w-3xl text-sm text-primary-500">Register products, manage barcode labels, supplier/category links, pricing, stock history, and archived records.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} isLoading={loading} onClick={() => setRefreshKey((value) => value + 1)}>Refresh</Button>
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>Register New Product</Button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <KPICard title="Visible Products" value={formatNumber(pagination.totalCount ?? products.length)} icon={<Package className="h-6 w-6" />} />
        <KPICard title="Page Stock" value={formatNumber(totalStock)} icon={<Package className="h-6 w-6" />} accentColor="border-emerald-500" iconBg="bg-emerald-50 text-emerald-600" />
        <KPICard title="Archived" value={formatNumber(archivedProducts.length)} icon={<ArchiveRestore className="h-6 w-6" />} accentColor="border-amber-500" iconBg="bg-amber-50 text-amber-600" />
      </div>

      <Card
        title="Product Directory"
        subtitle="Search and maintain active catalog products."
        headerAction={(
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className="input py-2.5 text-sm" value={selectedCategory} onChange={(event) => { setSelectedCategory(event.target.value); setCurrentPage(1); }}>
              {(categories.length > 0 ? categories : [{ value: 'all', label: 'All Categories' }]).map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
              <input className="input py-2.5 pl-10 text-sm" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setCurrentPage(1); }} placeholder="Search by part number or product name" />
              {searchQuery.trim() && partNumberSuggestions.length > 0 && (
                <div className="absolute z-20 mt-2 max-h-48 w-full overflow-y-auto rounded-xl border border-primary-200 bg-white py-1 shadow-lg">
                  {partNumberSuggestions.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        setSearchQuery(getProductPartNumber(product));
                        setCurrentPage(1);
                        void openProductDetail(product);
                      }}
                      className="flex w-full flex-col px-3 py-2 text-left transition hover:bg-primary-50"
                    >
                      <span className="truncate text-sm font-semibold text-primary-950">{product.name}</span>
                      <span className="font-mono text-xs text-primary-500">{getProductPartNumber(product) || 'No part number'} · {product.category || 'Uncategorized'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <button key={product.id} type="button" onClick={() => openProductDetail(product)} className="overflow-hidden rounded-xl border border-primary-200 bg-white text-left shadow-sm transition hover:border-accent-blue hover:shadow-md">
              <div className="flex h-56 items-center justify-center border-b border-primary-200 bg-[#0b1320] p-4">
                <MitsubishiGenuinePartsLabel product={product} quantity={product.stock ?? product.quantity ?? 0} size="dense" />
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <p className="line-clamp-2 font-bold text-primary-950">{product.name}</p>
                  <p className="mt-1 font-mono text-xs text-primary-500">{getProductPartNumber(product)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <p><span className="text-primary-500">Category</span><br /><span className="font-semibold text-primary-950">{product.category}</span></p>
                  <p className="text-right"><span className="text-primary-500">Price</span><br /><span className="font-semibold text-accent-blue">{formatCurrency(product.price)}</span></p>
                  <p><span className="text-primary-500">Supplier</span><br /><span className="font-semibold text-primary-950">{product.supplierName || 'Unlinked'}</span></p>
                  <p className="text-right"><span className="text-primary-500">Stock</span><br /><span className="font-semibold text-primary-950">{formatNumber(product.stock ?? product.quantity ?? 0)}</span></p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" leftIcon={<Edit2 className="h-4 w-4" />} onClick={(event) => { event.stopPropagation(); openEdit(product); }}>Edit</Button>
                  <Button variant="outline" size="sm" leftIcon={<Trash2 className="h-4 w-4" />} onClick={(event) => { event.stopPropagation(); handleArchive(product); }}>Archive</Button>
                </div>
              </div>
            </button>
          ))}
          {!loading && products.length === 0 && (
            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-10 text-center text-sm text-primary-500 md:col-span-2 xl:col-span-3">No products found.</div>
          )}
          {loading && (
            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-10 text-center text-sm text-primary-500 md:col-span-2 xl:col-span-3">Loading products...</div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-primary-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-primary-600">Page {pagination.page ?? currentPage} of {pagination.totalPages ?? 1}</p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</Button>
            <Button variant="secondary" disabled={currentPage >= (pagination.totalPages ?? 1)} onClick={() => setCurrentPage((page) => Math.min(pagination.totalPages ?? page, page + 1))}>Next</Button>
          </div>
        </div>
      </Card>

      <Card
        title="Archived Products"
        subtitle="Restore soft-deleted catalog items from Product Management."
        headerAction={(
          <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} isLoading={archivedLoading} onClick={refreshArchivedProducts}>
            Refresh
          </Button>
        )}
      >
        {archivedLoading ? (
          <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">Loading archived products...</div>
        ) : archivedProducts.length === 0 ? (
          <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">No archived products yet.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {archivedProducts.map((product) => (
              <div key={product.id} className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex min-h-36 items-center justify-center rounded-xl bg-[#0b1320] p-3">
                  <MitsubishiGenuinePartsLabel product={product} quantity={product.stock ?? product.quantity ?? 0} size="dense" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-primary-950">{product.name}</p>
                  <p className="mt-1 font-mono text-xs text-primary-500">{getProductPartNumber(product) || 'No part number'}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-primary-500">
                  <p><span className="font-semibold text-primary-700">Qty:</span> {formatNumber(product.stock ?? product.quantity ?? 0)}</p>
                  <p><span className="font-semibold text-primary-700">Price:</span> {formatCurrency(product.price ?? 0)}</p>
                  <p className="col-span-2"><span className="font-semibold text-primary-700">Archived:</span> {product.archivedAt ? formatDateTime(product.archivedAt) : '-'}</p>
                </div>
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  leftIcon={<ArchiveRestore className="h-4 w-4" />}
                  isLoading={restoringProductId === product.id}
                  onClick={() => void handleRestore(product)}
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingProduct ? 'Edit Product' : 'Register New Product'} size="xl">
        <form onSubmit={handleSave} className="space-y-5" noValidate>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Part Number</span>
              <input className={`${inputClassName} mt-2 font-mono uppercase`} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value.toUpperCase() })} placeholder="Example: 5370A737" required />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Retail Price</span>
              <input className={`${inputClassName} mt-2`} type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Product Name</span>
              <input className={`${inputClassName} mt-2`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Optional; defaults to the part number" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Category</span>
              <select className={`${inputClassName} mt-2`} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {productCategoryOptions.map((category) => (
                  <option key={category.id || category.name} value={category.name}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Supplier</span>
              <select className={`${inputClassName} mt-2`} value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}>
                <option value="">Unlinked supplier</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Vehicle Model</span>
              <input className={`${inputClassName} mt-2`} value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Status</span>
              <select className={`${inputClassName} mt-2`} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
                <option value="discontinued">Discontinued</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Brand</span>
              <input className={`${inputClassName} mt-2`} value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Unit</span>
              <input className={`${inputClassName} mt-2`} value={form.uom} onChange={(event) => setForm({ ...form, uom: event.target.value })} />
            </label>
          </div>
          <div className="flex justify-end gap-3 border-t border-primary-200 pt-4">
            <Button variant="secondary" type="button" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={saving} leftIcon={<Save className="h-4 w-4" />}>Save Product</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(selectedProduct)} onClose={() => setSelectedProduct(null)} title={selectedProduct ? selectedProduct.name : 'Product Detail'} size="xl">
        {selectedProduct && (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="flex h-64 items-center justify-center rounded-2xl border border-primary-200 bg-[#0b1320] p-4">
                <MitsubishiGenuinePartsLabel product={selectedProduct} quantity={selectedProduct.stock ?? selectedProduct.quantity ?? 0} size="dense" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <p><span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Part Number</span><br /><span className="font-mono text-primary-950">{getProductPartNumber(selectedProduct)}</span></p>
                <p><span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Category</span><br /><span className="font-semibold text-primary-950">{selectedProduct.category}</span></p>
                <p><span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Supplier</span><br /><span className="font-semibold text-primary-950">{selectedProduct.supplierName || 'Unlinked'}</span></p>
                <p><span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Price</span><br /><span className="font-semibold text-accent-blue">{formatCurrency(selectedProduct.price)}</span></p>
                <p><span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Stock</span><br /><span className="font-semibold text-primary-950">{formatNumber(selectedProduct.stock ?? selectedProduct.quantity ?? 0)}</span></p>
                <p><span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Model</span><br /><span className="font-semibold text-primary-950">{selectedProduct.model || '-'}</span></p>
              </div>
            </div>

            <Card title="Stock History" subtitle="Stock additions and related inventory movements for this product.">
              {historyLoading ? (
                <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">Loading stock history...</div>
              ) : stockHistory.length === 0 ? (
                <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">No stock history found.</div>
              ) : (
                <div className="space-y-3">
                  {stockHistory.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-primary-200 bg-white px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-bold text-primary-950">{MOVEMENT_LABELS[entry.movementType] || entry.movementType || 'Inventory movement'}</p>
                          <p className="text-sm text-primary-500">{entry.notes || entry.referenceType || 'No action details'}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className={`font-bold ${isStockIncrease(entry) ? 'text-emerald-700' : 'text-red-700'}`}>{isStockIncrease(entry) ? '+' : '-'}{formatNumber(Math.abs(Number(entry.quantity ?? 0)))}</p>
                          <p className="text-xs text-primary-500">{formatDateTime(entry.createdAt)}</p>
                          <p className="text-xs text-primary-500">{entry.performedBy || 'System'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Edit2, Image as ImageIcon, Package, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card, { KPICard } from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import useProductCatalog from '../../../hooks/useProductCatalog';
import {
  archiveCatalogProduct,
  createCatalogProduct,
  getManagedCategories,
  getProductStockHistory,
  getSuppliers,
  updateCatalogProduct,
} from '../../../services/catalogApi';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/formatters';

const PAGE_SIZE = 12;
const inputClassName = 'w-full rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-950 shadow-sm outline-none transition focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/15';
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
  imageUrl: '',
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
    imageUrl: product.imageUrl || '',
  };
}

export default function ProductManagement() {
  const { success, error: showError } = useToast();
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

  const { products, categories, pagination, loading, error } = useProductCatalog({
    page: currentPage,
    pageSize: PAGE_SIZE,
    searchQuery,
    selectedCategory,
    includeCategories: true,
    refreshKey,
  });

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
  }, [showError]);

  const totalStock = useMemo(() => products.reduce((sum, product) => sum + Number(product.stock ?? product.quantity ?? 0), 0), [products]);
  const imageCount = useMemo(() => products.filter((product) => product.imageUrl).length, [products]);

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
    setSaving(true);
    try {
      const supplier = suppliers.find((item) => item.id === form.supplierId);
      const payload = {
        ...form,
        sku: form.sku,
        price: Number(form.price || 0),
        supplierName: supplier?.name || form.supplierName,
      };

      if (editingProduct) {
        await updateCatalogProduct(editingProduct.id, payload);
        success('Product updated.');
      } else {
        await createCatalogProduct(payload);
        success('Product created.');
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
    } catch (archiveError) {
      showError(archiveError.message || 'Unable to archive product.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-blue">Product Management</p>
          <h2 className="mt-2 text-2xl font-display font-bold text-primary-950">Products</h2>
          <p className="mt-1 max-w-3xl text-sm text-primary-500">Manage product records, database-driven images, supplier/category links, pricing, and stock history.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} isLoading={loading} onClick={() => setRefreshKey((value) => value + 1)}>Refresh</Button>
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>New Product</Button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <KPICard title="Visible Products" value={formatNumber(pagination.totalCount ?? products.length)} icon={<Package className="h-6 w-6" />} />
        <KPICard title="Page Stock" value={formatNumber(totalStock)} icon={<Package className="h-6 w-6" />} accentColor="border-emerald-500" iconBg="bg-emerald-50 text-emerald-600" />
        <KPICard title="DB Images" value={formatNumber(imageCount)} icon={<ImageIcon className="h-6 w-6" />} accentColor="border-amber-500" iconBg="bg-amber-50 text-amber-600" />
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
              <input className="input py-2.5 pl-10 text-sm" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setCurrentPage(1); }} placeholder="Search products" />
            </div>
          </div>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <button key={product.id} type="button" onClick={() => openProductDetail(product)} className="overflow-hidden rounded-xl border border-primary-200 bg-white text-left shadow-sm transition hover:border-accent-blue hover:shadow-md">
              <div className="flex h-44 items-center justify-center border-b border-primary-200 bg-primary-50">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain p-4" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-primary-400">
                    <ImageIcon className="h-10 w-10" />
                    <span className="text-xs font-bold uppercase tracking-[0.16em]">No DB image</span>
                  </div>
                )}
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <p className="line-clamp-2 font-bold text-primary-950">{product.name}</p>
                  <p className="mt-1 font-mono text-xs text-primary-500">{product.sku}</p>
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

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingProduct ? 'Edit Product' : 'New Product'} size="xl">
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">SKU / Part Number</span>
              <input className={`${inputClassName} mt-2`} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="Auto-generated if blank" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Retail Price</span>
              <input className={`${inputClassName} mt-2`} type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Product Name</span>
              <input className={`${inputClassName} mt-2`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Category</span>
              <select className={`${inputClassName} mt-2`} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {(managedCategories.length > 0 ? managedCategories : categories).filter((category) => category.name || category.label).map((category) => (
                  <option key={category.id || category.value} value={category.name || category.label}>{category.name || category.label}</option>
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
            <label className="block md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Database Image URL</span>
              <input className={`${inputClassName} mt-2`} type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." />
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
              <div className="flex h-56 items-center justify-center rounded-2xl border border-primary-200 bg-primary-50">
                {selectedProduct.imageUrl ? (
                  <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="h-full w-full object-contain p-4" />
                ) : (
                  <div className="text-center text-primary-400"><ImageIcon className="mx-auto h-10 w-10" /><p className="mt-2 text-xs font-bold uppercase tracking-[0.16em]">No DB image</p></div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <p><span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">SKU</span><br /><span className="font-mono text-primary-950">{selectedProduct.sku}</span></p>
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
                          <p className="font-bold text-primary-950">{entry.movementType === 'stock_in' ? 'Stock added' : entry.movementType}</p>
                          <p className="text-sm text-primary-500">{entry.notes || entry.referenceType || 'No action details'}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="font-bold text-primary-950">+{formatNumber(entry.quantity)}</p>
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

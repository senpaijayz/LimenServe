import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import { Search, Plus, Grid, List, Package, AlertTriangle, Camera, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ClipboardList, Edit2, Crosshair } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { StockBadge } from '../../../components/ui/Badge';
import Dropdown from '../../../components/ui/Dropdown';
import Modal from '../../../components/ui/Modal';
import ProductCard from '../components/ProductCard';
import AddStockModal from '../components/AddStockModal';
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import { useAuth } from '../../../context/useAuth';
import PriceListManager from '../components/PriceListManager';
import ProductLabelPreviewModal from '../components/ProductLabelPreviewModal';
import { getCatalogSummary, getProductStockHistory, receiveInventoryStock, updateCatalogProduct } from '../../../services/catalogApi';
import useProductCatalog from '../../../hooks/useProductCatalog';
import useDataStore from '../../../store/useDataStore';
import { getPartNumberSearchSuggestions, getProductPartNumber, productMatchesIdentifier } from '../../../utils/barcode';
import { buildLocator3DUrl } from '../../locator3d/utils/locatorNavigation';

const PAGE_SIZE = 12;
const PRODUCT_STATUS_OPTIONS = [
    { value: 'in_stock', label: 'In Stock' },
    { value: 'low_stock', label: 'Low Stock' },
    { value: 'out_of_stock', label: 'Out of Stock' },
    { value: 'discontinued', label: 'Discontinued' },
];

const INVENTORY_CATEGORY_OPTIONS = [
    'Engine System',
    'Electrical & Lighting',
    'Suspension & Steering',
    'Brake System',
    'Cooling System',
    'Transmission & Drivetrain',
    'Body & Exterior',
    'Interior & Cabin',
    'Filters & Maintenance',
    'Tires & Wheels',
    'Fluids & Chemicals',
    'General Parts & Accessories',
].map((category) => ({ value: category, label: category }));

function getReadableClassification(product = {}) {
    const category = product.category || 'General Parts & Accessories';
    const strategy = product.classification?.strategy;
    const confidence = product.classification?.confidence;

    if (strategy === 'fallback') {
        return `${category} (default category)`;
    }

    if (confidence) {
        return `${category} (${confidence} confidence)`;
    }

    return category;
}

function formatCatalogProduct(product) {
    return {
        id: product.id,
        catalogEntryId: product.catalogEntryId || product.id,
        sku: product.sku,
        name: product.name,
        model: product.model,
        category: product.category,
        sourceCategory: product.sourceCategory ?? null,
        classification: product.classification ?? null,
        price: Number(product.price ?? 0),
        stock: Number(product.stock ?? 0),
        quantity: Number(product.stock ?? 0),
        status: product.status ?? 'in_stock',
        uom: product.uom ?? 'PC',
        brand: product.brand ?? 'Mitsubishi',
        cost: Math.round(Number(product.price ?? 0) * 0.55),
        location: product.location ?? { floor: '-', section: '-', shelf: '-' },
    };
}

function normalizeLocationForDisplay(rawLocation) {
    const location = rawLocation && typeof rawLocation === 'object' ? rawLocation : {};
    const aisle = location.aisle
        ? String(location.aisle).replace(/^aisle\s+/i, '').toUpperCase()
        : '';
    const shelfNumber = location.shelfNumber ?? location.shelf_number ?? location.shelf;
    const level = location.level;
    const bin = location.bin || location.binLabel || location.slot;

    if (location.label) {
        return location.label;
    }

    if (aisle || shelfNumber || bin) {
        return [
            aisle ? `Aisle ${aisle}` : null,
            shelfNumber ? `Shelf ${shelfNumber}` : null,
            level ? `Level ${level}` : null,
            bin ? `Bin ${bin}` : null,
        ].filter(Boolean).join(' • ');
    }

    const legacy = [
        location.floor ? `F${location.floor}` : null,
        location.section ? `${location.section}` : null,
        location.shelf ? `Shelf ${location.shelf}` : null,
    ].filter(Boolean).join('-');

    return legacy || 'Unassigned';
}

const inputClassName = 'w-full rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-950 shadow-sm outline-none transition focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/15';

function buildEditProductForm(product = {}) {
    return {
        sku: product.sku || '',
        name: product.name || '',
        model: product.model || '',
        category: product.category || 'General Parts & Accessories',
        sourceCategory: product.sourceCategory || '',
        brand: product.brand || 'Mitsubishi',
        uom: product.uom || 'PC',
        status: product.status || (Number(product.quantity ?? product.stock ?? 0) <= 0 ? 'out_of_stock' : 'in_stock'),
        price: String(product.price ?? 0),
    };
}

function EditProductModal({ isOpen, product, isSaving, onClose, onSave }) {
    if (!product) {
        return null;
    }

    return (
        <EditProductModalContent
            key={product.id}
            isOpen={isOpen}
            product={product}
            isSaving={isSaving}
            onClose={onClose}
            onSave={onSave}
        />
    );
}

function EditProductModalContent({ isOpen, product, isSaving, onClose, onSave }) {
    const [form, setForm] = useState(() => buildEditProductForm(product));

    const updateForm = (field, value) => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        onSave(form);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Inventory Details"
            size="xl"
            footer={(
                <>
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
                    <Button variant="primary" type="submit" form="inventory-product-edit-form" isLoading={isSaving} leftIcon={<Edit2 className="h-4 w-4" />}>
                        Save Details
                    </Button>
                </>
            )}
        >
            <form id="inventory-product-edit-form" onSubmit={handleSubmit} className="space-y-5">
                <div className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">Current classification</p>
                    <p className="mt-1 text-sm font-semibold text-primary-950">{getReadableClassification(product)}</p>
                    <p className="mt-1 text-xs text-primary-500">Change the category below to replace internal fallback labels with a clear inventory category.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Part number</span>
                        <input className={`${inputClassName} mt-2`} value={form.sku} onChange={(event) => updateForm('sku', event.target.value)} required />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Retail price</span>
                        <input className={`${inputClassName} mt-2`} type="number" min="0" step="0.01" value={form.price} onChange={(event) => updateForm('price', event.target.value)} required />
                    </label>
                    <label className="block md:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Product name</span>
                        <input className={`${inputClassName} mt-2`} value={form.name} onChange={(event) => updateForm('name', event.target.value)} required />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Category</span>
                        <select className={`${inputClassName} mt-2`} value={form.category} onChange={(event) => updateForm('category', event.target.value)} required>
                            {INVENTORY_CATEGORY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Status</span>
                        <select className={`${inputClassName} mt-2`} value={form.status} onChange={(event) => updateForm('status', event.target.value)} required>
                            {PRODUCT_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Vehicle model</span>
                        <input className={`${inputClassName} mt-2`} value={form.model} onChange={(event) => updateForm('model', event.target.value)} placeholder="Example: MONTERO CR45" />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Source category</span>
                        <input className={`${inputClassName} mt-2`} value={form.sourceCategory} onChange={(event) => updateForm('sourceCategory', event.target.value)} placeholder="Original pricelist/category label" />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Brand</span>
                        <input className={`${inputClassName} mt-2`} value={form.brand} onChange={(event) => updateForm('brand', event.target.value)} />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Unit</span>
                        <input className={`${inputClassName} mt-2`} value={form.uom} onChange={(event) => updateForm('uom', event.target.value)} placeholder="PC" />
                    </label>
                </div>
            </form>
        </Modal>
    );
}

const InventoryList = () => {
    const navigate = useNavigate();
    const { success, error: showError } = useToast();
    const { isAdmin } = useAuth();    const findProduct = useDataStore((state) => state.findProduct);
    const [catalogSummary, setCatalogSummary] = useState(null);
    const [summaryError, setSummaryError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedStockFilter, setSelectedStockFilter] = useState('all');
    const [viewMode, setViewMode] = useState('grid');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showCameraScanner, setShowCameraScanner] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [refreshKey, setRefreshKey] = useState(0);
    const [productOverrides, setProductOverrides] = useState({});
    const [selectedPreviewProduct, setSelectedPreviewProduct] = useState(null);
    const [previewStockHistory, setPreviewStockHistory] = useState([]);
    const [previewHistoryLoading, setPreviewHistoryLoading] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [savingProductDetails, setSavingProductDetails] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: null, dir: null });
    const {
        products,
        categories: catalogCategories,
        pagination,
        loading,
        error: catalogError,
    } = useProductCatalog({
        page: currentPage,
        pageSize: PAGE_SIZE,
        searchQuery,
        selectedCategory,
        sortBy: 'name-asc',
        refreshKey,
    });

    useEffect(() => {
        let active = true;

        void (async () => {
            try {
                const [summary] = await Promise.all([
                    getCatalogSummary(),
                ]);
                if (active) {
                    setCatalogSummary(summary);
                    setSummaryError('');
                }
            } catch (loadError) {
                if (active) {
                    setSummaryError(loadError.message || 'Unable to load catalog summary.');
                }
            }
        })();

        return () => {
            active = false;
        };
    }, []);

    const refreshInventoryMeta = async () => {
        const [summary] = await Promise.all([
            getCatalogSummary(),
        ]);
        setCatalogSummary(summary);
        setSummaryError('');
    };

    const visibleProducts = useMemo(() => (
        products.map((product) => productOverrides[product.id] ?? formatCatalogProduct(product))
    ), [productOverrides, products]);

    const categories = useMemo(() => (
        catalogCategories.map((category) => ({
            value: category.value,
            label: `${category.label} (${formatNumber(category.count ?? 0)})`,
        }))
    ), [catalogCategories]);

    const stockFilters = useMemo(() => {
        const allCount = visibleProducts.length;
        const outOfStockCount = visibleProducts.filter((product) => product.quantity <= 0).length;
        const lowStockOnlyCount = visibleProducts.filter((product) => product.quantity > 0 && product.quantity <= 5).length;
        const mediumStockCount = visibleProducts.filter((product) => product.quantity >= 6 && product.quantity <= 20).length;
        const highStockCount = visibleProducts.filter((product) => product.quantity > 20).length;

        return [
            { value: 'all', label: `All Stock Levels (${allCount})` },
            { value: 'out', label: `Out of Stock (0 qty) (${outOfStockCount})` },
            { value: 'low', label: `Low Stock (1-5 qty) (${lowStockOnlyCount})` },
            { value: 'medium', label: `Medium Stock (6-20 qty) (${mediumStockCount})` },
            { value: 'high', label: `High Stock (21+ qty) (${highStockCount})` },
        ];
    }, [visibleProducts]);

    const filteredProducts = useMemo(() => (
        visibleProducts.filter((product) => {
            const matchesStock = selectedStockFilter === 'all'
                || (selectedStockFilter === 'out' && product.quantity <= 0)
                || (selectedStockFilter === 'low' && product.quantity > 0 && product.quantity <= 5)
                || (selectedStockFilter === 'medium' && product.quantity >= 6 && product.quantity <= 20)
                || (selectedStockFilter === 'high' && product.quantity > 20);
            return matchesStock;
        })
    ), [selectedStockFilter, visibleProducts]);

    const sortedProducts = useMemo(() => {
        if (!sortConfig.key || !sortConfig.dir) return filteredProducts;
        return [...filteredProducts].sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];
            if (sortConfig.key === 'price' || sortConfig.key === 'quantity') {
                aVal = Number(aVal ?? 0);
                bVal = Number(bVal ?? 0);
                return sortConfig.dir === 'asc' ? aVal - bVal : bVal - aVal;
            }
            aVal = String(aVal ?? '').toLowerCase();
            bVal = String(bVal ?? '').toLowerCase();
            if (aVal < bVal) return sortConfig.dir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.dir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredProducts, sortConfig]);
    const partNumberSuggestions = useMemo(() => getPartNumberSearchSuggestions(visibleProducts, searchQuery, 5), [searchQuery, visibleProducts]);

    const handleSort = (key) => {
        setSortConfig((current) => {
            if (current.key !== key) return { key, dir: 'asc' };
            if (current.dir === 'asc') return { key, dir: 'desc' };
            return { key: null, dir: null };
        });
    };

    const totalProducts = catalogSummary?.totalProducts ?? pagination.totalCount ?? visibleProducts.length;
    const uniqueProducts = catalogSummary?.uniqueProducts ?? pagination.totalCount ?? visibleProducts.length;
    const currentPrices = catalogSummary?.currentPrices ?? pagination.totalCount ?? visibleProducts.length;
    const lowStockCount = filteredProducts.filter((product) => product.quantity <= 5).length;
    const totalValue = filteredProducts.reduce((sum, product) => sum + (product.price * product.quantity), 0);
    const canGoPrev = (pagination.page ?? currentPage) > 1;
    const canGoNext = (pagination.page ?? currentPage) < (pagination.totalPages ?? 1);
    const rangeStart = pagination.totalCount === 0 ? 0 : (((pagination.page ?? currentPage) - 1) * (pagination.pageSize ?? PAGE_SIZE)) + 1;
    const rangeEnd = pagination.totalCount === 0 ? 0 : Math.min((pagination.page ?? currentPage) * (pagination.pageSize ?? PAGE_SIZE), pagination.totalCount ?? 0);

    const openPreview = (product) => {
        if (!product) {
            return;
        }

        const normalizedProduct = productOverrides[product.id] ?? formatCatalogProduct(product);
        setSelectedPreviewProduct(normalizedProduct);
        setPreviewStockHistory([]);
        setPreviewHistoryLoading(true);

        void (async () => {
            try {
                setPreviewStockHistory(await getProductStockHistory(normalizedProduct.id, 30));
            } catch (historyError) {
                showError(historyError.message || 'Unable to load stock movement history.');
            } finally {
                setPreviewHistoryLoading(false);
            }
        })();
    };

    const handleSearchQueryChange = (value) => {
        setSearchQuery(value);
        setCurrentPage(1);
    };

    const handleCategoryChange = (value) => {
        setSelectedCategory(value);
        setCurrentPage(1);
    };

    const handleStockFilterChange = (value) => {
        setSelectedStockFilter(value);
        setCurrentPage(1);
    };

    const openEditProduct = (product) => {
        setEditingProduct(productOverrides[product.id] ?? formatCatalogProduct(product));
    };

    const handleLocateIn3D = (product) => {
        if (!product) {
            return;
        }

        const normalizedProduct = productOverrides[product.id] ?? formatCatalogProduct(product);

        setSelectedPreviewProduct(null);
        navigate(buildLocator3DUrl(normalizedProduct));
    };

    const handleSaveProductDetails = async (form) => {
        if (!editingProduct?.id) {
            return;
        }

        setSavingProductDetails(true);
        try {
            const updatedProduct = await updateCatalogProduct(editingProduct.id, {
                ...form,
                price: Number(form.price ?? 0),
                stock: editingProduct.quantity ?? editingProduct.stock ?? 0,
            });
            const normalizedProduct = {
                ...editingProduct,
                ...formatCatalogProduct({
                    ...updatedProduct,
                    stock: editingProduct.quantity ?? editingProduct.stock ?? updatedProduct?.stock ?? 0,
                    location: editingProduct.location,
                }),
            };

            setProductOverrides((current) => ({
                ...current,
                [editingProduct.id]: normalizedProduct,
            }));
            setSelectedPreviewProduct((current) => (current?.id === editingProduct.id ? normalizedProduct : current));
            setEditingProduct(null);
            setRefreshKey((value) => value + 1);
            success('Inventory details updated successfully.');
        } catch (saveError) {
            showError(saveError.message || 'Unable to update inventory details.');
        } finally {
            setSavingProductDetails(false);
        }
    };
    const lookupAndPreviewProduct = async (identifier) => {
        const trimmedIdentifier = String(identifier || '').trim();
        if (!trimmedIdentifier) {
            return;
        }

        const visibleMatch = visibleProducts.find((product) => productMatchesIdentifier(product, trimmedIdentifier));

        if (visibleMatch) {
            openPreview(visibleMatch);
            return visibleMatch;
        }

        const product = await findProduct(trimmedIdentifier);
        if (product) {
            openPreview(product);
            return product;
        }

        showError(`No inventory item matched ${trimmedIdentifier}.`);
        return null;
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-display text-primary-950 tracking-tight">Inventory</h1>
                    <p className="text-sm text-primary-500 mt-0.5">Manage stock levels and product inventory</p>
                </div>
                <Link
                    to="/inventory/logs"
                    className="flex-shrink-0 inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 shadow-sm hover:border-accent-blue hover:text-accent-blue transition-colors"
                >
                    <ClipboardList className="w-4 h-4" />
                    View Logs
                </Link>
            </div>

            {/* KPI Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-primary-200 border-l-4 border-l-accent-info rounded-2xl p-5 shadow-sm flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent-info/10 flex items-center justify-center">
                        <Package className="w-6 h-6 text-accent-info" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500 mb-0.5">Total Products</p>
                        <p className="text-2xl font-bold font-display text-primary-950 leading-none">{formatNumber(totalProducts)}</p>
                        <p className="text-xs text-primary-400 mt-1">{formatNumber(uniqueProducts)} unique part numbers loaded</p>
                    </div>
                </div>

                <div className="bg-white border border-primary-200 border-l-4 border-l-accent-success rounded-2xl p-5 shadow-sm flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent-success/10 flex items-center justify-center">
                        <Package className="w-6 h-6 text-accent-success" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500 mb-0.5">In Stock</p>
                        <p className="text-2xl font-bold font-display text-primary-950 leading-none">{lowStockCount}</p>
                        <p className="text-xs text-primary-400 mt-1">{formatNumber(currentPrices)} current price rows active</p>
                    </div>
                </div>

                <div className="bg-white border border-primary-200 border-l-4 border-l-accent-success rounded-2xl p-5 shadow-sm flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent-success/10 flex items-center justify-center">
                        <Package className="w-6 h-6 text-accent-success" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500 mb-0.5">Inventory Value</p>
                        <p className="text-2xl font-bold font-display text-primary-950 leading-none">{formatCurrency(totalValue)}</p>
                        {summaryError
                            ? <p className="text-xs text-accent-danger mt-1">{summaryError}</p>
                            : <p className="text-xs text-primary-400 mt-1">Visible on-page total</p>
                        }
                    </div>
                </div>
            </div>

            {/* Toolbar */}

            <div className="flex flex-wrap gap-2 items-center">
                {/* Search + Camera */}
                <div className="relative flex gap-2 flex-1 min-w-[200px] max-w-xs">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                        <input
                            type="text"
                            placeholder="Search part number, product, or scan barcode..."
                            value={searchQuery}
                            onChange={(event) => handleSearchQueryChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    void lookupAndPreviewProduct(searchQuery);
                                }
                            }}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-primary-200 rounded-xl text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 shadow-sm text-sm"
                        />
                        {searchQuery.trim() && partNumberSuggestions.length > 0 && (
                            <div className="absolute z-20 mt-2 max-h-48 w-full overflow-y-auto rounded-xl border border-primary-200 bg-white py-1 shadow-lg">
                                {partNumberSuggestions.map((product) => (
                                    <button
                                        key={product.catalogEntryId || product.id}
                                        type="button"
                                        onClick={() => {
                                            const partNumber = getProductPartNumber(product);
                                            handleSearchQueryChange(partNumber);
                                            openPreview(product);
                                        }}
                                        className="flex w-full flex-col px-3 py-2 text-left transition hover:bg-primary-50"
                                    >
                                        <span className="truncate text-sm font-semibold text-primary-950">{product.name}</span>
                                        <span className="font-mono text-xs text-primary-500">{getProductPartNumber(product) || 'No part number'} · Stock: {formatNumber(product.quantity ?? product.stock ?? 0)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <Button
                        variant="secondary"
                        className="px-3 flex-shrink-0"
                        onClick={() => setShowCameraScanner(true)}
                        title="Scan Barcode with Camera"
                    >
                        <Camera className="w-4 h-4 text-primary-600" />
                    </Button>
                </div>

                {/* Category dropdown — fixed width, never grows */}
                <div className="flex-shrink-0 w-44">
                    <Dropdown
                        options={categories}
                        value={selectedCategory}
                        onChange={handleCategoryChange}
                    />
                </div>

                {/* Stock level dropdown — fixed width, never grows */}
                <div className="flex-shrink-0 w-48">
                    <Dropdown
                        options={stockFilters}
                        value={selectedStockFilter}
                        onChange={handleStockFilterChange}
                    />
                </div>

                {/* Right actions — pushed to the end */}
                <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                    {isAdmin && (
                        <PriceListManager onUpdated={async () => {
                            setRefreshKey((value) => value + 1);
                            try {
                                await refreshInventoryMeta();
                            } catch (loadError) {
                                setSummaryError(loadError.message || 'Unable to refresh catalog summary.');
                            }
                        }} />
                    )}

                    <div className="hidden items-center border border-primary-200 rounded-xl bg-primary-50 p-1 sm:flex gap-0.5">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`min-h-9 min-w-9 rounded-lg p-2 transition-all duration-150 ${viewMode === 'grid' ? 'bg-white text-accent-primary shadow-sm border border-primary-200' : 'text-primary-400 hover:text-primary-700'}`}
                            aria-label="Show inventory as cards"
                        >
                            <Grid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`min-h-9 min-w-9 rounded-lg p-2 transition-all duration-150 ${viewMode === 'list' ? 'bg-white text-accent-primary shadow-sm border border-primary-200' : 'text-primary-400 hover:text-primary-700'}`}
                            aria-label="Show inventory as table"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    <Button
                        variant="primary"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowAddModal(true)}
                        className="whitespace-nowrap"
                    >
                        Add Stock
                    </Button>
                </div>
            </div>

            {loading ? (
                <Card className="text-center py-12">
                    <Package className="w-12 h-12 text-primary-400 mx-auto mb-4 animate-pulse" />
                    <h3 className="text-lg font-semibold text-primary-300 mb-2">Connecting to Supabase...</h3>
                    <p className="text-primary-500">Fetching live inventory data</p>
                </Card>
            ) : catalogError ? (
                <Card className="text-center py-12">
                    <AlertTriangle className="w-12 h-12 text-accent-danger mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-primary-900 mb-2">Database catalog unavailable</h3>
                    <p className="text-primary-500 font-medium">{catalogError}</p>
                </Card>
            ) : filteredProducts.length === 0 ? (
                <Card className="text-center py-12">
                    <Package className="w-12 h-12 text-primary-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-primary-900 mb-2">No products found</h3>
                    <p className="text-primary-500 font-medium">Try adjusting your search or filter criteria</p>
                </Card>
            ) : viewMode === 'grid' ? (
                <Motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                    {filteredProducts.map((product) => (
                        <ProductCard
                            key={product.catalogEntryId || product.id}
                            product={product}
                            onEdit={isAdmin ? openEditProduct : null}
                            onSelect={openPreview}
                        />
                    ))}
                </Motion.div>
            ) : (
                <Card padding="none">
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    {[{ key: 'name', label: 'Product', align: 'left' }, { key: 'sku', label: 'Part Number', align: 'left' }, { key: 'category', label: 'Category', align: 'left' }, { key: 'price', label: 'Price', align: 'right' }, { key: 'quantity', label: 'Qty', align: 'right' }].map(({ key, label, align }) => (
                                        <th key={key} className={`cursor-pointer select-none ${align === 'right' ? 'text-right' : 'text-left'}`}>
                                            <button
                                                type="button"
                                                onClick={() => handleSort(key)}
                                                className={`inline-flex items-center gap-1 group font-bold uppercase tracking-[0.12em] text-xs transition-colors ${
                                                    sortConfig.key === key ? 'text-accent-blue' : 'text-primary-400 hover:text-primary-700'
                                                } ${align === 'right' ? 'flex-row-reverse' : ''}`}
                                            >
                                                {label}
                                                <span className="flex flex-col opacity-60">
                                                    <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 transition-opacity ${
                                                        sortConfig.key === key && sortConfig.dir === 'asc' ? 'opacity-100 text-accent-blue' : 'opacity-30'
                                                    }`} />
                                                    <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 transition-opacity ${
                                                        sortConfig.key === key && sortConfig.dir === 'desc' ? 'opacity-100 text-accent-blue' : 'opacity-30'
                                                    }`} />
                                                </span>
                                            </button>
                                        </th>
                                    ))}
                                    <th className="text-left text-xs font-bold uppercase tracking-[0.12em] text-primary-400">Status</th>
                                    <th className="text-left text-xs font-bold uppercase tracking-[0.12em] text-primary-400">Location</th>
                                    {isAdmin && <th className="text-left text-xs font-bold uppercase tracking-[0.12em] text-primary-400">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedProducts.map((product) => (
                                    <tr
                                        key={product.catalogEntryId || product.id}
                                        className="cursor-pointer hover:bg-primary-50 transition-colors"
                                        onClick={() => openPreview(product)}
                                    >
                                        <td className="font-bold text-primary-950 border-b border-primary-100 py-3">{product.name}</td>
                                        <td className="font-mono text-sm text-primary-500 border-b border-primary-100 py-3">{getProductPartNumber(product)}</td>
                                        <td className="border-b border-primary-100 py-3 text-primary-700">{product.category}</td>
                                        <td className="text-right border-b border-primary-100 py-3 font-semibold text-accent-blue">{formatCurrency(product.price)}</td>
                                        <td className="text-right border-b border-primary-100 py-3 text-primary-900 font-bold">{product.quantity}</td>
                                        <td className="border-b border-primary-100 py-3"><StockBadge quantity={product.quantity} /></td>
                                        <td className="border-b border-primary-100 py-3">
                                            <button
                                                type="button"
                                                className="rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1.5 text-xs font-bold text-accent-blue transition hover:border-accent-blue/50 hover:bg-accent-blue/15"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    openPreview(product);
                                                }}
                                            >
                                                {normalizeLocationForDisplay(product.location)}
                                            </button>
                                        </td>
                                        {isAdmin && (
                                            <td className="border-b border-primary-100 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    leftIcon={<Edit2 className="h-4 w-4" />}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        openEditProduct(product);
                                                    }}
                                                >
                                                    Edit
                                                </Button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {!loading && !catalogError && pagination.totalPages > 1 && (
                <Card padding="sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-primary-600">
                            Showing <span className="font-semibold text-primary-950">{rangeStart}-{rangeEnd}</span> of <span className="font-semibold text-primary-950">{formatNumber(pagination.totalCount ?? 0)}</span> products
                        </p>
                        <div className="flex w-full flex-col gap-2 min-[420px]:flex-row sm:w-auto sm:items-center">
                            <Button
                                variant="secondary"
                                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                                disabled={!canGoPrev}
                                leftIcon={<ChevronLeft className="h-4 w-4" />}
                                className="w-full min-[420px]:w-auto"
                            >
                                Previous
                            </Button>
                            <span className="min-w-[108px] text-center text-sm font-semibold text-primary-700">
                                Page {pagination.page ?? currentPage} of {pagination.totalPages ?? 1}
                            </span>
                            <Button
                                variant="secondary"
                                onClick={() => setCurrentPage((page) => Math.min(page + 1, pagination.totalPages ?? page))}
                                disabled={!canGoNext}
                                rightIcon={<ChevronRight className="h-4 w-4" />}
                                className="w-full min-[420px]:w-auto"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            <AddStockModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSave={async ({ product, quantity, supplierName, supplierContact, supplierAddress, referenceNumber, receivedDate, reason, _bulkMode }) => {
                    const result = await receiveInventoryStock({
                        productId: product.id,
                        quantity,
                        supplierName,
                        supplierContact,
                        supplierAddress,
                        referenceNumber,
                        receivedDate,
                        reason,
                    });
                    const updatedProduct = {
                        ...product,
                        stock: result.updatedStock,
                        quantity: result.updatedStock,
                    };
                    setProductOverrides((current) => ({
                        ...current,
                        [updatedProduct.id]: updatedProduct,
                    }));
                    // In bulk mode the modal manages its own UI
                    if (_bulkMode) {
                        setRefreshKey((value) => value + 1);
                        return;
                    }
                    setRefreshKey((value) => value + 1);
                    await refreshInventoryMeta();
                    success(`Received ${formatNumber(result.quantityAdded)} units. ${updatedProduct.name} now has ${formatNumber(result.updatedStock)} units.`);
                    setShowAddModal(false);
                }}

            />


            <CameraScannerModal
                isOpen={showCameraScanner}
                onClose={() => setShowCameraScanner(false)}
                onScan={async (barcode) => {
                    if (barcode) {
                        handleSearchQueryChange(barcode);
                        success(`Scanned: ${barcode}`);
                        const matchedProduct = await lookupAndPreviewProduct(barcode);
                        if (matchedProduct) {
                            handleSearchQueryChange(getProductPartNumber(matchedProduct));
                        }
                    }
                }}
            />

            <ProductLabelPreviewModal
                isOpen={Boolean(selectedPreviewProduct)}
                onClose={() => setSelectedPreviewProduct(null)}
                product={selectedPreviewProduct}
                title="Inventory Activity"
                stockHistory={previewStockHistory}
                historyLoading={previewHistoryLoading}
                locationEditAction={null}
                locateAction={selectedPreviewProduct ? {
                    label: 'Locate in 3D',
                    onClick: () => handleLocateIn3D(selectedPreviewProduct),
                } : null}
                editAction={isAdmin ? {
                    label: 'Edit Details',
                    icon: <Edit2 className="h-4 w-4" />,
                    onClick: () => {
                        if (selectedPreviewProduct) {
                            openEditProduct(selectedPreviewProduct);
                        }
                    },
                } : null}
            />

            <EditProductModal
                isOpen={Boolean(editingProduct)}
                product={editingProduct}
                isSaving={savingProductDetails}
                onClose={() => setEditingProduct(null)}
                onSave={handleSaveProductDetails}
            />
        </div>
    );
};

export default InventoryList;


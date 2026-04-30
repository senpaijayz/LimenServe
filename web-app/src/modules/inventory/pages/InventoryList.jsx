import { useEffect, useMemo, useState } from 'react';
import { motion as Motion } from 'framer-motion';
import { Search, Plus, Grid, List, Package, AlertTriangle, Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { StockBadge } from '../../../components/ui/Badge';
import Dropdown from '../../../components/ui/Dropdown';
import ProductCard from '../components/ProductCard';
import AddStockModal from '../components/AddStockModal';
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import { useAuth } from '../../../context/useAuth';
import PriceListManager from '../components/PriceListManager';
import ProductLabelPreviewModal from '../components/ProductLabelPreviewModal';
import { getCatalogSummary } from '../../../services/catalogApi';
import useProductCatalog from '../../../hooks/useProductCatalog';
import useDataStore from '../../../store/useDataStore';
import { productMatchesIdentifier } from '../../../utils/barcode';

const PAGE_SIZE = 12;

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

const InventoryList = () => {
    const { success, error: showError } = useToast();
    const { isAdmin } = useAuth();
    const findProduct = useDataStore((state) => state.findProduct);
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
                const summary = await getCatalogSummary();
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

        setSelectedPreviewProduct(productOverrides[product.id] ?? formatCatalogProduct(product));
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-info/20">
                        <Package className="w-6 h-6 text-accent-info" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-950">{formatNumber(totalProducts)}</p>
                        <p className="text-sm text-primary-600">Total Products</p>
                        <p className="text-xs text-primary-500">{formatNumber(uniqueProducts)} unique SKUs loaded</p>
                    </div>
                </Card>

                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-warning/20">
                        <AlertTriangle className="w-6 h-6 text-accent-warning" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-950">{lowStockCount}</p>
                        <p className="text-sm text-primary-600">Visible Low Stock</p>
                        <p className="text-xs text-primary-500">{formatNumber(currentPrices)} current price rows active</p>
                    </div>
                </Card>

                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-success/20">
                        <Package className="w-6 h-6 text-accent-success" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-950">{formatCurrency(totalValue)}</p>
                        <p className="text-sm text-primary-600">Visible Inventory Value</p>
                        {summaryError && <p className="text-xs text-accent-danger">{summaryError}</p>}
                    </div>
                </Card>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex flex-col lg:flex-row gap-3 flex-1 w-full sm:w-auto">
                    <div className="relative flex w-full flex-1 gap-2 lg:max-w-md">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                            <input
                                type="text"
                                placeholder="Search products or scan barcode..."
                                value={searchQuery}
                                onChange={(event) => handleSearchQueryChange(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        void lookupAndPreviewProduct(searchQuery);
                                    }
                                }}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-primary-200 rounded-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm"
                            />
                        </div>
                        <Button
                            variant="secondary"
                            className="px-3 py-2 h-auto"
                            onClick={() => setShowCameraScanner(true)}
                            title="Scan Barcode with Camera"
                        >
                            <Camera className="w-5 h-5 text-primary-600" />
                        </Button>
                    </div>

                    <Dropdown
                        options={categories}
                        value={selectedCategory}
                        onChange={handleCategoryChange}
                        className="w-full sm:w-56"
                    />

                    <Dropdown
                        options={stockFilters}
                        value={selectedStockFilter}
                        onChange={handleStockFilterChange}
                        className="w-full sm:w-64"
                    />
                </div>

                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    {isAdmin && (
                        <PriceListManager onUpdated={async () => {
                            setRefreshKey((value) => value + 1);
                            try {
                                const summary = await getCatalogSummary();
                                setCatalogSummary(summary);
                                setSummaryError('');
                            } catch (loadError) {
                                setSummaryError(loadError.message || 'Unable to refresh catalog summary.');
                            }
                        }} />
                    )}

                    <div className="hidden items-center glass rounded-lg p-1 sm:flex">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`min-h-10 min-w-10 rounded-md p-2 transition-colors ${viewMode === 'grid' ? 'bg-accent-primary text-white' : 'text-primary-400 hover:text-primary-100'}`}
                            aria-label="Show inventory as cards"
                        >
                            <Grid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`min-h-10 min-w-10 rounded-md p-2 transition-colors ${viewMode === 'list' ? 'bg-accent-primary text-white' : 'text-primary-400 hover:text-primary-100'}`}
                            aria-label="Show inventory as table"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    <Button
                        variant="primary"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowAddModal(true)}
                        className="w-full sm:w-auto"
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
                                    <th>Product</th>
                                    <th>SKU</th>
                                    <th>Category</th>
                                    <th className="text-right">Price</th>
                                    <th className="text-right">Qty</th>
                                    <th>Status</th>
                                    <th>Location</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.map((product) => (
                                    <tr
                                        key={product.catalogEntryId || product.id}
                                        className="cursor-pointer hover:bg-primary-50 transition-colors"
                                        onClick={() => openPreview(product)}
                                    >
                                        <td className="font-bold text-primary-950 border-b border-primary-100 py-3">{product.name}</td>
                                        <td className="font-mono text-sm text-primary-500 border-b border-primary-100 py-3">{product.sku}</td>
                                        <td className="border-b border-primary-100 py-3 text-primary-700">{product.category}</td>
                                        <td className="text-right border-b border-primary-100 py-3 font-semibold text-accent-blue">{formatCurrency(product.price)}</td>
                                        <td className="text-right border-b border-primary-100 py-3 text-primary-900 font-bold">{product.quantity}</td>
                                        <td className="border-b border-primary-100 py-3"><StockBadge quantity={product.quantity} /></td>
                                        <td className="text-primary-500 border-b border-primary-100 py-3 font-medium">
                                            F{product.location.floor}-{product.location.section}{product.location.shelf}
                                        </td>
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
                onSave={(updatedProduct) => {
                    setProductOverrides((current) => ({
                        ...current,
                        [updatedProduct.id]: updatedProduct,
                    }));
                    success(`Added stock! ${updatedProduct.name} now has ${updatedProduct.quantity} units.`);
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
                        if (matchedProduct?.sku) {
                            handleSearchQueryChange(matchedProduct.sku);
                        }
                    }
                }}
            />

            <ProductLabelPreviewModal
                isOpen={Boolean(selectedPreviewProduct)}
                onClose={() => setSelectedPreviewProduct(null)}
                product={selectedPreviewProduct}
                title="Inventory Label Preview"
            />
        </div>
    );
};

export default InventoryList;

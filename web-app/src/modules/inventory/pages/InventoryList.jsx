import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, Grid, List, Package, AlertTriangle, Camera } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { StockBadge } from '../../../components/ui/Badge';
import Dropdown from '../../../components/ui/Dropdown';
import ProductCard from '../components/ProductCard';
import AddStockModal from '../components/AddStockModal';
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import useDataStore from '../../../store/useDataStore';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import { useAuth } from '../../../context/useAuth';
import PriceListManager from '../components/PriceListManager';
import { getCatalogSummary } from '../../../services/catalogApi';

const InventoryList = () => {
    const { success } = useToast();
    const { isAdmin } = useAuth();
    const {
        products: storeProducts,
        loading,
        error,
        updateProduct,
        fetchProducts,
        hasLoadedProducts,
    } = useDataStore();
    const [catalogSummary, setCatalogSummary] = useState(null);
    const [summaryError, setSummaryError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedStockFilter, setSelectedStockFilter] = useState('all');
    const [viewMode, setViewMode] = useState('grid');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showCameraScanner, setShowCameraScanner] = useState(false);

    useEffect(() => {
        if (!hasLoadedProducts && !loading) {
            void fetchProducts();
        }
    }, [fetchProducts, hasLoadedProducts, loading]);

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

    const categoryCounts = useMemo(() => (
        storeProducts.reduce((map, product) => {
            const key = product.category?.toLowerCase();
            if (!key) {
                return map;
            }

            map.set(key, (map.get(key) ?? 0) + 1);
            return map;
        }, new Map())
    ), [storeProducts]);

    const categories = useMemo(() => ([
        { value: 'all', label: `All Categories (${storeProducts.length})` },
        ...Array.from(categoryCounts.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([value, count]) => ({
                value,
                label: `${storeProducts.find((product) => product.category?.toLowerCase() === value)?.category || value} (${count})`,
            })),
    ]), [categoryCounts, storeProducts]);

    const stockFilters = useMemo(() => {
        const allCount = storeProducts.length;
        const outOfStockCount = storeProducts.filter((product) => product.quantity <= 0).length;
        const lowStockOnlyCount = storeProducts.filter((product) => product.quantity > 0 && product.quantity <= 5).length;
        const mediumStockCount = storeProducts.filter((product) => product.quantity >= 6 && product.quantity <= 20).length;
        const highStockCount = storeProducts.filter((product) => product.quantity > 20).length;

        return [
            { value: 'all', label: `All Stock Levels (${allCount})` },
            { value: 'out', label: `Out of Stock (0 qty) (${outOfStockCount})` },
            { value: 'low', label: `Low Stock (1-5 qty) (${lowStockOnlyCount})` },
            { value: 'medium', label: `Medium Stock (6-20 qty) (${mediumStockCount})` },
            { value: 'high', label: `High Stock (21+ qty) (${highStockCount})` },
        ];
    }, [storeProducts]);

    const filteredProducts = storeProducts.filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase())
            || product.sku.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'all'
            || product.category.toLowerCase() === selectedCategory.toLowerCase();
        const matchesStock = selectedStockFilter === 'all'
            || (selectedStockFilter === 'out' && product.quantity <= 0)
            || (selectedStockFilter === 'low' && product.quantity > 0 && product.quantity <= 5)
            || (selectedStockFilter === 'medium' && product.quantity >= 6 && product.quantity <= 20)
            || (selectedStockFilter === 'high' && product.quantity > 20);
        return matchesSearch && matchesCategory && matchesStock;
    });

    const totalProducts = catalogSummary?.totalProducts ?? storeProducts.length;
    const uniqueProducts = catalogSummary?.uniqueProducts ?? storeProducts.length;
    const currentPrices = catalogSummary?.currentPrices ?? storeProducts.length;
    const lowStockCount = storeProducts.filter((product) => product.quantity <= 5).length;
    const totalValue = storeProducts.reduce((sum, product) => sum + (product.price * product.quantity), 0);

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
                        <p className="text-sm text-primary-600">Low Stock Items</p>
                        <p className="text-xs text-primary-500">{formatNumber(currentPrices)} current price rows active</p>
                    </div>
                </Card>

                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-success/20">
                        <Package className="w-6 h-6 text-accent-success" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-950">{formatCurrency(totalValue)}</p>
                        <p className="text-sm text-primary-600">Total Inventory Value</p>
                        {summaryError && <p className="text-xs text-accent-danger">{summaryError}</p>}
                    </div>
                </Card>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex flex-col lg:flex-row gap-3 flex-1 w-full sm:w-auto">
                    <div className="relative flex-1 max-w-md flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                            <input
                                type="text"
                                placeholder="Search products or scan barcode..."
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
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
                        onChange={setSelectedCategory}
                        className="w-full sm:w-56"
                    />

                    <Dropdown
                        options={stockFilters}
                        value={selectedStockFilter}
                        onChange={setSelectedStockFilter}
                        className="w-full sm:w-64"
                    />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {isAdmin && (
                        <PriceListManager onUpdated={async () => {
                            await fetchProducts({ force: true });
                            try {
                                const summary = await getCatalogSummary();
                                setCatalogSummary(summary);
                                setSummaryError('');
                            } catch (loadError) {
                                setSummaryError(loadError.message || 'Unable to refresh catalog summary.');
                            }
                        }} />
                    )}

                    <div className="flex items-center glass rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-accent-primary text-white' : 'text-primary-400 hover:text-primary-100'}`}
                        >
                            <Grid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-accent-primary text-white' : 'text-primary-400 hover:text-primary-100'}`}
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    <Button
                        variant="primary"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowAddModal(true)}
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
            ) : error ? (
                <Card className="text-center py-12">
                    <AlertTriangle className="w-12 h-12 text-accent-danger mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-primary-900 mb-2">Database catalog unavailable</h3>
                    <p className="text-primary-500 font-medium">{error}</p>
                </Card>
            ) : filteredProducts.length === 0 ? (
                <Card className="text-center py-12">
                    <Package className="w-12 h-12 text-primary-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-primary-900 mb-2">No products found</h3>
                    <p className="text-primary-500 font-medium">Try adjusting your search or filter criteria</p>
                </Card>
            ) : viewMode === 'grid' ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                    {filteredProducts.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </motion.div>
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
                                    <tr key={product.id} className="cursor-pointer hover:bg-primary-50 transition-colors">
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

            <AddStockModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSave={(updatedProduct) => {
                    updateProduct(updatedProduct.id, updatedProduct);
                    success(`Added stock! ${updatedProduct.name} now has ${updatedProduct.quantity} units.`);
                    setShowAddModal(false);
                }}
            />

            <CameraScannerModal
                isOpen={showCameraScanner}
                onClose={() => setShowCameraScanner(false)}
                onScan={(barcode) => {
                    if (barcode) {
                        setSearchQuery(barcode);
                        success(`Scanned: ${barcode}`);
                    }
                }}
            />
        </div>
    );
};

export default InventoryList;

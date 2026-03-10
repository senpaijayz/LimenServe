import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, Filter, Grid, List, Package, AlertTriangle } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import { StockBadge } from '../../../components/ui/Badge';
import Dropdown from '../../../components/ui/Dropdown';
import ProductCard from '../components/ProductCard';
import AddStockModal from '../components/AddStockModal';
import { formatCurrency } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import { PRODUCT_CATEGORIES, TOTAL_CATALOG_SIZE } from '../../../data/productData';
import useDataStore from '../../../store/useDataStore';
import { Camera } from 'lucide-react';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';

const categories = [
    { value: 'all', label: 'All Categories' },
    ...PRODUCT_CATEGORIES.map(c => ({ value: c.toLowerCase(), label: c })),
];

/**
 * Inventory List Page
 * Main inventory management view with search, filter, and product cards
 */
const InventoryList = () => {
    const { success } = useToast();
    const { products: storeProducts, loading, updateProduct } = useDataStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
    const [showAddModal, setShowAddModal] = useState(false);
    const [showCameraScanner, setShowCameraScanner] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    // Filter products
    const filteredProducts = storeProducts.filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            product.sku.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'all' ||
            product.category.toLowerCase() === selectedCategory.toLowerCase();
        return matchesSearch && matchesCategory;
    });

    // Calculate stats
    const totalProducts = storeProducts.length;
    const lowStockCount = storeProducts.filter(p => p.quantity <= 5).length;
    const totalValue = storeProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0);

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-info/20">
                        <Package className="w-6 h-6 text-accent-info" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-950">{totalProducts}</p>
                        <p className="text-sm text-primary-600">Total Products</p>
                    </div>
                </Card>

                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-warning/20">
                        <AlertTriangle className="w-6 h-6 text-accent-warning" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-950">{lowStockCount}</p>
                        <p className="text-sm text-primary-600">Low Stock Items</p>
                    </div>
                </Card>

                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-success/20">
                        <Package className="w-6 h-6 text-accent-success" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-950">{formatCurrency(totalValue)}</p>
                        <p className="text-sm text-primary-600">Total Inventory Value</p>
                    </div>
                </Card>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                            <input
                                type="text"
                                placeholder="Search products or scan barcode..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
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

                    {/* Category Filter */}
                    <Dropdown
                        options={categories}
                        value={selectedCategory}
                        onChange={setSelectedCategory}
                        className="w-full sm:w-48"
                    />
                </div>

                <div className="flex items-center gap-2">
                    {/* View Toggle */}
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

                    {/* Add Stock Button */}
                    <Button
                        variant="primary"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowAddModal(true)}
                    >
                        Add Stock
                    </Button>
                </div>
            </div>

            {/* Products Grid/List */}
            {loading ? (
                <Card className="text-center py-12">
                    <Package className="w-12 h-12 text-primary-400 mx-auto mb-4 animate-pulse" />
                    <h3 className="text-lg font-semibold text-primary-300 mb-2">Connecting to Supabase...</h3>
                    <p className="text-primary-500">Fetching live inventory data</p>
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

            {/* Add Stock Modal */}
            <AddStockModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSave={(updatedProduct) => {
                    updateProduct(updatedProduct.id, updatedProduct);
                    success(`Added stock! ${updatedProduct.name} now has ${updatedProduct.quantity} units.`);
                    setShowAddModal(false);
                }}
            />
            {/* Camera Scanner Modal */}
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

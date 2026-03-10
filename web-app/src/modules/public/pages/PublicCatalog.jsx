import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Package, ShoppingCart, ChevronRight, X, LayoutGrid, Check, Award } from 'lucide-react';
import { Link } from 'react-router-dom';
import Barcode from 'react-barcode';
import { formatCurrency } from '../../../utils/formatters';
import { PRODUCT_CATEGORIES } from '../../../data/productData';
import useDataStore from '../../../store/useDataStore';

const GenuinePartsLabel = ({ product, compact = false }) => {
    const labelHeight = compact ? 'h-56' : 'h-full min-h-[300px]';
    const barcodeWidth = compact ? 1.45 : 1.7;
    const barcodeHeight = compact ? 48 : 68;
    const skuTextSize = compact ? 'text-[1.95rem]' : 'text-[2.4rem]';
    const headerLabelSize = compact ? 'text-[8px]' : 'text-[10px]';

    return (
        <div className={`${labelHeight} bg-[#f7f7f5] rounded-[1.35rem] border-2 border-primary-200 flex flex-col relative overflow-hidden shadow-[0_14px_34px_rgba(17,18,22,0.08)]`}>
            <div className="h-10 bg-[#17181c] flex items-center justify-between px-4 w-full shrink-0">
                <div className="flex items-center gap-2">
                    <div className="relative w-5 h-4 flex items-center justify-center">
                        <div className="absolute w-[7px] h-[7px] bg-[#e60012] rotate-45 -top-[1px]" />
                        <div className="absolute w-[7px] h-[7px] bg-[#e60012] rotate-45 -left-[5px] top-[3px]" />
                        <div className="absolute w-[7px] h-[7px] bg-[#e60012] rotate-45 -right-[5px] top-[3px]" />
                    </div>
                    <span className={`${headerLabelSize} font-bold text-white leading-tight uppercase tracking-[0.18em]`}>
                        Mitsubishi
                        <br />
                        Motors
                    </span>
                </div>
                <span className="text-[10px] font-bold text-white tracking-[0.28em] uppercase">Genuine Parts</span>
                <span className="text-[9px] font-bold text-white">R</span>
            </div>

            <div className="flex justify-between items-start px-4 pt-4">
                <span className="text-[12px] text-primary-700 font-bold uppercase tracking-wide line-clamp-2">
                    {product.name}
                </span>
            </div>

            <div className="px-4 pt-3 text-center">
                <span className={`${skuTextSize} font-semibold tracking-[0.18em] text-primary-900 leading-none`}>
                    {product.sku || 'UNKNOWN'}
                </span>
            </div>

            <div className="flex-1 px-4 pt-5 pb-4 flex items-center justify-center">
                <div className="w-full bg-transparent px-1 py-2 flex justify-center overflow-hidden">
                    <Barcode
                        value={product.sku || 'UNKNOWN'}
                        format="CODE128"
                        width={barcodeWidth}
                        height={barcodeHeight}
                        fontSize={0}
                        margin={0}
                        displayValue={false}
                        background="transparent"
                        lineColor="#111216"
                    />
                </div>
            </div>
        </div>
    );
};

/**
 * Modern Public Catalog (Inventory) Page
 */
const PublicCatalog = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const { products: storeProducts, loading } = useDataStore();

    // Map store products
    const catalogProducts = storeProducts.map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        price: p.price,
        inStock: p.quantity > 0,
        model: p.model || 'Universal',
        compatibility: [p.model || 'Universal'],
        description: `Genuine Mitsubishi ${p.name} for ${p.model || 'Universal'}. Engineered for exact fitment.`,
    }));

    // Generate dynamic categories map with counts
    const categories = [
        { value: 'all', label: 'All Categories', count: catalogProducts.length },
        ...PRODUCT_CATEGORIES.map(cat => ({
            value: cat,
            label: cat,
            count: catalogProducts.filter(p => p.category === cat).length,
        })).filter(c => c.count > 0),
    ];

    const filteredProducts = catalogProducts.filter((product) => {
        const matchesSearch =
            product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
            product.model.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="bg-primary-50 min-h-screen relative font-sans text-primary-900">
            {/* Atmospheric Background - Light & Clean */}
            <div className="absolute top-0 right-0 w-full h-[60vh] bg-gradient-to-b from-white via-primary-50 to-primary-50 -z-10" />
            <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] bg-accent-blue/10 rounded-full blur-[150px] mix-blend-multiply -z-10 pointer-events-none opacity-60" />
            <div className="absolute top-[20%] left-[-10%] w-[40vw] h-[40vw] bg-accent-danger/5 rounded-full blur-[120px] mix-blend-multiply -z-10 pointer-events-none opacity-50" />

            {/* Header Content */}
            <section className="relative pt-32 pb-16 px-4 md:px-8 xl:px-12 z-20 layout-container">
                <div className="max-w-[1600px] mx-auto">
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12 mb-16 border-b border-primary-200 pb-12 relative">
                        <div className="absolute bottom-0 left-0 w-1/3 h-[2px] bg-gradient-to-r from-accent-blue to-transparent" />

                        <div className="max-w-3xl">
                            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 mb-6">
                                <span className="w-8 h-1 bg-accent-blue"></span>
                                <span className="uppercase tracking-[0.3em] text-primary-600 text-xs font-bold font-sans">Master Inventory</span>
                            </motion.div>
                            <motion.h1 initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="text-5xl md:text-7xl font-display font-extrabold text-primary-950 tracking-tighter leading-[1.1]">
                                Genuine Mitsubishi Components
                            </motion.h1>
                        </div>

                        {/* Search Bar */}
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="w-full md:w-[400px] shrink-0">
                            <div className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-accent-blue to-accent-danger rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
                                <div className="relative flex items-center bg-white border border-primary-200 p-1.5 rounded-xl shadow-sm">
                                    <Search className="w-5 h-5 text-primary-400 ml-3" />
                                    <input
                                        type="text"
                                        placeholder="Search part name, SKU, or model..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-transparent border-none text-primary-900 focus:ring-0 placeholder-primary-400 px-3 py-3 outline-none"
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} className="p-2 hover:bg-primary-50 text-primary-500 hover:text-primary-900 rounded-lg transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Filter Pills */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                        {categories.map((cat) => (
                            <button
                                key={cat.value}
                                onClick={() => setSelectedCategory(cat.value)}
                                className={`whitespace-nowrap flex items-center gap-3 px-6 py-3 rounded-none text-sm font-bold tracking-wide uppercase transition-all duration-300 border-l-2 ${selectedCategory === cat.value
                                    ? 'bg-white border-accent-primary text-accent-primary shadow-sm'
                                    : 'bg-white/50 border-transparent text-primary-500 hover:text-primary-900 hover:bg-white'
                                    }`}
                            >
                                {cat.label}
                                <span className={`text-[10px] px-2 py-0.5 rounded-sm font-mono ${selectedCategory === cat.value ? 'bg-accent-primary/10 text-accent-primary' : 'bg-primary-100 text-primary-600'}`}>
                                    {cat.count}
                                </span>
                            </button>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* Results Grid */}
            <section className="px-4 md:px-8 xl:px-12 pb-32 relative z-10">
                <div className="max-w-[1600px] mx-auto">

                    <div className="mb-6 flex items-center justify-between text-sm text-primary-600">
                        <span>Showing <strong className="text-primary-950">{filteredProducts.length}</strong> components</span>
                    </div>

                    {loading ? (
                        <div className="w-full bg-white border border-primary-200 p-24 text-center flex flex-col items-center justify-center rounded-2xl shadow-sm">
                            <div className="spinner mx-auto mb-4" />
                            <h3 className="text-xl font-display font-medium text-primary-950">Loading Catalog Data...</h3>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="w-full bg-white border border-primary-200 p-24 text-center flex flex-col items-center justify-center rounded-2xl shadow-sm">
                            <LayoutGrid className="w-20 h-20 text-primary-300 mb-8" />
                            <h3 className="text-3xl font-display font-bold text-primary-950 mb-3">No components matched</h3>
                            <p className="text-primary-600 mb-8 max-w-md font-sans text-lg">Adjust your parameters or expand the category selection to view more items.</p>
                            <button onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }} className="btn btn-outline text-accent-primary hover:bg-accent-primary/5 hover:border-accent-primary">
                                Reset Filters
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                            {filteredProducts.map((product, i) => (
                                <motion.div
                                    key={product.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: i * 0.05 }}
                                    onClick={() => setSelectedProduct(product)}
                                >
                                    <div className="group cursor-pointer flex flex-col h-full bg-white border border-primary-200 shadow-sm relative overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-xl rounded-2xl">
                                        <div className="absolute bottom-0 left-0 w-full h-1 bg-accent-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left z-20" />

                                        <div className="relative p-4 border-b border-primary-200 bg-gradient-to-b from-white to-primary-50/80">
                                            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
                                                {product.inStock && (
                                                    <span className="bg-accent-blue text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 shadow-[0_0_15px_rgba(37,99,235,0.4)] rounded-sm">
                                                        Available
                                                    </span>
                                                )}
                                            </div>

                                            <GenuinePartsLabel product={product} compact />
                                        </div>

                                        {/* Data */}
                                        <div className="p-5 flex flex-col flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-semibold text-primary-500 uppercase tracking-wider">{product.category}</span>
                                                <span className="text-xs text-primary-400 font-mono">{product.sku}</span>
                                            </div>

                                            <h3 className="font-display font-semibold text-lg text-primary-950 mb-2 line-clamp-2">
                                                {product.name}
                                            </h3>

                                            <p className="text-sm text-primary-600 line-clamp-2 mb-6 flex-1">
                                                {product.description}
                                            </p>

                                            <div className="flex items-center justify-between mt-auto">
                                                <div className="text-xl font-bold text-accent-blue">{formatCurrency(product.price)}</div>
                                                <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-500 group-hover:bg-accent-primary group-hover:text-white transition-colors">
                                                    <ChevronRight className="w-4 h-4" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Product Interface Modal */}
            <AnimatePresence>
                {selectedProduct && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-primary-950/40 backdrop-blur-sm overflow-y-auto"
                        onClick={() => setSelectedProduct(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white border border-primary-200 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden relative my-8"
                        >
                            <button
                                onClick={() => setSelectedProduct(null)}
                                className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/80 hover:bg-primary-100 rounded-full flex items-center justify-center text-primary-600 hover:text-primary-950 transition-colors backdrop-blur-sm shadow-sm"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="grid md:grid-cols-5 h-full">
                                {/* Visual Presentation */}
                                <div className="md:col-span-2 bg-gradient-to-br from-primary-50 to-white flex flex-col relative overflow-hidden p-8 min-h-[300px]">
                                    <div className="absolute inset-0 bg-grid-pattern opacity-10" />
                                    <div className="relative z-10 font-mono text-xs text-primary-500 mb-6">ID: {selectedProduct.sku}</div>
                                    <div className="relative z-10 flex-1">
                                        <GenuinePartsLabel product={selectedProduct} />
                                    </div>
                                    <div className="relative z-10 mt-auto flex items-center gap-2">
                                        <Award className="w-4 h-4 text-accent-primary" />
                                        <span className="text-xs font-semibold uppercase tracking-wider text-primary-600">OEM Verified</span>
                                    </div>
                                </div>

                                {/* Data Presentation */}
                                <div className="md:col-span-3 p-8 sm:p-10 flex flex-col bg-white border-l border-primary-200">
                                    <div className="flex gap-2 mb-4">
                                        <span className="px-3 py-1 bg-primary-100 text-xs font-semibold rounded-full uppercase tracking-wider text-primary-600">
                                            {selectedProduct.category}
                                        </span>
                                        {selectedProduct.inStock && (
                                            <span className="px-3 py-1 bg-accent-success/10 text-accent-success text-xs font-semibold rounded-full flex items-center gap-1 uppercase tracking-wider">
                                                <Check className="w-3 h-3" /> In Stock
                                            </span>
                                        )}
                                    </div>

                                    <h2 className="text-3xl sm:text-4xl font-display font-bold text-primary-950 mb-6 leading-tight">
                                        {selectedProduct.name}
                                    </h2>

                                    <p className="text-primary-600 font-sans leading-relaxed mb-8">
                                        {selectedProduct.description} Designed to meet exact specifications and ensure optimal performance for your vehicle.
                                    </p>

                                    <div className="mb-8">
                                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary-500 mb-3">Model Compatibility</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedProduct.compatibility.map((model, i) => (
                                                <span key={i} className="px-4 py-2 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-600">
                                                    {model}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="mt-auto pt-8 border-t border-primary-200 flex flex-col sm:flex-row items-center justify-between gap-6">
                                        <div>
                                            <p className="text-xs font-medium text-primary-500 uppercase tracking-widest mb-1">Unit Valuation (VAT Inc.)</p>
                                            <p className="text-4xl font-display font-bold text-accent-blue">{formatCurrency(selectedProduct.price)}</p>
                                        </div>

                                        <Link
                                            to="/estimate"
                                            className="btn btn-primary w-full sm:w-auto px-8"
                                            onClick={() => setSelectedProduct(null)}
                                        >
                                            <ShoppingCart className="w-5 h-5" /> Calculate Quote
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PublicCatalog;

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    ShoppingCart,
    ChevronRight,
    X,
    LayoutGrid,
    Check,
    Award,
    ArrowUpDown,
    ChevronLeft,
    ChevronDown,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Barcode from 'react-barcode';
import { formatCurrency } from '../../../utils/formatters';
import useProductCatalog from '../../../hooks/useProductCatalog';

const PAGE_SIZE = 12;

const SORT_OPTIONS = [
    { value: 'name-asc', label: 'A-Z' },
    { value: 'name-desc', label: 'Z-A' },
    { value: 'price-asc', label: 'Price: Low to High' },
    { value: 'price-desc', label: 'Price: High to Low' },
];

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

const PublicCatalogView = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [sortBy, setSortBy] = useState('name-asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedProduct, setSelectedProduct] = useState(null);

    const {
        products,
        categories,
        pagination,
        loading,
        error,
    } = useProductCatalog({
        page: currentPage,
        pageSize: PAGE_SIZE,
        searchQuery,
        selectedCategory,
        sortBy,
    });

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedCategory, sortBy]);

    const visibleProducts = products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: Number(product.price ?? 0),
        inStock: Number(product.stock ?? 0) > 0,
        model: product.model || 'Universal',
        compatibility: [product.model || 'Universal'],
        description: `Genuine Mitsubishi ${product.name} for ${product.model || 'Universal'}. Engineered for exact fitment.`,
    }));

    const totalCount = pagination.totalCount || 0;
    const totalPages = pagination.totalPages || 1;
    const rangeStart = totalCount === 0 ? 0 : ((pagination.page - 1) * pagination.pageSize) + 1;
    const rangeEnd = totalCount === 0 ? 0 : Math.min(pagination.page * pagination.pageSize, totalCount);
    const canGoPrev = pagination.page > 1;
    const canGoNext = pagination.page < totalPages;

    const resetFilters = () => {
        setSearchQuery('');
        setSelectedCategory('all');
        setSortBy('name-asc');
    };

    return (
        <div className="bg-primary-50 min-h-screen relative font-sans text-primary-900">
            <div className="absolute top-0 right-0 w-full h-[60vh] bg-gradient-to-b from-white via-primary-50 to-primary-50 -z-10" />
            <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] bg-accent-blue/10 rounded-full blur-[150px] mix-blend-multiply -z-10 pointer-events-none opacity-60" />
            <div className="absolute top-[20%] left-[-10%] w-[40vw] h-[40vw] bg-accent-danger/5 rounded-full blur-[120px] mix-blend-multiply -z-10 pointer-events-none opacity-50" />

            <section className="relative pt-32 pb-16 px-4 md:px-8 xl:px-12 z-20 layout-container">
                <div className="max-w-[1600px] mx-auto">
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12 mb-16 border-b border-primary-200 pb-12 relative">
                        <div className="absolute bottom-0 left-0 w-1/3 h-[2px] bg-gradient-to-r from-accent-blue to-transparent" />

                        <div className="max-w-3xl">
                            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 mb-6">
                                <span className="w-8 h-1 bg-accent-blue" />
                                <span className="uppercase tracking-[0.3em] text-primary-600 text-xs font-bold font-sans">Master Inventory</span>
                            </motion.div>
                            <motion.h1 initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="text-5xl md:text-7xl font-display font-extrabold text-primary-950 tracking-tighter leading-[1.1]">
                                Genuine Mitsubishi Components
                            </motion.h1>
                        </div>

                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="w-full md:w-[400px] shrink-0">
                            <div className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-accent-blue to-accent-danger rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
                                <div className="relative flex items-center bg-white border border-primary-200 p-1.5 rounded-xl shadow-sm">
                                    <Search className="w-5 h-5 text-primary-400 ml-3" />
                                    <input
                                        type="text"
                                        placeholder="Search part name, SKU, or model..."
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
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

                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                        {categories.map((category) => (
                            <button
                                key={category.value}
                                onClick={() => setSelectedCategory(category.value)}
                                className={`whitespace-nowrap flex items-center gap-3 px-6 py-3 rounded-none text-sm font-bold tracking-wide uppercase transition-all duration-300 border-l-2 ${
                                    selectedCategory === category.value
                                        ? 'bg-white border-accent-primary text-accent-primary shadow-sm'
                                        : 'bg-white/50 border-transparent text-primary-500 hover:text-primary-900 hover:bg-white'
                                }`}
                            >
                                {category.label}
                                <span className={`text-[10px] px-2 py-0.5 rounded-sm font-mono ${
                                    selectedCategory === category.value ? 'bg-accent-primary/10 text-accent-primary' : 'bg-primary-100 text-primary-600'
                                }`}>
                                    {category.count}
                                </span>
                            </button>
                        ))}
                    </motion.div>
                </div>
            </section>

            <section className="px-4 md:px-8 xl:px-12 pb-32 relative z-10">
                <div className="max-w-[1600px] mx-auto">
                    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-primary-600">
                            <span>
                                Showing <strong className="text-primary-950">{rangeStart}-{rangeEnd}</strong> of{' '}
                                <strong className="text-primary-950">{totalCount}</strong> components
                            </span>
                            <p className="mt-1 text-xs uppercase tracking-[0.22em] text-primary-400">
                                Page {pagination.page} of {totalPages}
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <label className="text-xs font-bold uppercase tracking-[0.22em] text-primary-500">
                                Sort by
                            </label>
                            <div className="relative min-w-[220px]">
                                <ArrowUpDown className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                                <select
                                    value={sortBy}
                                    onChange={(event) => setSortBy(event.target.value)}
                                    className="w-full appearance-none rounded-xl border border-primary-200 bg-primary-50 py-3 pl-11 pr-11 text-sm font-semibold text-primary-900 outline-none transition focus:border-accent-blue focus:bg-white"
                                >
                                    {SORT_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="w-full bg-white border border-primary-200 p-24 text-center flex flex-col items-center justify-center rounded-2xl shadow-sm">
                            <div className="spinner mx-auto mb-4" />
                            <h3 className="text-xl font-display font-medium text-primary-950">Loading Catalog Data...</h3>
                        </div>
                    ) : error ? (
                        <div className="w-full bg-white border border-accent-danger/20 p-24 text-center flex flex-col items-center justify-center rounded-2xl shadow-sm">
                            <LayoutGrid className="w-20 h-20 text-accent-danger/40 mb-8" />
                            <h3 className="text-3xl font-display font-bold text-primary-950 mb-3">Catalog unavailable</h3>
                            <p className="text-primary-600 mb-8 max-w-md font-sans text-lg">{error}</p>
                            <button onClick={resetFilters} className="btn btn-outline text-accent-primary hover:bg-accent-primary/5 hover:border-accent-primary">
                                Reset Filters
                            </button>
                        </div>
                    ) : totalCount === 0 ? (
                        <div className="w-full bg-white border border-primary-200 p-24 text-center flex flex-col items-center justify-center rounded-2xl shadow-sm">
                            <LayoutGrid className="w-20 h-20 text-primary-300 mb-8" />
                            <h3 className="text-3xl font-display font-bold text-primary-950 mb-3">No components matched</h3>
                            <p className="text-primary-600 mb-8 max-w-md font-sans text-lg">Adjust your parameters or expand the category selection to view more items.</p>
                            <button onClick={resetFilters} className="btn btn-outline text-accent-primary hover:bg-accent-primary/5 hover:border-accent-primary">
                                Reset Filters
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                {visibleProducts.map((product, index) => (
                                    <motion.div
                                        key={product.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: index * 0.05 }}
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

                            <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm text-primary-600">
                                    <span className="font-semibold text-primary-950">{totalCount}</span> total genuine parts available
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={canGoPrev ? () => setCurrentPage((page) => Math.max(1, page - 1)) : undefined}
                                        disabled={!canGoPrev}
                                        className="inline-flex items-center gap-2 rounded-xl border border-primary-200 px-4 py-2 text-sm font-semibold text-primary-700 transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-primary-300 hover:bg-primary-50"
                                    >
                                        <ChevronLeft className="h-4 w-4" /> Previous
                                    </button>

                                    {canGoNext && (
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                                            className="inline-flex items-center gap-2 rounded-xl bg-primary-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-800"
                                        >
                                            See More
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={canGoNext ? () => setCurrentPage((page) => Math.min(totalPages, page + 1)) : undefined}
                                        disabled={!canGoNext}
                                        className="inline-flex items-center gap-2 rounded-xl border border-primary-200 px-4 py-2 text-sm font-semibold text-primary-700 transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-primary-300 hover:bg-primary-50"
                                    >
                                        Next <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </section>

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
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            onClick={(event) => event.stopPropagation()}
                            className="bg-white border border-primary-200 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden relative my-8"
                        >
                            <button
                                onClick={() => setSelectedProduct(null)}
                                className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/80 hover:bg-primary-100 rounded-full flex items-center justify-center text-primary-600 hover:text-primary-950 transition-colors backdrop-blur-sm shadow-sm"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="grid md:grid-cols-5 h-full">
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
                                            {selectedProduct.compatibility.map((model, index) => (
                                                <span key={index} className="px-4 py-2 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-600">
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

export default PublicCatalogView;


import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Plus, Minus, Calculator, Printer, User, Phone, Car, Wrench, X, Package, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';
import useProductCatalog from '../../../hooks/useProductCatalog';
import useServiceCatalog from '../../../hooks/useServiceCatalog';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import ProductPackageSuggestions from '../components/ProductPackageSuggestions';
import PublicQuoteLookupCard from '../components/PublicQuoteLookupCard';

const SORT_OPTIONS = [
    { value: 'name-asc', label: 'A-Z' },
    { value: 'name-desc', label: 'Z-A' },
    { value: 'price-asc', label: 'Price: Low to High' },
    { value: 'price-desc', label: 'Price: High to Low' },
];

const createQuoteMeta = () => ({
    issuedAt: new Date(),
    reference: `QT-${Date.now().toString().slice(-6)}`,
});

const PublicEstimate = () => {
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [vehicleInfo, setVehicleInfo] = useState('');
    const [selectedParts, setSelectedParts] = useState([]);
    const [selectedServices, setSelectedServices] = useState([]);
    const [partSearch, setPartSearch] = useState('');
    const [sortBy, setSortBy] = useState('name-asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [focusedProduct, setFocusedProduct] = useState(null);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [showSummaryDrawer, setShowSummaryDrawer] = useState(false);
    const [quoteMeta, setQuoteMeta] = useState(() => createQuoteMeta());

    const {
        products: priceListProducts,
        pagination,
        loading,
        error: partsError,
    } = useProductCatalog({
        page: currentPage,
        pageSize: 12,
        searchQuery: partSearch,
        sortBy,
    });
    const { services: availableServices, loading: servicesLoading, error: servicesError } = useServiceCatalog();

    useEffect(() => {
        setCurrentPage(1);
    }, [partSearch, sortBy]);

    useEffect(() => {
        if (!showSummaryDrawer) {
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [showSummaryDrawer]);

    const filteredProducts = priceListProducts.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        price: Number(product.price ?? 0),
        category: product.category,
        model: product.model,
    }));

    const totalCount = pagination.totalCount || 0;
    const totalPages = pagination.totalPages || 1;
    const rangeStart = totalCount === 0 ? 0 : ((pagination.page - 1) * pagination.pageSize) + 1;
    const rangeEnd = totalCount === 0 ? 0 : Math.min(pagination.page * pagination.pageSize, totalCount);
    const canGoPrev = pagination.page > 1;
    const canGoNext = pagination.page < totalPages;

    const addPart = (product, extra = {}) => {
        setFocusedProduct(product);
        setSelectedParts((parts) => {
            const existing = parts.find((part) => part.id === product.id);
            const nextPrice = Number(extra.price ?? product.price ?? existing?.price ?? 0);
            const hasPriceOverride = Number.isFinite(nextPrice);

            if (existing) {
                return parts.map((part) => (part.id === product.id ? {
                    ...part,
                    ...extra,
                    price: hasPriceOverride ? nextPrice : part.price,
                    quantity: part.quantity + 1,
                } : part));
            }

            return [...parts, {
                ...product,
                quantity: 1,
                ...extra,
                price: hasPriceOverride ? nextPrice : Number(product.price ?? 0),
            }];
        });
    };

    const removePart = (id) => {
        setSelectedParts((parts) => parts.filter((part) => part.id !== id));
        if (focusedProduct?.id === id) {
            setFocusedProduct(null);
        }
    };

    const updateQty = (id, qty) => {
        if (qty < 1) {
            removePart(id);
            return;
        }

        setSelectedParts((parts) => parts.map((part) => (part.id === id ? { ...part, quantity: qty } : part)));
    };

    const removeService = (id) => {
        setSelectedServices((services) => services.filter((service) => service.id !== id));
    };

    const toggleService = (service) => {
        const existing = selectedServices.find((selected) => selected.id === service.id);
        if (existing) {
            setSelectedServices((services) => services.filter((selected) => selected.id !== service.id));
        } else {
            setSelectedServices([...selectedServices, service]);
        }
    };

    const addSuggestedService = (recommendation) => {
        const service = {
            id: recommendation.recommendedServiceId,
            name: recommendation.recommendedServiceName,
            price: Number(recommendation.resolvedPrice ?? recommendation.recommendedPrice ?? 0),
            quantity: 1,
            isUpsell: true,
            recommendationRuleId: recommendation.packageItemId || recommendation.ruleId || null,
        };

        setSelectedServices((services) => {
            const existing = services.find((selected) => selected.id === service.id);
            if (existing) {
                return services.map((selected) => (selected.id === service.id ? {
                    ...selected,
                    ...service,
                    price: Math.min(Number(selected.price ?? 0), Number(service.price ?? 0)),
                } : selected));
            }

            return [...services, service];
        });
    };

    const partsTotal = selectedParts.reduce((sum, part) => sum + (part.price * part.quantity), 0);
    const servicesTotal = selectedServices.reduce((sum, service) => sum + service.price, 0);
    const subtotal = partsTotal + servicesTotal;
    const vat = subtotal * 0.12;
    const total = subtotal + vat;
    const hasItems = selectedParts.length > 0 || selectedServices.length > 0;
    const focusedPartSelection = selectedParts.find((part) => part.id === focusedProduct?.id);
    const totalItemCount = selectedParts.reduce((sum, part) => sum + part.quantity, 0) + selectedServices.length;
    const totalLineCount = selectedParts.length + selectedServices.length;

    const openPreview = () => {
        setShowSummaryDrawer(false);
        setQuoteMeta(createQuoteMeta());
        setShowPrintPreview(true);
    };

    const resetForm = () => {
        setCustomerName('');
        setCustomerPhone('');
        setVehicleInfo('');
        setSelectedParts([]);
        setSelectedServices([]);
        setPartSearch('');
        setSortBy('name-asc');
        setCurrentPage(1);
        setFocusedProduct(null);
        setShowSummaryDrawer(false);
        setShowPrintPreview(false);
        setQuoteMeta(createQuoteMeta());
    };

    const resetPriceListView = () => {
        setPartSearch('');
        setSortBy('name-asc');
        setCurrentPage(1);
    };

    return (
        <div className="bg-primary-50 min-h-screen relative font-sans text-primary-900 pb-20 print:bg-white print:p-0 print:m-0 print:min-h-0 print:block">
            <div className="fixed inset-0 bg-gradient-to-b from-white via-primary-50 to-primary-50 -z-10 print:hidden" />
            <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-accent-blue/10 rounded-full blur-[150px] mix-blend-multiply pointer-events-none -z-10 opacity-60 print:hidden" />
            <div className="absolute top-[30%] right-[-10%] w-[40vw] h-[40vw] bg-accent-danger/5 rounded-full blur-[120px] mix-blend-multiply pointer-events-none -z-10 opacity-50 print:hidden" />

            <section className="relative pt-32 pb-16 px-4 md:px-8 xl:px-12 z-10 max-w-[1600px] mx-auto layout-container border-b border-primary-200 mb-12 print:hidden">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12">
                    <div className="max-w-3xl">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="w-8 h-1 bg-accent-primary" />
                            <span className="text-xs font-bold tracking-[0.3em] font-sans text-primary-500 uppercase">Quotations</span>
                        </div>
                        <h1 className="text-5xl md:text-7xl font-display font-extrabold text-primary-950 tracking-tighter leading-[1.1]">
                            Get Estimate
                        </h1>
                        <p className="mt-4 text-lg text-primary-600 max-w-2xl">
                            Pick genuine Mitsubishi parts from the live pricelist, then add compatible services before printing the quotation.
                        </p>
                    </div>
                </div>
            </section>

            <section className="relative z-10 max-w-[1600px] mx-auto px-4 md:px-8 xl:px-12 py-2 print:hidden">
                <PublicQuoteLookupCard />

                <div className="grid grid-cols-1 gap-8">
                    <div className="space-y-8">
                        <div className="surface p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div>
                                    <label className="block text-sm font-semibold text-primary-700 mb-2">Customer Name</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                                        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" className="input pl-10 py-2.5 text-sm" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-primary-700 mb-2">Phone Number</label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                                        <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="09XX XXX XXXX" className="input pl-10 py-2.5 text-sm" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-primary-700 mb-2">Vehicle Info</label>
                                    <div className="relative">
                                        <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                                        <input value={vehicleInfo} onChange={(e) => setVehicleInfo(e.target.value)} placeholder="Model / year / plate" className="input pl-10 py-2.5 text-sm" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="surface p-6">
                            <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-end lg:justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-accent-primary/5 border border-accent-primary/20 flex items-center justify-center">
                                        <Package className="w-5 h-5 text-accent-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-display font-semibold text-primary-950">Genuine Parts Pricelist</h3>
                                        <p className="text-sm text-primary-500">Showing 12 priced items at a time from the current pricelist.</p>
                                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-primary-400">Click a part to add it and reveal its matched package.</p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <div className="relative w-full sm:w-72">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-500" />
                                        <input
                                            type="text"
                                            placeholder="Search by part name, SKU, or model..."
                                            value={partSearch}
                                            onChange={(e) => setPartSearch(e.target.value)}
                                            className="input pl-10 py-2.5 text-sm"
                                        />
                                    </div>
                                    <div className="relative min-w-[220px]">
                                        <ArrowUpDown className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                                        <select
                                            value={sortBy}
                                            onChange={(e) => setSortBy(e.target.value)}
                                            className="w-full appearance-none rounded-xl border border-primary-200 bg-primary-50 py-3 pl-11 pr-11 text-sm font-semibold text-primary-900 outline-none transition focus:border-accent-blue focus:bg-white"
                                        >
                                            {SORT_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-primary-200 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm text-primary-600">
                                    <span>
                                        Showing <strong className="text-primary-950">{rangeStart}-{rangeEnd}</strong> of <strong className="text-primary-950">{totalCount}</strong> priced items
                                    </span>
                                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-primary-400">Page {pagination.page} of {totalPages}</p>
                                </div>
                                <button type="button" onClick={resetPriceListView} className="text-sm font-semibold text-accent-blue hover:text-accent-primary transition">
                                    Reset list view
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-2 custom-scrollbar">
                                {loading ? (
                                    <div className="sm:col-span-2 rounded-xl border border-primary-200 bg-white p-6 text-sm text-primary-500">
                                        Loading the current pricelist...
                                    </div>
                                ) : partsError ? (
                                    <div className="sm:col-span-2 rounded-xl border border-accent-danger/20 bg-accent-danger/5 p-6 text-sm text-accent-danger">
                                        {partsError}
                                    </div>
                                ) : filteredProducts.length === 0 ? (
                                    <div className="sm:col-span-2 rounded-xl border border-primary-200 bg-white p-6 text-sm text-primary-500">
                                        No priced parts matched your search.
                                    </div>
                                ) : filteredProducts.map((product) => {
                                    const isSelected = selectedParts.some((part) => part.id === product.id);
                                    return (
                                        <button
                                            key={product.id}
                                            onClick={() => addPart(product)}
                                            className={`p-4 text-left rounded-xl border flex flex-col gap-2 transition-all duration-300 ${isSelected
                                                ? 'bg-accent-primary/5 border-accent-primary/30 ring-1 ring-accent-primary/30'
                                                : 'bg-white border-primary-200 hover:border-accent-primary hover:bg-primary-50 shadow-sm'
                                                }`}
                                        >
                                            <span className="text-xs font-semibold text-primary-500">{product.sku}</span>
                                            <span className="text-base font-display font-medium text-primary-950 line-clamp-1">{product.name}</span>
                                            <span className="text-xs text-primary-400">{product.model || 'Universal fitment'}</span>
                                            <span className="text-sm font-bold text-accent-blue mt-auto">{formatCurrency(product.price)}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={() => canGoPrev && setCurrentPage((page) => Math.max(1, page - 1))}
                                    disabled={!canGoPrev}
                                    className="inline-flex items-center gap-2 rounded-xl border border-primary-200 px-4 py-2 text-sm font-semibold text-primary-700 transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-primary-300 hover:bg-primary-50"
                                >
                                    <ChevronLeft className="h-4 w-4" /> Previous
                                </button>

                                <div className="flex items-center gap-3">
                                    {canGoNext && (
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                                            className="inline-flex items-center gap-2 rounded-xl bg-primary-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-800"
                                        >
                                            Show More <ChevronRight className="h-4 w-4" />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => canGoNext && setCurrentPage((page) => Math.min(totalPages, page + 1))}
                                        disabled={!canGoNext}
                                        className="inline-flex items-center gap-2 rounded-xl border border-primary-200 px-4 py-2 text-sm font-semibold text-primary-700 transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-primary-300 hover:bg-primary-50"
                                    >
                                        Next <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {focusedProduct && (
                            <ProductPackageSuggestions
                                product={focusedProduct}
                                vehicleModelId={focusedProduct.model || vehicleInfo}
                                anchorQuantity={focusedPartSelection?.quantity ?? 1}
                                onAddProduct={(recommendation) => {
                                    const matchedProduct = recommendation.recommendedProduct;

                                    if (!matchedProduct?.id) {
                                        return;
                                    }

                                    addPart({
                                        id: matchedProduct.id,
                                        name: matchedProduct.name,
                                        sku: matchedProduct.sku,
                                        price: Number(recommendation.resolvedPrice ?? matchedProduct.price ?? recommendation.recommendedPrice ?? 0),
                                        category: matchedProduct.category,
                                        model: matchedProduct.model,
                                    }, {
                                        isUpsell: true,
                                        recommendationRuleId: recommendation.packageItemId || recommendation.ruleId || null,
                                    });
                                }}
                                onAddService={addSuggestedService}
                                selectedProductIds={selectedParts.map((part) => part.id)}
                                selectedServiceIds={selectedServices.map((service) => service.id)}
                                title="Smart Bundle Suggestions"
                                subtitle="Smart upsell bundles of same-vehicle Mitsubishi parts and services for the currently selected part."
                            />
                        )}

                        <div className="surface p-6">
                            <div className="flex items-start gap-3 mb-6">
                                <div className="w-10 h-10 rounded-lg bg-accent-primary/5 border border-accent-primary/20 flex items-center justify-center">
                                    <Wrench className="w-5 h-5 text-accent-primary" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-display font-semibold text-primary-950">Service Catalog</h3>
                                    <p className="text-sm text-primary-500">Live maintenance services from the database.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {servicesLoading ? (
                                    <div className="sm:col-span-2 rounded-xl border border-primary-200 bg-white p-6 text-sm text-primary-500">
                                        Loading services from Supabase...
                                    </div>
                                ) : servicesError ? (
                                    <div className="sm:col-span-2 rounded-xl border border-accent-danger/20 bg-accent-danger/5 p-6 text-sm text-accent-danger">
                                        {servicesError}
                                    </div>
                                ) : availableServices.length === 0 ? (
                                    <div className="sm:col-span-2 rounded-xl border border-primary-200 bg-white p-6 text-sm text-primary-500">
                                        No active services are available in the database.
                                    </div>
                                ) : availableServices.map((service) => {
                                    const isSelected = selectedServices.some((selected) => selected.id === service.id);
                                    return (
                                        <button
                                            key={service.id}
                                            onClick={() => toggleService(service)}
                                            className={`p-4 text-left rounded-xl border flex items-center justify-between transition-all duration-300 ${isSelected
                                                ? 'bg-accent-primary/5 border-accent-primary/30 ring-1 ring-accent-primary/30 text-primary-950'
                                                : 'bg-white border-primary-200 text-primary-600 hover:border-accent-primary hover:text-primary-950 shadow-sm'
                                                }`}
                                        >
                                            <span className="text-sm font-medium pr-4">{service.name}</span>
                                            <span className={`text-sm font-bold ${isSelected ? 'text-accent-primary' : 'text-primary-500'}`}>
                                                {formatCurrency(service.price)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                </div>
            </section>

            <motion.button
                type="button"
                onClick={() => setShowSummaryDrawer(true)}
                className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 flex items-center justify-between gap-3 rounded-[28px] border border-primary-200 bg-primary-950 px-4 py-3 text-left text-white shadow-[0_18px_48px_rgba(15,23,42,0.28)] transition hover:bg-primary-900 print:hidden sm:inset-x-auto sm:bottom-6 sm:right-6 sm:px-5"
                whileTap={{ scale: 0.98 }}
                animate={{ opacity: showSummaryDrawer ? 0 : 1, y: showSummaryDrawer ? 12 : 0, scale: showSummaryDrawer ? 0.96 : 1 }}
                aria-label="Open quotation summary cart"
            >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                    <ShoppingCart className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <span className="block text-[0.65rem] font-bold uppercase tracking-[0.24em] text-white/65">
                        Quote Cart
                    </span>
                    <span className="block text-sm font-semibold text-white">
                        {totalItemCount} item{totalItemCount === 1 ? '' : 's'} - {formatCurrency(total)}
                    </span>
                    <span className="block text-xs text-white/60">
                        {totalLineCount} line{totalLineCount === 1 ? '' : 's'} in summary
                    </span>
                </div>
            </motion.button>

            <AnimatePresence>
                {showSummaryDrawer && (
                    <>
                        <motion.button
                            type="button"
                            className="fixed inset-0 z-40 bg-primary-950/45 backdrop-blur-sm print:hidden"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowSummaryDrawer(false)}
                            aria-label="Close quotation summary"
                        />
                        <motion.aside
                            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[32px] border border-primary-200 border-b-0 bg-primary-50 shadow-[0_32px_90px_rgba(15,23,42,0.28)] print:hidden md:inset-y-6 md:right-6 md:bottom-auto md:left-auto md:w-[440px] md:max-h-none md:rounded-[30px] md:border"
                            initial={{ opacity: 0, y: 28, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 24, scale: 0.98 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                        >
                            <div className="border-b border-primary-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-5 sm:py-5 md:px-6"><div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-primary-200 md:hidden" />
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <span className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-primary-500">
                                            Public Quotation
                                        </span>
                                        <h3 className="mt-2 text-xl font-display font-semibold text-primary-950">Quotation Summary</h3>
                                        <p className="mt-1 text-sm text-primary-500">Customer details, selected items, and quote totals in one cart view.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowSummaryDrawer(false)}
                                        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary-200 bg-primary-50 text-primary-500 transition hover:border-primary-300 hover:bg-white hover:text-primary-950"
                                        aria-label="Close quotation summary"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    <div className="rounded-2xl border border-primary-200 bg-primary-50/80 px-3 py-3">
                                        <span className="block text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary-400">Items</span>
                                        <span className="mt-2 block text-lg font-display font-semibold text-primary-950">{totalItemCount}</span>
                                    </div>
                                    <div className="rounded-2xl border border-primary-200 bg-primary-50/80 px-3 py-3">
                                        <span className="block text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary-400">Lines</span>
                                        <span className="mt-2 block text-lg font-display font-semibold text-primary-950">{totalLineCount}</span>
                                    </div>
                                    <div className="col-span-2 rounded-2xl border border-accent-blue/20 bg-accent-blue/5 px-3 py-3 sm:col-span-1">
                                        <span className="block text-[0.65rem] font-bold uppercase tracking-[0.22em] text-accent-blue/70">Total</span>
                                        <span className="mt-2 block text-lg font-display font-semibold text-accent-blue">{formatCurrency(total)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:space-y-5 sm:px-5 sm:py-5 md:px-6">
                                <div className="rounded-[24px] border border-primary-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-accent-primary" />
                                        <span className="text-[0.7rem] font-bold uppercase tracking-[0.26em] text-primary-500">Customer & Vehicle</span>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                        <div className="rounded-2xl border border-primary-200 bg-primary-50/70 px-3 py-3">
                                            <span className="block text-[0.65rem] font-bold uppercase tracking-[0.2em] text-primary-400">Customer Name</span>
                                            <span className="mt-1 block text-sm font-semibold text-primary-950">{customerName || 'Walk-in Customer'}</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <div className="rounded-2xl border border-primary-200 bg-primary-50/70 px-3 py-3">
                                                <span className="block text-[0.65rem] font-bold uppercase tracking-[0.2em] text-primary-400">Phone Number</span>
                                                <span className="mt-1 block text-sm font-semibold text-primary-950">{customerPhone || 'Not provided yet'}</span>
                                            </div>
                                            <div className="rounded-2xl border border-primary-200 bg-primary-50/70 px-3 py-3">
                                                <span className="block text-[0.65rem] font-bold uppercase tracking-[0.2em] text-primary-400">Vehicle Info</span>
                                                <span className="mt-1 block text-sm font-semibold text-primary-950">{vehicleInfo || 'No vehicle linked yet'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {!hasItems ? (
                                    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[24px] border border-dashed border-primary-200 bg-white px-6 py-10 text-center">
                                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-accent-primary/20 bg-accent-primary/5">
                                            <Calculator className="h-8 w-8 text-accent-primary" />
                                        </div>
                                        <span className="text-lg font-display font-medium text-primary-950">No items selected</span>
                                        <span className="mt-2 max-w-xs text-sm text-primary-500">Add parts or services from the public estimate page and they will appear here instantly.</span>
                                    </div>
                                ) : (
                                    <div className="space-y-5">
                                        {selectedParts.length > 0 && (
                                            <div className="rounded-[24px] border border-primary-200 bg-white p-4 shadow-sm">
                                                <div className="mb-4 flex items-center justify-between gap-3">
                                                    <div>
                                                        <span className="block text-[0.7rem] font-bold uppercase tracking-[0.26em] text-primary-500">Parts</span>
                                                        <span className="mt-1 block text-sm text-primary-500">Adjust quantities directly from the cart.</span>
                                                    </div>
                                                    <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-600">
                                                        {selectedParts.length} selected
                                                    </span>
                                                </div>
                                                <div className="space-y-3">
                                                    {selectedParts.map((part) => (
                                                        <div key={part.id} className="rounded-2xl border border-primary-200 bg-primary-50/60 p-3">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <span className="block text-sm font-semibold text-primary-950">{part.name}</span>
                                                                    <span className="mt-1 block text-xs text-primary-500">{part.sku || 'Pricelist item'}</span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removePart(part.id)}
                                                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-primary-400 transition hover:bg-accent-danger/10 hover:text-accent-danger"
                                                                    aria-label={`Remove ${part.name}`}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                            <div className="mt-3 flex items-center justify-between gap-3">
                                                                <div className="flex items-center rounded-xl border border-primary-200 bg-white p-0.5">
                                                                    <button type="button" onClick={() => updateQty(part.id, part.quantity - 1)} className="rounded-lg p-1.5 text-primary-500 transition hover:bg-primary-50 hover:text-primary-950" aria-label={`Decrease ${part.name} quantity`}>
                                                                        <Minus className="h-4 w-4" />
                                                                    </button>
                                                                    <span className="w-9 text-center text-sm font-semibold text-primary-950">{part.quantity}</span>
                                                                    <button type="button" onClick={() => updateQty(part.id, part.quantity + 1)} className="rounded-lg p-1.5 text-primary-500 transition hover:bg-primary-50 hover:text-primary-950" aria-label={`Increase ${part.name} quantity`}>
                                                                        <Plus className="h-4 w-4" />
                                                                    </button>
                                                                </div>
                                                                <span className="text-sm font-bold text-accent-blue">{formatCurrency(part.price * part.quantity)}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {selectedServices.length > 0 && (
                                            <div className="rounded-[24px] border border-primary-200 bg-white p-4 shadow-sm">
                                                <div className="mb-4 flex items-center justify-between gap-3">
                                                    <div>
                                                        <span className="block text-[0.7rem] font-bold uppercase tracking-[0.26em] text-primary-500">Services</span>
                                                        <span className="mt-1 block text-sm text-primary-500">Selected labor and maintenance items.</span>
                                                    </div>
                                                    <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-600">
                                                        {selectedServices.length} selected
                                                    </span>
                                                </div>
                                                <div className="space-y-3">
                                                    {selectedServices.map((service) => (
                                                        <div key={service.id} className="flex items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/60 p-3">
                                                            <div className="min-w-0">
                                                                <span className="block text-sm font-semibold text-primary-950">{service.name}</span>
                                                                <span className="mt-1 block text-xs text-primary-500">Service / labor line</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-bold text-accent-blue">{formatCurrency(service.price)}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeService(service.id)}
                                                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-primary-400 transition hover:bg-accent-danger/10 hover:text-accent-danger"
                                                                    aria-label={`Remove ${service.name}`}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-primary-200 bg-white/95 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur sm:px-5 sm:py-5 md:px-6 md:pb-5">
                                <div className="space-y-3">
                                    <div className="flex justify-between text-sm text-primary-600">
                                        <span>Parts Subtotal</span>
                                        <span className="font-medium text-primary-950">{formatCurrency(partsTotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-primary-600">
                                        <span>Services Subtotal</span>
                                        <span className="font-medium text-primary-950">{formatCurrency(servicesTotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-primary-600">
                                        <span>VAT (12%)</span>
                                        <span className="font-medium text-primary-950">{formatCurrency(vat)}</span>
                                    </div>
                                    <div className="flex justify-between border-t border-primary-200 pt-3 text-lg font-bold text-primary-950">
                                        <span>Total Due</span>
                                        <span className="text-accent-blue">{formatCurrency(total)}</span>
                                    </div>
                                </div>

                                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                    <Button variant="secondary" fullWidth onClick={resetForm}>
                                        Reset
                                    </Button>
                                    <Button variant="primary" fullWidth leftIcon={<Printer className="h-4 w-4" />} onClick={openPreview} isDisabled={!hasItems}>
                                        Preview
                                    </Button>
                                </div>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            <Modal
                isOpen={showPrintPreview}
                onClose={() => setShowPrintPreview(false)}
                title="Print Preview"
                size="lg"
            >
                <div className="receipt-preview" style={{ fontFamily: 'Inter, Arial, sans-serif' }}>
                    <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '12px', marginBottom: '12px' }}>
                        <img src="/LogoLimen.jpg" alt="Limen Logo" style={{ height: '48px', margin: '0 auto 6px', display: 'block', filter: 'grayscale(1) contrast(1.3)' }} />
                        <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>LIMEN AUTO PARTS CENTER</h2>
                        <p style={{ fontSize: '11px', margin: '2px 0 0', color: '#555' }}>1308, 264 Epifanio de los Santos Ave, Pasay City, 1308 Metro Manila</p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                        <div>
                            <div><span style={{ fontWeight: '600' }}>Prepared for: </span><span>{customerName || 'Walk-in Customer'}</span></div>
                            {customerPhone && <div><span style={{ fontWeight: '600' }}>Phone: </span><span>{customerPhone}</span></div>}
                            <div><span style={{ fontWeight: '600' }}>Vehicle: </span><span>{vehicleInfo || 'N/A'}</span></div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div><span style={{ fontWeight: '600' }}>Date: </span><span>{quoteMeta.issuedAt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' })}</span></div>
                            <div><span style={{ fontWeight: '600' }}>Ref No: </span><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{quoteMeta.reference}</span></div>
                        </div>
                    </div>

                    <h3 style={{ textAlign: 'center', fontSize: '20px', fontWeight: '800', margin: '12px 0 14px', letterSpacing: '2px' }}>QUOTATION</h3>

                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'left', textTransform: 'uppercase' }}>Qty</th>
                                <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'left', textTransform: 'uppercase' }}>Item</th>
                                <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'right', textTransform: 'uppercase' }}>Price/Unit</th>
                                <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'right', textTransform: 'uppercase' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {selectedParts.map((part) => (
                                <tr key={part.id}>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>{part.quantity}</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>{part.name}<span style={{ display: 'block', fontSize: '10px', color: '#888', fontFamily: 'monospace' }}>{part.sku}</span></td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right' }}>{formatCurrency(part.price)}</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(part.price * part.quantity)}</td>
                                </tr>
                            ))}
                            {selectedServices.map((service) => (
                                <tr key={service.id}>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>1</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>{service.name}<span style={{ display: 'block', fontSize: '10px', color: '#888' }}>Service / Labor</span></td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right' }}>{formatCurrency(service.price)}</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(service.price)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                        <div style={{ width: '220px', fontSize: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #ddd' }}>
                                <span style={{ fontWeight: '600' }}>Subtotal</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #ddd' }}>
                                <span style={{ fontWeight: '600' }}>VAT (12%)</span>
                                <span>{formatCurrency(vat)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '2px solid black', marginTop: '4px', fontWeight: '800', fontSize: '14px' }}>
                                <span>Total</span>
                                <span>{formatCurrency(total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-4 flex gap-3 print:hidden">
                    <Button variant="secondary" fullWidth onClick={() => setShowPrintPreview(false)}>
                        Close
                    </Button>
                    <Button variant="primary" fullWidth leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
                        Print
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default PublicEstimate;













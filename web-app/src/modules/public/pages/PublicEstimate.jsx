import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Minus, Calculator, Printer, User, Phone, Wrench, X, Package, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';
import useProductCatalog from '../../../hooks/useProductCatalog';
import useServiceCatalog from '../../../hooks/useServiceCatalog';
import usePublicVehicleSelection from '../../../hooks/usePublicVehicleSelection';
import useVehiclePackages from '../../../hooks/useVehiclePackages';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import { lookupPublicEstimate } from '../../../services/estimatesApi';
import ProductPackageSuggestions from '../components/ProductPackageSuggestions';
import PublicQuoteLookupCard from '../components/PublicQuoteLookupCard';
import PublicVehicleSelector from '../components/PublicVehicleSelector';
import VehiclePackageShowcase from '../components/VehiclePackageShowcase';

const SORT_OPTIONS = [
    { value: 'name-asc', label: 'A-Z' },
    { value: 'name-desc', label: 'Z-A' },
    { value: 'price-asc', label: 'Price: Low to High' },
    { value: 'price-desc', label: 'Price: High to Low' },
];

const MODE_OPTIONS = [
    {
        id: 'estimate',
        label: 'Build Estimate',
        description: 'Pick parts, add services, and build a draft quotation.',
        icon: Calculator,
    },
    {
        id: 'retrieve',
        label: 'Retrieve Quote',
        description: 'Find a saved quotation and open a printable preview.',
        icon: Search,
    },
];

const ESTIMATE_PHASES = [
    {
        id: 'details',
        phase: 'Phase 1',
        label: 'Customer and Vehicle',
        description: 'Capture the customer details and vehicle context before browsing the pricelist.',
    },
    {
        id: 'catalog',
        phase: 'Phase 2',
        label: 'Parts and Services',
        description: 'Add parts, labor, and vehicle-matched bundles into the draft quote.',
    },
    {
        id: 'summary',
        phase: 'Phase 3',
        label: 'Review and Print',
        description: 'Review the cart totals, recommendations, and printable quotation preview.',
    },
];

const DESKTOP_DOCK_QUERY = '(min-width: 768px)';

const createQuoteMeta = () => ({
    issuedAt: new Date(),
    reference: `QT-${Date.now().toString().slice(-6)}`,
});

const formatPrintDate = (value) => {
    if (!value) {
        return 'N/A';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
};

const formatVehicleSummary = (vehicle) => {
    if (!vehicle) {
        return 'N/A';
    }

    if (typeof vehicle === 'string') {
        return vehicle;
    }

    const parts = [
        vehicle.make,
        vehicle.model,
        vehicle.variant,
        vehicle.year,
        vehicle.plate_number || vehicle.plateNumber,
    ].filter(Boolean);

    return parts.join(' / ') || vehicle.description || vehicle.name || 'N/A';
};

const buildDraftPrintableQuote = ({
    quoteMeta,
    customerName,
    customerPhone,
    vehicleInfo,
    selectedParts,
    selectedServices,
    subtotal,
    vat,
    total,
}) => ({
    issuedAt: quoteMeta.issuedAt,
    referenceLabel: 'Ref No',
    referenceValue: quoteMeta.reference,
    customerName: customerName || 'Walk-in Customer',
    customerPhone: customerPhone || '',
    vehicleInfo: vehicleInfo || 'N/A',
    subtotal,
    vat,
    total,
    items: [
        ...selectedParts.map((part) => ({
            id: `part-${part.id}`,
            quantity: Number(part.quantity ?? 1),
            name: part.name,
            subtitle: part.sku || 'Pricelist item',
            unitPrice: Number(part.price ?? 0),
            lineTotal: Number((part.price ?? 0) * (part.quantity ?? 1)),
        })),
        ...selectedServices.map((service) => ({
            id: `service-${service.id}`,
            quantity: 1,
            name: service.name,
            subtitle: 'Service / Labor',
            unitPrice: Number(service.price ?? 0),
            lineTotal: Number(service.price ?? 0),
        })),
    ],
});

const buildRetrievedPrintableQuote = (quote) => {
    if (!quote) {
        return null;
    }

    return {
        issuedAt: quote.estimate?.issued_at || quote.estimate?.created_at || new Date(),
        referenceLabel: 'Quote No',
        referenceValue: quote.estimate?.estimate_number || 'N/A',
        validUntil: quote.estimate?.valid_until || null,
        customerName: quote.customer?.name || 'Walk-in Customer',
        customerPhone: quote.customer?.phone || '',
        vehicleInfo: formatVehicleSummary(quote.vehicle),
        subtotal: Number(quote.estimate?.subtotal ?? 0),
        vat: Number(quote.estimate?.tax_total ?? 0),
        total: Number(quote.estimate?.grand_total ?? 0),
        items: (quote.items ?? []).map((item) => ({
            id: item.id || `${item.product_id || item.service_id || 'line'}-${item.line_type || 'item'}`,
            quantity: Number(item.quantity ?? 1),
            name: item.product_name || item.service_name || 'Quotation line',
            subtitle: item.line_type === 'service' ? 'Service / Labor' : 'Product',
            unitPrice: Number(item.unit_price ?? 0),
            lineTotal: Number(item.line_total ?? 0),
        })),
    };
};

const PhaseBackButton = ({ onClick, label }) => (
    <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-950"
    >
        <ChevronLeft className="h-4 w-4" />
        {label}
    </button>
);

const PublicEstimate = () => {
    const [searchParams] = useSearchParams();
    const packageShelfRef = useRef(null);
    const [workflowStage, setWorkflowStage] = useState('choice');
    const [mode, setMode] = useState('estimate');
    const [estimatePhase, setEstimatePhase] = useState('details');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const { vehicle, updateVehicle, clearVehicle, hasVehicle } = usePublicVehicleSelection({ includePlate: true, syncToSearch: true });
    const { packages: vehiclePackages, loading: vehiclePackagesLoading, error: vehiclePackagesError } = useVehiclePackages(vehicle);
    const [selectedParts, setSelectedParts] = useState([]);
    const [selectedServices, setSelectedServices] = useState([]);
    const [partSearch, setPartSearch] = useState('');
    const [sortBy, setSortBy] = useState('name-asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [focusedProduct, setFocusedProduct] = useState(null);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [showSummaryDrawer, setShowSummaryDrawer] = useState(false);
    const [printSource, setPrintSource] = useState('draft');
    const [lookupEstimateNumber, setLookupEstimateNumber] = useState('');
    const [lookupPhone, setLookupPhone] = useState('');
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [retrievedQuote, setRetrievedQuote] = useState(null);
    const [quoteMeta, setQuoteMeta] = useState(() => createQuoteMeta());
    const [isDesktopDock, setIsDesktopDock] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }

        return window.matchMedia(DESKTOP_DOCK_QUERY).matches;
    });

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
        vehicleModel: vehicle.model,
        vehicleYear: vehicle.year,
    });
    const { services: availableServices, loading: servicesLoading, error: servicesError } = useServiceCatalog();

    useEffect(() => {
        setCurrentPage(1);
    }, [partSearch, sortBy, vehicle.model, vehicle.year]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const mediaQuery = window.matchMedia(DESKTOP_DOCK_QUERY);
        const syncLayout = (event) => {
            setIsDesktopDock(event.matches);
        };

        setIsDesktopDock(mediaQuery.matches);

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', syncLayout);
            return () => mediaQuery.removeEventListener('change', syncLayout);
        }

        mediaQuery.addListener(syncLayout);
        return () => mediaQuery.removeListener(syncLayout);
    }, []);

    useEffect(() => {
        if (mode !== 'estimate') {
            setShowSummaryDrawer(false);
            return;
        }

        setShowSummaryDrawer(estimatePhase === 'summary');
    }, [estimatePhase, mode]);

    useEffect(() => {
        if (!showSummaryDrawer || isDesktopDock || mode !== 'estimate') {
            return undefined;
        }

        const scrollY = window.scrollY;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        const previousBodyOverflow = document.body.style.overflow;
        const previousBodyPosition = document.body.style.position;
        const previousBodyTop = document.body.style.top;
        const previousBodyWidth = document.body.style.width;
        const previousBodyLeft = document.body.style.left;
        const previousBodyRight = document.body.style.right;

        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';

        return () => {
            document.documentElement.style.overflow = previousHtmlOverflow;
            document.body.style.overflow = previousBodyOverflow;
            document.body.style.position = previousBodyPosition;
            document.body.style.top = previousBodyTop;
            document.body.style.width = previousBodyWidth;
            document.body.style.left = previousBodyLeft;
            document.body.style.right = previousBodyRight;
            window.scrollTo(0, scrollY);
        };
    }, [showSummaryDrawer, isDesktopDock, mode]);
    const incomingPackageKey = searchParams.get('packageKey') || '';
    const incomingServiceGroup = searchParams.get('serviceGroup') || '';
    const highlightedVehiclePackageKey = incomingPackageKey.startsWith('vehicle-') ? incomingPackageKey : incomingServiceGroup ? `vehicle-${incomingServiceGroup}` : '';
    const vehicleInfo = [vehicle.displayLabel, vehicle.plateNo].filter(Boolean).join(' / ');

    useEffect(() => {
        if (!highlightedVehiclePackageKey || !hasVehicle) {
            return;
        }

        setWorkflowStage('active');
        setMode('estimate');
        setEstimatePhase('catalog');
    }, [hasVehicle, highlightedVehiclePackageKey]);

    useEffect(() => {
        if (mode !== 'estimate' || !hasVehicle) {
            return;
        }

        if (!highlightedVehiclePackageKey || vehiclePackagesLoading || vehiclePackages.length === 0) {
            return;
        }

        packageShelfRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        });
    }, [mode, hasVehicle, highlightedVehiclePackageKey, vehiclePackagesLoading, vehiclePackages.length]);

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
        setSelectedServices((services) => {
            const existing = services.find((selected) => selected.id === service.id);
            if (existing) {
                return services.filter((selected) => selected.id !== service.id);
            }

            return [...services, {
                ...service,
                price: Number(service.price ?? 0),
                quantity: 1,
            }];
        });
    };

    const addSuggestedPart = (recommendation) => {
        const matchedProduct = recommendation.recommendedProduct || null;
        const productId = recommendation.recommendedProductId || matchedProduct?.id;

        if (!productId || !matchedProduct) {
            return;
        }

        const recommendedPrice = Number(
            recommendation.resolvedPrice
            ?? recommendation.recommendedPrice
            ?? matchedProduct.price
            ?? 0
        );

        setSelectedParts((parts) => {
            const existing = parts.find((part) => part.id === productId);
            const recommendationRuleId = recommendation.packageItemId || recommendation.ruleId || null;

            if (existing) {
                return parts.map((part) => (part.id === productId ? {
                    ...part,
                    isUpsell: true,
                    recommendationRuleId: recommendationRuleId || part.recommendationRuleId || null,
                    price: Math.min(Number(part.price ?? recommendedPrice), recommendedPrice),
                } : part));
            }

            return [...parts, {
                id: matchedProduct.id,
                name: matchedProduct.name,
                sku: matchedProduct.sku,
                price: recommendedPrice,
                category: matchedProduct.category,
                model: matchedProduct.model,
                quantity: 1,
                isUpsell: true,
                recommendationRuleId,
            }];
        });
    };

    const addSuggestedService = (recommendation) => {
        const recommendedService = recommendation.recommendedService || null;
        const serviceId = recommendation.recommendedServiceId || recommendedService?.id;

        if (!serviceId) {
            return;
        }

        const service = {
            id: serviceId,
            name: recommendation.recommendedServiceName || recommendedService?.name || 'Recommended service',
            price: Number(recommendation.resolvedPrice ?? recommendation.recommendedPrice ?? recommendedService?.price ?? 0),
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

    const addBundleToEstimate = (_pkg, tier) => {
        if (!tier?.items?.length) {
            return;
        }

        tier.items.forEach((item) => {
            const isService = (item.consequentKind || item.consequent_kind) === 'service';
            if (isService) {
                addSuggestedService(item);
                return;
            }

            addSuggestedPart(item);
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
    const selectedProductIds = selectedParts.map((part) => part.id);
    const selectedServiceIds = selectedServices.map((service) => service.id);
    const summaryFocusProduct = focusedProduct || selectedParts[selectedParts.length - 1] || null;
    const summaryFocusSelection = selectedParts.find((part) => part.id === summaryFocusProduct?.id);
    const draftPrintableQuote = buildDraftPrintableQuote({
        quoteMeta,
        customerName,
        customerPhone,
        vehicleInfo,
        selectedParts,
        selectedServices,
        subtotal,
        vat,
        total,
    });
    const retrievedPrintableQuote = buildRetrievedPrintableQuote(retrievedQuote);
    const printableQuote = printSource === 'retrieved' ? retrievedPrintableQuote : draftPrintableQuote;

    const handleLookupQuote = async () => {
        setLookupLoading(true);
        setLookupError('');

        try {
            const estimate = await lookupPublicEstimate(lookupEstimateNumber, lookupPhone);
            setRetrievedQuote(estimate);
        } catch (lookupFailure) {
            setRetrievedQuote(null);
            setLookupError(lookupFailure.message || 'Unable to retrieve quotation.');
        } finally {
            setLookupLoading(false);
        }
    };

    const openPreview = (source = 'draft') => {
        if (source === 'draft' && !hasItems) {
            return;
        }

        if (source === 'retrieved' && !retrievedPrintableQuote) {
            return;
        }

        setShowSummaryDrawer(false);
        setPrintSource(source);
        if (source === 'draft') {
            setQuoteMeta(createQuoteMeta());
        }
        setShowPrintPreview(true);
    };

    const resetForm = () => {
        setCustomerName('');
        setCustomerPhone('');
        clearVehicle();
        setSelectedParts([]);
        setSelectedServices([]);
        setPartSearch('');
        setSortBy('name-asc');
        setCurrentPage(1);
        setFocusedProduct(null);
        setShowSummaryDrawer(false);
        setShowPrintPreview(false);
        setPrintSource('draft');
        setEstimatePhase('details');
        setQuoteMeta(createQuoteMeta());
    };

    const resetPriceListView = () => {
        setPartSearch('');
        setSortBy('name-asc');
        setCurrentPage(1);
    };

    const handleModeSelect = (nextMode) => {
        setWorkflowStage('active');
        setMode(nextMode);
        setEstimatePhase(nextMode === 'estimate'
            ? (hasItems ? 'summary' : (hasVehicle || customerName || customerPhone ? 'catalog' : 'details'))
            : 'details');
    };

    const goToModeChoice = () => {
        setWorkflowStage('choice');
        setShowSummaryDrawer(false);
    };

    const contentShiftClass = mode === 'estimate' && showSummaryDrawer && isDesktopDock
        ? 'md:pr-[29rem]'
        : '';

    const summaryPanelClassName = isDesktopDock
        ? 'fixed inset-y-6 right-6 z-50 flex w-[440px] min-h-0 flex-col overflow-hidden rounded-[30px] border border-primary-200 bg-primary-50 shadow-[0_32px_90px_rgba(15,23,42,0.18)] print:hidden'
        : 'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] min-h-0 flex-col overflow-hidden rounded-t-[32px] border border-primary-200 border-b-0 bg-primary-50 shadow-[0_32px_90px_rgba(15,23,42,0.28)] print:hidden';

    return (
        <div className="bg-primary-50 min-h-screen relative font-sans text-primary-900 pb-28 print:bg-white print:p-0 print:m-0 print:min-h-0 print:block">
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
                            {workflowStage === 'choice'
                                ? 'Get Estimate'
                                : mode === 'retrieve'
                                    ? 'Retrieve Quote'
                                    : hasVehicle
                                        ? `Estimate for ${vehicle.displayLabel}`
                                        : 'Build Estimate'}
                        </h1>
                        <p className="mt-4 text-lg text-primary-600 max-w-2xl">
                            {workflowStage === 'choice'
                                ? 'Phase 1 only shows the two main actions. Choose Build Estimate or Retrieve Quote first, then move into the next step of the flow.'
                                : mode === 'retrieve'
                                    ? 'This flow is dedicated to looking up a saved quote and printing it without rebuilding the cart.'
                                    : estimatePhase === 'summary'
                                        ? 'You are now in the review phase, where the quote cart shows line items, recommendations, and smart packages together.'
                                        : 'This estimate now moves by phase so the screen stays focused while you choose customer details, parts, and services.'}
                        </p>
                    </div>
                </div>
            </section>

            <section className={`relative z-10 max-w-[1600px] mx-auto px-4 md:px-8 xl:px-12 py-2 transition-[padding] duration-300 print:hidden ${contentShiftClass}`}>
                <div className="surface mb-8 p-4 md:p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="max-w-2xl">
                            <p className="text-xs font-bold tracking-[0.28em] uppercase text-primary-400">{workflowStage === 'choice' ? 'Phase 1' : mode === 'retrieve' ? 'Phase 2' : 'Estimate flow'}</p>
                            <h2 className="mt-2 text-2xl font-display font-semibold text-primary-950">
                                {workflowStage === 'choice'
                                    ? 'Choose the flow you need right now'
                                    : mode === 'retrieve'
                                        ? 'Retrieve and print a saved quote'
                                        : ESTIMATE_PHASES.find((phase) => phase.id === estimatePhase)?.label || 'Estimate flow'}
                            </h2>
                            <p className="mt-2 text-sm text-primary-500">
                                {workflowStage === 'choice'
                                    ? 'Start with one clear action instead of loading the whole estimation workspace at once.'
                                    : mode === 'retrieve'
                                        ? 'This path stays separate from estimate building so the screen only shows the retrieval work.'
                                        : ESTIMATE_PHASES.find((phase) => phase.id === estimatePhase)?.description}
                            </p>
                        </div>
                        {workflowStage === 'choice' ? (
                            <div className="grid w-full gap-2 rounded-[26px] border border-primary-200 bg-white/80 p-2 shadow-sm sm:max-w-[520px] sm:grid-cols-2">
                                {MODE_OPTIONS.map((option) => {
                                    const Icon = option.icon;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => handleModeSelect(option.id)}
                                            className="rounded-[20px] px-4 py-4 text-left text-primary-600 transition-all duration-200 hover:bg-primary-50 hover:text-primary-950"
                                        >
                                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-accent-primary">
                                                <Icon className="h-5 w-5" />
                                            </span>
                                            <span className="mt-4 block text-sm font-semibold">{option.label}</span>
                                            <span className="mt-1 block text-xs text-primary-500">{option.description}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : mode === 'estimate' ? (
                            <div className="grid w-full gap-2 rounded-[26px] border border-primary-200 bg-white/80 p-2 shadow-sm lg:max-w-[760px] lg:grid-cols-3">
                                {ESTIMATE_PHASES.map((phase, index) => {
                                    const isActive = estimatePhase === phase.id;
                                    const isComplete = index < ESTIMATE_PHASES.findIndex((item) => item.id === estimatePhase);
                                    return (
                                        <button
                                            key={phase.id}
                                            type="button"
                                            onClick={() => setEstimatePhase(phase.id)}
                                            className={`rounded-[20px] px-4 py-4 text-left transition-all duration-200 ${isActive
                                                ? 'bg-primary-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]'
                                                : isComplete
                                                    ? 'bg-accent-primary/5 text-primary-950'
                                                    : 'bg-transparent text-primary-600 hover:bg-primary-50 hover:text-primary-950'
                                                }`}
                                        >
                                            <span className={`text-[0.65rem] font-bold uppercase tracking-[0.22em] ${isActive ? 'text-white/70' : 'text-primary-400'}`}>{phase.phase}</span>
                                            <span className="mt-3 block text-sm font-semibold">{phase.label}</span>
                                            <span className={`mt-1 block text-xs ${isActive ? 'text-white/70' : 'text-primary-500'}`}>{phase.description}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center gap-3">
                                <PhaseBackButton onClick={goToModeChoice} label="Change Flow" />
                            </div>
                        )}
                    </div>
                </div>

                {workflowStage === 'active' && (mode === 'retrieve' ? (
                    <PublicQuoteLookupCard
                        estimateNumber={lookupEstimateNumber}
                        phone={lookupPhone}
                        onEstimateNumberChange={setLookupEstimateNumber}
                        onPhoneChange={setLookupPhone}
                        onLookup={handleLookupQuote}
                        loading={lookupLoading}
                        error={lookupError}
                        result={retrievedQuote}
                        onPreviewPrint={() => openPreview('retrieved')}
                    />
                ) : (
                    <div className="grid grid-cols-1 gap-8">
                        <div className="space-y-8">
                            {estimatePhase === 'details' && (
                            <div className="surface p-6 md:p-7">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="block text-sm font-semibold text-primary-700 mb-2">Customer Name</label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                                            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in customer" className="input pl-10 py-2.5 text-sm" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-primary-700 mb-2">Phone Number</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                                            <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="09XX XXX XXXX" className="input pl-10 py-2.5 text-sm" />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6">
                                    <PublicVehicleSelector
                                        vehicle={vehicle}
                                        onChange={updateVehicle}
                                        onClear={clearVehicle}
                                        includePlate
                                        title="Tell us which Mitsubishi you are shopping for"
                                        subtitle="Model-first browsing unlocks vehicle-matched parts, visual service packages, and smarter Good / Better / Best bundle offers."
                                    />
                                </div>

                                {hasVehicle && (
                                    <div className="mt-6 rounded-[28px] border border-accent-blue/20 bg-gradient-to-r from-accent-blue/8 via-white to-accent-primary/5 px-5 py-5 shadow-sm">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-blue/20 bg-white text-accent-blue shadow-sm">
                                                    <Sparkles className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold uppercase tracking-[0.26em] text-accent-blue/70">Vehicle context active</p>
                                                    <h2 className="mt-2 text-2xl font-display font-semibold text-primary-950">{`For your ${vehicle.displayLabel}`}</h2>
                                                    <p className="mt-2 text-sm text-primary-500">Featured service packages, recommended labor, and clicked-part bundles now adapt to the Mitsubishi you selected.</p>
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-primary-200 bg-white/90 px-4 py-3 text-sm text-primary-500">
                                                <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-400">Vehicle summary</p>
                                                <p className="mt-2 text-base font-semibold text-primary-950">{vehicleInfo || vehicle.displayLabel}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            )}

                            {estimatePhase === 'catalog' && hasVehicle && (
                                <div ref={packageShelfRef}>
                                    <VehiclePackageShowcase
                                        vehicle={vehicle}
                                        packages={vehiclePackages}
                                        loading={vehiclePackagesLoading}
                                        error={vehiclePackagesError}
                                        mode="estimate"
                                        onAddBundle={addBundleToEstimate}
                                        selectedProductIds={selectedProductIds}
                                        selectedServiceIds={selectedServiceIds}
                                        title="Vehicle-first service bundles"
                                        subtitle="Visual package cards for the vehicle you selected, complete with included parts, included labor, normal total, package total, and savings."
                                        emptyLabel={`No featured packages are ready for ${vehicle.displayLabel} yet.`}
                                        highlightPackageKey={highlightedVehiclePackageKey}
                                    />
                                </div>
                            )}

                            {estimatePhase === 'catalog' && (
                            <div className="surface p-6">
                                <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-end lg:justify-between">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-accent-primary/5 border border-accent-primary/20 flex items-center justify-center">
                                            <Package className="w-5 h-5 text-accent-primary" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-display font-semibold text-primary-950">{hasVehicle ? `Genuine Parts for ${vehicle.displayLabel}` : 'Genuine Parts Pricelist'}</h3>
                                            <p className="text-sm text-primary-500">{hasVehicle ? 'Showing vehicle-aware parts results and smart bundle anchors from the live Mitsubishi pricelist.' : 'Showing 12 priced items at a time from the current pricelist.'}</p>
                                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-primary-400">Click a part to add it and reveal its Good / Better / Best bundle options.</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                        <div className="relative w-full sm:w-72">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-500" />
                                            <input
                                                type="text"
                                                placeholder={hasVehicle ? `Search parts for ${vehicle.model}...` : "Search by part name, SKU, or model..."}
                                                value={partSearch}
                                                onChange={(event) => setPartSearch(event.target.value)}
                                                className="input pl-10 py-2.5 text-sm"
                                            />
                                        </div>
                                        <div className="relative min-w-[220px]">
                                            <ArrowUpDown className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                                            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                                            <select
                                                value={sortBy}
                                                onChange={(event) => setSortBy(event.target.value)}
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
                                            {hasVehicle ? `No priced parts matched ${vehicle.displayLabel} with your current search.` : 'No priced parts matched your search.'}
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
                            )}

                            {estimatePhase === 'catalog' && focusedProduct && (
                                <ProductPackageSuggestions
                                    product={focusedProduct}
                                    vehicleModelId={vehicle.model || focusedProduct.model || focusedProduct.vehicleModelName || ''}
                                    vehicleContext={vehicle}
                                    anchorQuantity={focusedPartSelection?.quantity ?? 1}
                                    onAddProduct={addSuggestedPart}
                                    onAddService={addSuggestedService}
                                    onAddBundle={addBundleToEstimate}
                                    selectedProductIds={selectedProductIds}
                                    selectedServiceIds={selectedServiceIds}
                                    title="Good / Better / Best smart bundles"
                                    subtitle="Vehicle-aware smart upsell bundles of matched Mitsubishi parts and labor for the selected anchor part."
                                    highlightedPackageKey={incomingPackageKey}
                                    bundleMode="estimate"
                                />
                            )}

                            {estimatePhase === 'catalog' && (
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
                            )}

                            {estimatePhase === 'details' && (
                                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                                    <PhaseBackButton onClick={goToModeChoice} label="Back to Flow Choice" />
                                    <Button variant="primary" onClick={() => setEstimatePhase('catalog')}>
                                        Continue to Parts and Services
                                    </Button>
                                </div>
                            )}

                            {estimatePhase === 'catalog' && (
                                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                                    <PhaseBackButton onClick={() => setEstimatePhase('details')} label="Back to Customer + Vehicle" />
                                    <Button variant="primary" onClick={() => setEstimatePhase('summary')}>
                                        Review Quote
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </section>

            {mode === 'estimate' && estimatePhase === 'summary' && (
                <motion.aside
                    className={summaryPanelClassName}
                    initial={{ opacity: 0, x: isDesktopDock ? 28 : 0, y: isDesktopDock ? 0 : 28, scale: isDesktopDock ? 1 : 0.98 }}
                    animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: isDesktopDock ? 24 : 0, y: isDesktopDock ? 0 : 24, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                                    <div className={`border-b border-primary-200 bg-white/90 ${isDesktopDock ? 'px-5 py-5 md:px-6' : 'px-4 py-4 sm:px-5 sm:py-5'}`}>
                                        {!isDesktopDock && <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-primary-200" />}
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <span className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-primary-500">
                                                    Public Quotation
                                                </span>
                                                <h3 className="mt-2 text-xl font-display font-semibold text-primary-950">Quotation Summary</h3>
                                                <p className="mt-1 text-sm text-primary-500">Review the draft while continuing to browse parts and smart packages.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setEstimatePhase('catalog')}
                                                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary-200 bg-primary-50 text-primary-500 transition hover:border-primary-300 hover:bg-white hover:text-primary-950"
                                                aria-label="Back to parts and services"
                                            >
                                                <ChevronLeft className="h-5 w-5" />
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

                                    <div className={`flex-1 min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 touch-pan-y ${isDesktopDock ? 'md:px-6 md:py-5' : 'sm:px-5 sm:py-5'}`}>
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

                                        {summaryFocusProduct && (
                                            <ProductPackageSuggestions
                                                product={summaryFocusProduct}
                                                vehicleModelId={vehicle.model || summaryFocusProduct.model || summaryFocusProduct.vehicleModelName || ''}
                                                vehicleContext={vehicle}
                                                anchorQuantity={summaryFocusSelection?.quantity ?? 1}
                                                onAddProduct={addSuggestedPart}
                                                onAddService={addSuggestedService}
                                                onAddBundle={addBundleToEstimate}
                                                selectedProductIds={selectedProductIds}
                                                selectedServiceIds={selectedServiceIds}
                                                title="Recommendations and packages in this cart"
                                                subtitle="Use the review phase to add the remaining upsell items and labor for the selected product without going back to the long catalog view."
                                                highlightedPackageKey={incomingPackageKey}
                                                bundleMode="estimate"
                                            />
                                        )}
                                    </div>

                                    <div className={`border-t border-primary-200 bg-white/95 px-4 py-4 backdrop-blur ${isDesktopDock ? 'md:px-6 md:py-5' : 'pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-5 sm:py-5'}`}>
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
                                            <Button variant="primary" fullWidth leftIcon={<Printer className="h-4 w-4" />} onClick={() => openPreview('draft')} isDisabled={!hasItems}>
                                                Printable Preview
                                            </Button>
                                        </div>
                                    </div>
                                </motion.aside>
            )}

            <Modal
                isOpen={showPrintPreview}
                onClose={() => setShowPrintPreview(false)}
                title="Print Preview"
                size="lg"
            >
                {printableQuote ? (
                    <>
                        <div className="receipt-preview" style={{ fontFamily: 'Inter, Arial, sans-serif' }}>
                            <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '12px', marginBottom: '12px' }}>
                                <img src="/LogoLimen.jpg" alt="Limen Logo" style={{ height: '48px', margin: '0 auto 6px', display: 'block', filter: 'grayscale(1) contrast(1.3)' }} />
                                <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>LIMEN AUTO PARTS CENTER</h2>
                                <p style={{ fontSize: '11px', margin: '2px 0 0', color: '#555' }}>1308, 264 Epifanio de los Santos Ave, Pasay City, 1308 Metro Manila</p>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', gap: '16px' }}>
                                <div>
                                    <div><span style={{ fontWeight: '600' }}>Prepared for: </span><span>{printableQuote.customerName}</span></div>
                                    {printableQuote.customerPhone && <div><span style={{ fontWeight: '600' }}>Phone: </span><span>{printableQuote.customerPhone}</span></div>}
                                    <div><span style={{ fontWeight: '600' }}>Vehicle: </span><span>{printableQuote.vehicleInfo}</span></div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div><span style={{ fontWeight: '600' }}>Date: </span><span>{formatPrintDate(printableQuote.issuedAt)}</span></div>
                                    <div><span style={{ fontWeight: '600' }}>{printableQuote.referenceLabel}: </span><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{printableQuote.referenceValue}</span></div>
                                    {printableQuote.validUntil && <div><span style={{ fontWeight: '600' }}>Valid Until: </span><span>{formatPrintDate(printableQuote.validUntil)}</span></div>}
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
                                    {printableQuote.items.map((item) => (
                                        <tr key={item.id}>
                                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>{item.quantity}</td>
                                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>
                                                {item.name}
                                                {item.subtitle && <span style={{ display: 'block', fontSize: '10px', color: '#888' }}>{item.subtitle}</span>}
                                            </td>
                                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
                                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(item.lineTotal)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                                <div style={{ width: '220px', fontSize: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #ddd' }}>
                                        <span style={{ fontWeight: '600' }}>Subtotal</span>
                                        <span>{formatCurrency(printableQuote.subtotal)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #ddd' }}>
                                        <span style={{ fontWeight: '600' }}>VAT (12%)</span>
                                        <span>{formatCurrency(printableQuote.vat)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '2px solid black', marginTop: '4px', fontWeight: '800', fontSize: '14px' }}>
                                        <span>Total</span>
                                        <span>{formatCurrency(printableQuote.total)}</span>
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
                    </>
                ) : null}
            </Modal>
        </div>
    );
};

export default PublicEstimate;



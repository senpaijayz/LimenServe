import { useEffect, useMemo, useRef, useState } from 'react';
import { motion as Motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Minus, Calculator, Printer, User, Phone, Wrench, X, Package, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';
import useProductCatalog from '../../../hooks/useProductCatalog';
import useServiceCatalog from '../../../hooks/useServiceCatalog';
import usePublicVehicleSelection from '../../../hooks/usePublicVehicleSelection';
import useVehiclePackages from '../../../hooks/useVehiclePackages';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import { createEstimate, lookupPublicEstimate } from '../../../services/estimatesApi';
import ProductPackageSuggestions from '../components/ProductPackageSuggestions';
import PublicQuoteLookupCard from '../components/PublicQuoteLookupCard';
import PublicVehicleSelector from '../components/PublicVehicleSelector';
import VehiclePackageShowcase from '../components/VehiclePackageShowcase';
import { buildSmartQuoteModel } from '../utils/quoteRecommendationModel';

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

const QUOTE_VALID_DAYS = 30;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const addDaysAsIsoDate = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
};

const isUuid = (value) => UUID_PATTERN.test(String(value || ''));

const buildEstimatePayload = ({
    customerName,
    customerPhone,
    vehicle,
    selectedParts,
    selectedServices,
    subtotal,
    vat,
    total,
}) => {
    const issuedAt = new Date();
    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();
    const customer = {
        customer_type: 'walk_in',
        name: trimmedName || 'Walk-in Customer',
        phone: trimmedPhone || null,
        metadata: {
            source: 'public_estimate_page',
        },
    };
    const vehiclePayload = vehicle.model ? {
        make: 'Mitsubishi',
        model_name: vehicle.model,
        year: vehicle.year || null,
        plate_no: vehicle.plateNo || null,
        metadata: {
            displayLabel: vehicle.displayLabel || null,
            source: 'public_estimate_page',
        },
    } : undefined;

    return {
        customer,
        ...(vehiclePayload ? { vehicle: vehiclePayload } : {}),
        estimate: {
            status: 'sent',
            source: 'public',
            note: 'Public estimate generated from LimenServe quote builder.',
            subtotal: Number(subtotal.toFixed(2)),
            discount_total: 0,
            tax_total: Number(vat.toFixed(2)),
            grand_total: Number(total.toFixed(2)),
            issued_at: issuedAt.toISOString(),
            valid_until: addDaysAsIsoDate(QUOTE_VALID_DAYS),
            revision_note: 'Public quote created',
        },
        items: [
            ...selectedParts.map((part) => {
                const quantity = Number(part.quantity ?? 1);
                const unitPrice = Number(part.price ?? 0);

                return {
                    line_type: 'product',
                    product_id: isUuid(part.id) ? part.id : null,
                    product_name: part.name,
                    product_sku: part.sku || null,
                    quantity,
                    unit_price: unitPrice,
                    line_total: Number((unitPrice * quantity).toFixed(2)),
                    recommendation_rule_id: isUuid(part.recommendationRuleId) ? part.recommendationRuleId : null,
                    is_upsell: Boolean(part.isUpsell),
                };
            }),
            ...selectedServices.map((service) => {
                const unitPrice = Number(service.price ?? 0);

                return {
                    line_type: 'service',
                    service_id: isUuid(service.id) ? service.id : null,
                    service_name: service.name,
                    quantity: 1,
                    unit_price: unitPrice,
                    line_total: Number(unitPrice.toFixed(2)),
                    recommendation_rule_id: isUuid(service.recommendationRuleId) ? service.recommendationRuleId : null,
                    is_upsell: Boolean(service.isUpsell),
                };
            }),
        ],
    };
};

const enrichCreatedQuoteWithRequestedLabels = (quote, requestedItems = []) => {
    if (!quote) {
        return null;
    }

    return {
        ...quote,
        items: (quote.items ?? []).map((item, index) => {
            const requestedItem = requestedItems[index] ?? {};

            return {
                ...item,
                product_name: item.product_name || requestedItem.product_name || null,
                product_sku: item.product_sku || requestedItem.product_sku || null,
                service_name: item.service_name || requestedItem.service_name || null,
            };
        }),
    };
};

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
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [retrievedQuote, setRetrievedQuote] = useState(null);
    const [savedDraftQuote, setSavedDraftQuote] = useState(null);
    const [savingQuote, setSavingQuote] = useState(false);
    const [saveError, setSaveError] = useState('');
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
        pageSize: 8,
        searchQuery: partSearch,
        sortBy,
        vehicleModel: vehicle.model,
        vehicleYear: vehicle.year,
        includeCategories: false,
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
        // The quote summary now lives inline with the estimate flow, not as a fixed mobile drawer.
        setShowSummaryDrawer(false);
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
        catalogEntryId: product.catalogEntryId || product.id,
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
        setSavedDraftQuote(null);
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
        setSavedDraftQuote(null);
        setSelectedParts((parts) => parts.filter((part) => part.id !== id));
        if (focusedProduct?.id === id) {
            setFocusedProduct(null);
        }
    };

    const updateQty = (id, qty) => {
        setSavedDraftQuote(null);
        if (qty < 1) {
            removePart(id);
            return;
        }

        setSelectedParts((parts) => parts.map((part) => (part.id === id ? { ...part, quantity: qty } : part)));
    };

    const removeService = (id) => {
        setSavedDraftQuote(null);
        setSelectedServices((services) => services.filter((service) => service.id !== id));
    };

    const toggleService = (service) => {
        setSavedDraftQuote(null);
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
        setSavedDraftQuote(null);
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
        setSavedDraftQuote(null);
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

    const hasItems = selectedParts.length > 0 || selectedServices.length > 0;
    const focusedPartSelection = selectedParts.find((part) => part.id === focusedProduct?.id);
    const totalItemCount = selectedParts.reduce((sum, part) => sum + part.quantity, 0) + selectedServices.length;
    const totalLineCount = selectedParts.length + selectedServices.length;
    const selectedProductIds = selectedParts.map((part) => part.id);
    const selectedServiceIds = selectedServices.map((service) => service.id);
    const summaryFocusProduct = focusedProduct || selectedParts[selectedParts.length - 1] || null;
    const summaryFocusSelection = selectedParts.find((part) => part.id === summaryFocusProduct?.id);
    const quoteFinancialModel = useMemo(() => buildSmartQuoteModel({
        selectedProduct: summaryFocusProduct,
        selectedParts,
        selectedServices,
    }), [summaryFocusProduct, selectedParts, selectedServices]);
    const partsTotal = quoteFinancialModel.totals.partsSubtotal;
    const servicesTotal = quoteFinancialModel.totals.servicesSubtotal;
    const subtotal = quoteFinancialModel.totals.subtotal;
    const vat = quoteFinancialModel.totals.vat;
    const total = quoteFinancialModel.totals.estimatedTotal;
    const savedDraftPrintableQuote = buildRetrievedPrintableQuote(savedDraftQuote);
    const retrievedPrintableQuote = buildRetrievedPrintableQuote(retrievedQuote);
    const printableQuote = printSource === 'retrieved' ? retrievedPrintableQuote : savedDraftPrintableQuote;

    const handleLookupQuote = async () => {
        setLookupLoading(true);
        setLookupError('');

        try {
            const estimate = await lookupPublicEstimate(lookupEstimateNumber);
            setRetrievedQuote(estimate);
        } catch (lookupFailure) {
            setRetrievedQuote(null);
            setLookupError(lookupFailure.message || 'Unable to retrieve quotation.');
        } finally {
            setLookupLoading(false);
        }
    };

    const saveDraftQuote = async () => {
        if (savedDraftQuote?.estimate?.estimate_number) {
            return savedDraftQuote;
        }

        const payload = buildEstimatePayload({
            customerName,
            customerPhone,
            vehicle,
            selectedParts,
            selectedServices,
            subtotal,
            vat,
            total,
        });

        setSavingQuote(true);
        setSaveError('');

        try {
            const createdQuote = await createEstimate(payload);
            const persistedQuote = enrichCreatedQuoteWithRequestedLabels(createdQuote?.estimate, payload.items);

            if (!persistedQuote?.estimate?.estimate_number) {
                throw new Error('The quote was saved, but the saved quote number could not be loaded.');
            }

            setSavedDraftQuote(persistedQuote);
            return persistedQuote;
        } catch (saveFailure) {
            setSavedDraftQuote(null);
            setSaveError(saveFailure.message || 'Unable to save quotation.');
            return null;
        } finally {
            setSavingQuote(false);
        }
    };

    const finishQuote = async () => {
        if (!hasItems) {
            return;
        }

        setPrintSource('draft');
        await saveDraftQuote();
    };

    const openPreview = async (source = 'draft') => {
        if (source === 'draft' && !hasItems) {
            return;
        }

        if (source === 'retrieved' && !retrievedPrintableQuote) {
            return;
        }

        setShowSummaryDrawer(false);
        if (source === 'draft') {
            if (!savedDraftQuote?.estimate?.estimate_number) {
                const persistedQuote = await saveDraftQuote();
                if (!persistedQuote) {
                    return;
                }
            }
        }

        setPrintSource(source);
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
        setSavedDraftQuote(null);
        setSaveError('');
    };

    const resetPriceListView = () => {
        setPartSearch('');
        setSortBy('name-asc');
        setCurrentPage(1);
    };

    const handleVehicleChange = (patch) => {
        setSavedDraftQuote(null);
        if (Object.prototype.hasOwnProperty.call(patch, 'model') || Object.prototype.hasOwnProperty.call(patch, 'year')) {
            setFocusedProduct(null);
        }
        updateVehicle(patch);
    };

    const handleVehicleClear = () => {
        setSavedDraftQuote(null);
        clearVehicle();
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

    const contentShiftClass = '';
    const isCartPanelVisible = false;
    const cartPanelTitle = estimatePhase === 'catalog' ? 'Active Quote Cart' : 'Review and Print';
    const cartPanelDescription = estimatePhase === 'catalog'
        ? 'Added parts and services stay visible while you browse. Adjust quantities or remove items before review.'
        : savedDraftQuote?.estimate?.estimate_number
            ? 'Quote finished. Use this generated quote number to retrieve it later.'
            : 'Review the final draft, add last recommendations, then finish to generate a retrievable quote number.';

    const summaryPanelClassName = isDesktopDock
        ? 'fixed inset-y-6 right-6 z-50 flex w-[440px] min-h-0 flex-col overflow-hidden rounded-[30px] border border-primary-200 bg-primary-50 shadow-[0_32px_90px_rgba(15,23,42,0.18)] print:hidden'
        : 'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] min-h-0 flex-col overflow-hidden rounded-t-[32px] border border-primary-200 border-b-0 bg-primary-50 shadow-[0_32px_90px_rgba(15,23,42,0.28)] print:hidden';
    const quoteNumber = savedDraftQuote?.estimate?.estimate_number || '';
    const quoteSummaryCard = (
        <Motion.aside
            className="overflow-hidden rounded-[32px] border border-primary-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
        >
            <div className="bg-primary-950 px-5 py-5 text-white sm:px-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.26em] text-white/55">Live quote summary</p>
                        <h3 className="mt-2 text-2xl font-display font-bold tracking-tight">Your quotation</h3>
                        <p className="mt-2 text-sm text-white/65">
                            {estimatePhase === 'summary'
                                ? 'Review totals, adjust lines, then finish to generate a retrievable quote number.'
                                : 'Your selected parts and services stay visible while you browse.'}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-right">
                        <span className="block text-[0.62rem] font-bold uppercase tracking-[0.22em] text-white/50">Total</span>
                        <span className="mt-1 block text-lg font-display font-bold text-white">{formatCurrency(total)}</span>
                    </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3">
                        <span className="block text-[0.62rem] font-bold uppercase tracking-[0.2em] text-white/45">Qty</span>
                        <span className="mt-1 block text-lg font-display font-bold">{totalItemCount}</span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3">
                        <span className="block text-[0.62rem] font-bold uppercase tracking-[0.2em] text-white/45">Lines</span>
                        <span className="mt-1 block text-lg font-display font-bold">{totalLineCount}</span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3">
                        <span className="block text-[0.62rem] font-bold uppercase tracking-[0.2em] text-white/45">VAT</span>
                        <span className="mt-1 block text-lg font-display font-bold">12%</span>
                    </div>
                </div>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
                {quoteNumber && (
                    <div className="rounded-[24px] border border-accent-success/25 bg-accent-success/10 p-4">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-accent-success">Quote created</p>
                        <p className="mt-2 text-2xl font-display font-bold text-primary-950">{quoteNumber}</p>
                        <p className="mt-2 text-sm text-primary-600">Stored in Supabase. Customers can retrieve this later using the quote number.</p>
                    </div>
                )}

                <div className="rounded-[24px] border border-primary-200 bg-primary-50/70 p-4">
                    <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-accent-primary" />
                        <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-primary-500">Customer context</p>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm">
                        <div className="rounded-2xl bg-white px-3 py-3">
                            <span className="block text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary-400">Name</span>
                            <span className="mt-1 block font-semibold text-primary-950">{customerName || 'Walk-in Customer'}</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                            <div className="rounded-2xl bg-white px-3 py-3">
                                <span className="block text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary-400">Phone</span>
                                <span className="mt-1 block font-semibold text-primary-950">{customerPhone || 'Optional'}</span>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3">
                                <span className="block text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary-400">Vehicle</span>
                                <span className="mt-1 block font-semibold text-primary-950">{vehicleInfo || 'Optional'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {!hasItems ? (
                    <div className="rounded-[24px] border border-dashed border-primary-300 bg-white px-5 py-8 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-accent-primary/20 bg-accent-primary/5">
                            <Calculator className="h-7 w-7 text-accent-primary" />
                        </div>
                        <p className="text-lg font-display font-semibold text-primary-950">No quote lines yet</p>
                        <p className="mt-2 text-sm text-primary-500">Add a part or service to build a customer-ready quotation.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {selectedParts.length > 0 && (
                            <div className="rounded-[24px] border border-primary-200 bg-white p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-primary-500">Parts</p>
                                        <p className="mt-1 text-sm text-primary-500">Quantities are editable.</p>
                                    </div>
                                    <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-600">{selectedParts.length} selected</span>
                                </div>
                                <div className="space-y-3">
                                    {selectedParts.map((part) => (
                                        <div key={part.id} className="rounded-2xl border border-primary-200 bg-primary-50/70 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-primary-950">{part.name}</p>
                                                    <p className="mt-1 text-xs text-primary-500">{part.sku || 'Pricelist item'}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removePart(part.id)}
                                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary-400 transition hover:bg-accent-danger/10 hover:text-accent-danger"
                                                    aria-label={`Remove ${part.name}`}
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between gap-3">
                                                <div className="flex min-h-[44px] items-center rounded-2xl border border-primary-200 bg-white p-1">
                                                    <button type="button" onClick={() => updateQty(part.id, part.quantity - 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-primary-500 transition hover:bg-primary-50 hover:text-primary-950" aria-label={`Decrease ${part.name} quantity`}>
                                                        <Minus className="h-4 w-4" />
                                                    </button>
                                                    <span className="w-9 text-center text-sm font-semibold text-primary-950">{part.quantity}</span>
                                                    <button type="button" onClick={() => updateQty(part.id, part.quantity + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-primary-500 transition hover:bg-primary-50 hover:text-primary-950" aria-label={`Increase ${part.name} quantity`}>
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
                            <div className="rounded-[24px] border border-primary-200 bg-white p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-primary-500">Services</p>
                                        <p className="mt-1 text-sm text-primary-500">Labor and maintenance lines.</p>
                                    </div>
                                    <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-600">{selectedServices.length} selected</span>
                                </div>
                                <div className="space-y-3">
                                    {selectedServices.map((service) => (
                                        <div key={service.id} className="flex min-h-[64px] items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/70 p-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-primary-950">{service.name}</p>
                                                <p className="mt-1 text-xs text-primary-500">Service / labor line</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-accent-blue">{formatCurrency(service.price)}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeService(service.id)}
                                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary-400 transition hover:bg-accent-danger/10 hover:text-accent-danger"
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

                <div className="rounded-[26px] border border-primary-200 bg-primary-50/80 p-4">
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm text-primary-600">
                            <span>Parts subtotal</span>
                            <span className="font-semibold text-primary-950">{formatCurrency(partsTotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-primary-600">
                            <span>Services subtotal</span>
                            <span className="font-semibold text-primary-950">{formatCurrency(servicesTotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-primary-600">
                            <span>VAT (12%)</span>
                            <span className="font-semibold text-primary-950">{formatCurrency(vat)}</span>
                        </div>
                        <div className="flex justify-between border-t border-primary-200 pt-3 text-lg font-bold text-primary-950">
                            <span>Estimated total</span>
                            <span className="text-accent-blue">{formatCurrency(total)}</span>
                        </div>
                    </div>
                </div>

                {saveError && (
                    <div className="rounded-2xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                        {saveError}
                    </div>
                )}

                {!hasItems && estimatePhase !== 'catalog' && (
                    <div className="rounded-2xl border border-accent-warning/20 bg-accent-warning/10 px-4 py-3 text-sm text-primary-700">
                        Add at least one part or service before finishing the quote.
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <Button
                        variant="secondary"
                        fullWidth
                        onClick={estimatePhase === 'catalog' ? resetForm : () => setEstimatePhase('catalog')}
                    >
                        {estimatePhase === 'catalog' ? 'Reset Quote' : 'Add More Parts'}
                    </Button>
                    {estimatePhase === 'catalog' ? (
                        <Button variant="primary" fullWidth onClick={() => setEstimatePhase('summary')} isDisabled={!hasItems}>
                            Review Quote
                        </Button>
                    ) : quoteNumber ? (
                        <Button variant="primary" fullWidth leftIcon={<Printer className="h-4 w-4" />} onClick={() => openPreview('draft')}>
                            Printable Preview
                        </Button>
                    ) : (
                        <Button variant="primary" fullWidth onClick={finishQuote} isDisabled={!hasItems} isLoading={savingQuote}>
                            Finish Quote
                        </Button>
                    )}
                </div>
            </div>
        </Motion.aside>
    );

    const reviewWorkspace = (
        <div className="space-y-6">
            <div className="overflow-hidden rounded-[36px] border border-primary-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
                <div className="grid gap-6 bg-gradient-to-br from-white via-primary-50 to-accent-blue/5 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div>
                        <p className="text-[0.7rem] font-bold uppercase tracking-[0.28em] text-accent-blue">Final review</p>
                        <h3 className="mt-3 text-3xl font-display font-bold tracking-tight text-primary-950 md:text-4xl">
                            Confirm the quote before sending it to the customer.
                        </h3>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-600">
                            Review the customer context, selected parts, service labor, and estimated total. When you finish, LimenServe saves the quotation and generates a quote number for retrieval.
                        </p>
                    </div>
                    <div className="rounded-[28px] border border-primary-200 bg-white/90 p-5 shadow-sm">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-primary-400">Estimated total</p>
                        <p className="mt-2 text-3xl font-display font-bold text-primary-950">{formatCurrency(total)}</p>
                        <p className="mt-2 text-sm text-primary-500">{totalLineCount} quote line{totalLineCount === 1 ? '' : 's'} with VAT included.</p>
                    </div>
                </div>
            </div>

            {quoteNumber && (
                <div className="rounded-[30px] border border-accent-success/25 bg-accent-success/10 p-5 md:p-6">
                    <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-accent-success">Quote successfully saved</p>
                    <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-3xl font-display font-bold text-primary-950">{quoteNumber}</p>
                            <p className="mt-2 text-sm text-primary-600">Use this quote number in Retrieve Quote to open the saved quotation again.</p>
                        </div>
                        <Button variant="primary" leftIcon={<Printer className="h-4 w-4" />} onClick={() => openPreview('draft')}>
                            Open Printable Preview
                        </Button>
                    </div>
                </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-[30px] border border-primary-200 bg-white p-5 shadow-sm md:p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent-primary/20 bg-accent-primary/5 text-accent-primary">
                            <User className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-primary-400">Customer details</p>
                            <h4 className="text-lg font-display font-semibold text-primary-950">Prepared for {customerName || 'Walk-in Customer'}</h4>
                        </div>
                    </div>
                    <div className="mt-5 grid gap-3 text-sm">
                        <div className="rounded-2xl border border-primary-200 bg-primary-50/70 px-4 py-3">
                            <span className="block text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary-400">Phone</span>
                            <span className="mt-1 block font-semibold text-primary-950">{customerPhone || 'Not provided'}</span>
                        </div>
                        <div className="rounded-2xl border border-primary-200 bg-primary-50/70 px-4 py-3">
                            <span className="block text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary-400">Vehicle</span>
                            <span className="mt-1 block font-semibold text-primary-950">{vehicleInfo || 'No vehicle selected - quote can still continue'}</span>
                        </div>
                    </div>
                </div>

                <div className="rounded-[30px] border border-primary-200 bg-white p-5 shadow-sm md:p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent-blue/20 bg-accent-blue/5 text-accent-blue">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-primary-400">Quote confidence</p>
                            <h4 className="text-lg font-display font-semibold text-primary-950">Live catalog pricing</h4>
                        </div>
                    </div>
                    <div className="mt-5 grid gap-3 text-sm">
                        <div className="rounded-2xl border border-primary-200 bg-primary-50/70 px-4 py-3">
                            <span className="block text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary-400">Source</span>
                            <span className="mt-1 block font-semibold text-primary-950">Current Supabase parts and service catalog</span>
                        </div>
                        <div className="rounded-2xl border border-primary-200 bg-primary-50/70 px-4 py-3">
                            <span className="block text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary-400">Validity</span>
                            <span className="mt-1 block font-semibold text-primary-950">{QUOTE_VALID_DAYS} days after quote generation</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-[30px] border border-primary-200 bg-white p-5 shadow-sm md:p-6">
                <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-primary-400">Selected quote lines</p>
                        <h4 className="mt-1 text-xl font-display font-semibold text-primary-950">Parts and services to include</h4>
                    </div>
                    <Button variant="secondary" onClick={() => setEstimatePhase('catalog')}>
                        Add More Parts
                    </Button>
                </div>

                {!hasItems ? (
                    <div className="rounded-[24px] border border-dashed border-primary-300 bg-primary-50/70 px-5 py-10 text-center">
                        <p className="text-lg font-display font-semibold text-primary-950">No items selected yet</p>
                        <p className="mt-2 text-sm text-primary-500">Go back to Parts and Services to add quote lines.</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {selectedParts.map((part) => (
                            <div key={part.id} className="grid gap-3 rounded-2xl border border-primary-200 bg-primary-50/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                <div className="min-w-0">
                                    <p className="font-semibold text-primary-950">{part.name}</p>
                                    <p className="mt-1 text-xs text-primary-500">{part.sku || 'Pricelist item'} - Qty {part.quantity}</p>
                                </div>
                                <p className="font-bold text-accent-blue">{formatCurrency(part.price * part.quantity)}</p>
                            </div>
                        ))}
                        {selectedServices.map((service) => (
                            <div key={service.id} className="grid gap-3 rounded-2xl border border-primary-200 bg-primary-50/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                <div className="min-w-0">
                                    <p className="font-semibold text-primary-950">{service.name}</p>
                                    <p className="mt-1 text-xs text-primary-500">Service / labor line</p>
                                </div>
                                <p className="font-bold text-accent-blue">{formatCurrency(service.price)}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {summaryFocusProduct && (
                <ProductPackageSuggestions
                    product={summaryFocusProduct}
                    vehicleModelId={vehicle.model || summaryFocusProduct.model || summaryFocusProduct.vehicleModelName || ''}
                    vehicleContext={hasVehicle ? vehicle : null}
                    anchorQuantity={summaryFocusSelection?.quantity ?? 1}
                    onAddProduct={addSuggestedPart}
                    onAddService={addSuggestedService}
                    onAddBundle={addBundleToEstimate}
                    onRemoveProduct={removePart}
                    onRemoveService={removeService}
                    selectedProductIds={selectedProductIds}
                    selectedServiceIds={selectedServiceIds}
                    title={hasVehicle ? 'Recommended bundle before finishing' : 'Part-based bundle before finishing'}
                    subtitle={hasVehicle
                        ? 'Add any remaining matched parts or labor before generating the quote number.'
                        : 'Vehicle selection is optional. These bundles are based on the selected anchor part.'}
                    highlightedPackageKey={incomingPackageKey}
                    bundleMode="estimate"
                    smartQuote
                />
            )}
        </div>
    );

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
                                ? 'Start a polished customer quotation or retrieve an existing quote number without loading unnecessary tools.'
                                : mode === 'retrieve'
                                    ? 'Look up a saved quotation and open a printable copy for the customer.'
                                    : estimatePhase === 'summary'
                                        ? 'Confirm customer details, selected parts, service labor, recommendations, and totals before generating the quote number.'
                                        : 'A guided quote builder for Mitsubishi parts, service labor, and smart bundle recommendations.'}
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
                                    ? 'Choose the exact customer task first so the quotation workspace stays focused.'
                                    : mode === 'retrieve'
                                        ? 'Quote retrieval is separate from quote creation to keep this screen simple.'
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
                        onEstimateNumberChange={setLookupEstimateNumber}
                        onLookup={handleLookupQuote}
                        loading={lookupLoading}
                        error={lookupError}
                        result={retrievedQuote}
                        onPreviewPrint={() => openPreview('retrieved')}
                    />
                ) : (
                    <div className={estimatePhase === 'details'
                        ? 'grid grid-cols-1 gap-8'
                        : 'grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_420px]'
                    }>
                        <div className="min-w-0 space-y-8">
                            {estimatePhase === 'summary' && reviewWorkspace}

                            {estimatePhase === 'details' && (
                            <div className="surface p-6 md:p-7">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="block text-sm font-semibold text-primary-700 mb-2">Customer Name</label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                                            <input value={customerName} onChange={(event) => {
                                                setSavedDraftQuote(null);
                                                setCustomerName(event.target.value);
                                            }} placeholder="Walk-in customer" className="input pl-10 py-2.5 text-sm" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-primary-700 mb-2">Phone Number</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                                            <input value={customerPhone} onChange={(event) => {
                                                setSavedDraftQuote(null);
                                                setCustomerPhone(event.target.value);
                                            }} placeholder="09XX XXX XXXX" className="input pl-10 py-2.5 text-sm" />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6">
                                    <PublicVehicleSelector
                                        vehicle={vehicle}
                                        onChange={handleVehicleChange}
                                        onClear={handleVehicleClear}
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
                                        compactTabs
                                    />
                                </div>
                            )}

                            {estimatePhase === 'catalog' && (
                            <div className="surface p-4 sm:p-5">
                                <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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

                                <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-primary-200 bg-white/90 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
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

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:max-h-[520px] lg:overflow-y-auto lg:pr-2 lg:custom-scrollbar">
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
                                                key={product.catalogEntryId || product.id}
                                                onClick={() => addPart(product)}
                                                className={`min-h-[112px] rounded-xl border p-3 text-left flex flex-col gap-1.5 transition-all duration-300 ${isSelected
                                                    ? 'bg-accent-primary/5 border-accent-primary/30 ring-1 ring-accent-primary/30'
                                                    : 'bg-white border-primary-200 hover:border-accent-primary hover:bg-primary-50 shadow-sm'
                                                    }`}
                                            >
                                                <span className="text-xs font-semibold text-primary-500">{product.sku}</span>
                                                <span className="text-base font-display font-medium text-primary-950 line-clamp-1">{product.name}</span>
                                                <span className="line-clamp-1 text-xs text-primary-400">{product.model || 'Universal fitment'}</span>
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
                                    vehicleContext={hasVehicle ? vehicle : null}
                                    anchorQuantity={focusedPartSelection?.quantity ?? 1}
                                    onAddProduct={addSuggestedPart}
                                    onAddService={addSuggestedService}
                                    onAddBundle={addBundleToEstimate}
                                    onRemoveProduct={removePart}
                                    onRemoveService={removeService}
                                    selectedProductIds={selectedProductIds}
                                    selectedServiceIds={selectedServiceIds}
                                    title={hasVehicle ? 'Good / Better / Best smart bundles' : 'Part-based Good / Better / Best bundles'}
                                    subtitle={hasVehicle
                                        ? 'Vehicle-aware smart upsell bundles of matched Mitsubishi parts and labor for the selected anchor part.'
                                        : 'Vehicle selection is optional. These recommendations use the selected part as the bundle anchor.'}
                                    highlightedPackageKey={incomingPackageKey}
                                    bundleMode="estimate"
                                    smartQuote
                                />
                            )}

                            {estimatePhase === 'catalog' && (
                            <div className="surface p-4 sm:p-5">
                                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                  <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-accent-primary/5 border border-accent-primary/20 flex items-center justify-center">
                                        <Wrench className="w-5 h-5 text-accent-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-display font-semibold text-primary-950">Service Catalog</h3>
                                        <p className="text-sm text-primary-500">Compact labor and maintenance options from the live service catalog.</p>
                                    </div>
                                  </div>
                                  {selectedServices.length > 0 && (
                                    <span className="rounded-full border border-accent-primary/20 bg-accent-primary/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-accent-primary">
                                      {selectedServices.length} selected
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {servicesLoading ? (
                                        <div className="rounded-xl border border-primary-200 bg-white p-5 text-sm text-primary-500 sm:col-span-2 xl:col-span-3">
                                            Loading services from Supabase...
                                        </div>
                                    ) : servicesError ? (
                                        <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 p-5 text-sm text-accent-danger sm:col-span-2 xl:col-span-3">
                                            {servicesError}
                                        </div>
                                    ) : availableServices.length === 0 ? (
                                        <div className="rounded-xl border border-primary-200 bg-white p-5 text-sm text-primary-500 sm:col-span-2 xl:col-span-3">
                                            No active services are available in the database.
                                        </div>
                                    ) : availableServices.map((service) => {
                                        const isSelected = selectedServices.some((selected) => selected.id === service.id);
                                        return (
                                            <button
                                                key={service.id}
                                                onClick={() => toggleService(service)}
                                                className={`min-h-[76px] rounded-xl border p-3 text-left transition-all duration-300 ${isSelected
                                                    ? 'bg-accent-primary/5 border-accent-primary/30 ring-1 ring-accent-primary/30 text-primary-950'
                                                    : 'bg-white border-primary-200 text-primary-600 hover:border-accent-primary hover:text-primary-950 shadow-sm'
                                                    }`}
                                            >
                                                <span className="flex items-start justify-between gap-3">
                                                    <span className="min-w-0">
                                                        <span className="line-clamp-2 block text-sm font-semibold">{service.name}</span>
                                                        <span className="mt-1 block text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary-400">
                                                            {isSelected ? 'Selected labor' : 'Tap to add'}
                                                        </span>
                                                    </span>
                                                    <span className={`shrink-0 text-sm font-bold ${isSelected ? 'text-accent-primary' : 'text-primary-500'}`}>
                                                        {formatCurrency(service.price)}
                                                    </span>
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
                                    <Button variant="primary" onClick={() => setEstimatePhase('summary')} isDisabled={!hasItems}>
                                        Review Quote
                                    </Button>
                                </div>
                            )}
                        </div>
                        {estimatePhase !== 'details' && (
                            <div className={`min-w-0 ${estimatePhase === 'catalog' ? 'order-first' : 'order-last'} xl:order-none xl:sticky xl:top-24 xl:self-start`}>
                                {quoteSummaryCard}
                            </div>
                        )}
                    </div>
                ))}
            </section>

            {isCartPanelVisible && (
                <Motion.aside
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
                                                    {estimatePhase === 'catalog' ? 'Phase 2 Cart' : 'Public Quotation'}
                                                </span>
                                                <h3 className="mt-2 text-xl font-display font-semibold text-primary-950">{cartPanelTitle}</h3>
                                                <p className="mt-1 text-sm text-primary-500">{cartPanelDescription}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (estimatePhase === 'summary') {
                                                        setEstimatePhase('catalog');
                                                    } else {
                                                        setEstimatePhase('details');
                                                    }
                                                }}
                                                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary-200 bg-primary-50 text-primary-500 transition hover:border-primary-300 hover:bg-white hover:text-primary-950"
                                                aria-label="Back to previous phase"
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
                                        {estimatePhase === 'summary' && savedDraftQuote?.estimate?.estimate_number && (
                                            <div className="rounded-[24px] border border-accent-success/30 bg-accent-success/10 p-4 shadow-sm">
                                                <span className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-accent-success">Quote created</span>
                                                <p className="mt-2 text-2xl font-display font-bold text-primary-950">{savedDraftQuote.estimate.estimate_number}</p>
                                                <p className="mt-2 text-sm text-primary-600">This quote is stored in Supabase and can be retrieved later using this quote number.</p>
                                            </div>
                                        )}

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
                                                vehicleContext={hasVehicle ? vehicle : null}
                                                anchorQuantity={summaryFocusSelection?.quantity ?? 1}
                                                onAddProduct={addSuggestedPart}
                                                onAddService={addSuggestedService}
                                                onAddBundle={addBundleToEstimate}
                                                selectedProductIds={selectedProductIds}
                                                selectedServiceIds={selectedServiceIds}
                                                title={hasVehicle ? 'Recommendations and packages in this cart' : 'Part-based smart bundles'}
                                                subtitle={hasVehicle
                                                    ? 'Add remaining upsell items and labor for the selected product without going back to the long catalog view.'
                                                    : 'Vehicle selection is optional. These bundles are based on the part you clicked and can still be added to the quote.'}
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

                                        {saveError && (
                                            <div className="mt-4 rounded-2xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                                                {saveError}
                                            </div>
                                        )}

                                        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                            <Button
                                                variant="secondary"
                                                fullWidth
                                                onClick={estimatePhase === 'catalog' ? resetForm : () => setEstimatePhase('catalog')}
                                            >
                                                {estimatePhase === 'catalog' ? 'Reset' : 'Add More Parts'}
                                            </Button>
                                            {estimatePhase === 'catalog' ? (
                                                <Button variant="primary" fullWidth onClick={() => setEstimatePhase('summary')} isDisabled={!hasItems}>
                                                    Review Quote
                                                </Button>
                                            ) : savedDraftQuote?.estimate?.estimate_number ? (
                                                <Button variant="primary" fullWidth leftIcon={<Printer className="h-4 w-4" />} onClick={() => openPreview('draft')}>
                                                    Printable Preview
                                                </Button>
                                            ) : (
                                                <Button variant="primary" fullWidth onClick={finishQuote} isDisabled={!hasItems} isLoading={savingQuote}>
                                                    Finish Quote
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </Motion.aside>
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



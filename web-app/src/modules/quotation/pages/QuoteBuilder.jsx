import { useEffect, useMemo, useState } from 'react';
import {
    FileClock,
    FileText,
    Phone,
    Printer,
    Save,
    Search,
    Trash2,
    User,
} from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import { formatCurrency } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import useProductCatalog from '../../../hooks/useProductCatalog';
import useServiceCatalog from '../../../hooks/useServiceCatalog';
import ProductPackageSuggestions from '../../public/components/ProductPackageSuggestions';
import {
    createEstimate,
    getEstimateDetail,
    getEstimateRevisions,
    listEstimates,
    updateEstimate,
} from '../../../services/estimatesApi';

const defaultMeta = {
    status: 'draft',
    source: 'internal',
};

function mapCatalogProduct(product) {
    return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        price: Number(product.price ?? 0),
        category: product.category,
        model: product.model,
        quantity: 1,
    };
}

function buildEstimatePayload({
    customerName,
    customerPhone,
    notes,
    selectedParts,
    selectedServices,
    currentEstimateNumber,
}) {
    const partsTotal = selectedParts.reduce((sum, part) => sum + (Number(part.price ?? 0) * Number(part.quantity ?? 1)), 0);
    const servicesTotal = selectedServices.reduce((sum, service) => sum + Number(service.price ?? 0), 0);
    const subtotal = partsTotal + servicesTotal;
    const taxTotal = subtotal * 0.12;

    return {
        customer: {
            customer_type: 'walk_in',
            name: customerName || 'Walk-in Customer',
            phone: customerPhone || null,
        },
        estimate: {
            ...defaultMeta,
            estimate_number: currentEstimateNumber || undefined,
            note: notes || null,
            subtotal,
            discount_total: 0,
            tax_total: taxTotal,
            grand_total: subtotal + taxTotal,
            issued_at: new Date().toISOString(),
            valid_until: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10),
        },
        items: [
            ...selectedParts.map((part) => ({
                line_type: 'product',
                product_id: part.id,
                quantity: Number(part.quantity ?? 1),
                unit_price: Number(part.price ?? 0),
                line_total: Number(part.price ?? 0) * Number(part.quantity ?? 1),
                is_upsell: Boolean(part.isUpsell),
                recommendation_rule_id: part.recommendationRuleId || null,
            })),
            ...selectedServices.map((service) => ({
                line_type: 'service',
                service_id: service.id,
                quantity: Number(service.quantity ?? 1),
                unit_price: Number(service.price ?? 0),
                line_total: Number(service.price ?? 0) * Number(service.quantity ?? 1),
                is_upsell: Boolean(service.isUpsell),
                recommendation_rule_id: service.recommendationRuleId || null,
            })),
        ],
    };
}

function mapEstimateDetailToState(estimate) {
    const items = estimate?.items ?? [];

    return {
        customerName: estimate?.customer?.name || '',
        customerPhone: estimate?.customer?.phone || '',
        notes: estimate?.estimate?.note || '',
        currentEstimateNumber: estimate?.estimate?.estimate_number || '',
        selectedParts: items
            .filter((item) => item.line_type === 'product')
            .map((item) => ({
                id: item.product_id,
                name: item.product_name || 'Unnamed Part',
                sku: item.product_sku || '',
                price: Number(item.unit_price ?? 0),
                quantity: Number(item.quantity ?? 1),
                recommendationRuleId: item.recommendation_rule_id || null,
                isUpsell: Boolean(item.is_upsell),
            })),
        selectedServices: items
            .filter((item) => item.line_type === 'service')
            .map((item) => ({
                id: item.service_id,
                name: item.service_name || 'Unnamed Service',
                price: Number(item.unit_price ?? 0),
                quantity: Number(item.quantity ?? 1),
                recommendationRuleId: item.recommendation_rule_id || null,
                isUpsell: Boolean(item.is_upsell),
            })),
    };
}

const QuoteBuilder = () => {
    const { success, error: showError, info } = useToast();
    const { services: availableServices, loading: servicesLoading, error: servicesError } = useServiceCatalog();
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [selectedParts, setSelectedParts] = useState([]);
    const [selectedServices, setSelectedServices] = useState([]);
    const [notes, setNotes] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [quoteSearch, setQuoteSearch] = useState('');
    const [savedQuotes, setSavedQuotes] = useState([]);
    const [quotesLoading, setQuotesLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [currentEstimateId, setCurrentEstimateId] = useState(null);
    const [currentEstimateNumber, setCurrentEstimateNumber] = useState('');
    const [changeNote, setChangeNote] = useState('Customer requested item updates');
    const [revisions, setRevisions] = useState([]);
    const [focusedProduct, setFocusedProduct] = useState(null);

    const {
        products: availableProducts,
        loading: productsLoading,
        error: productsError,
    } = useProductCatalog({
        page: 1,
        pageSize: 12,
        searchQuery,
        sortBy: 'name-asc',
    });

    const totals = useMemo(() => {
        const partsTotal = selectedParts.reduce((sum, part) => sum + (Number(part.price ?? 0) * Number(part.quantity ?? 1)), 0);
        const servicesTotal = selectedServices.reduce((sum, service) => sum + Number(service.price ?? 0), 0);
        const subtotal = partsTotal + servicesTotal;
        const vat = subtotal * 0.12;
        return {
            partsTotal,
            servicesTotal,
            subtotal,
            vat,
            total: subtotal + vat,
        };
    }, [selectedParts, selectedServices]);

    useEffect(() => {
        let active = true;

        const loadQuotes = async () => {
            setQuotesLoading(true);
            try {
                const records = await listEstimates(quoteSearch, 8);
                if (active) {
                    setSavedQuotes(records);
                }
            } catch (_loadError) {
                if (active) {
                    setSavedQuotes([]);
                }
            } finally {
                if (active) {
                    setQuotesLoading(false);
                }
            }
        };

        void loadQuotes();

        return () => {
            active = false;
        };
    }, [quoteSearch]);

    const addPart = (product, extra = {}) => {
        setFocusedProduct(product);
        setSelectedParts((parts) => {
            const existing = parts.find((part) => part.id === product.id);
            if (existing) {
                return parts.map((part) => (part.id === product.id ? { ...part, quantity: part.quantity + 1 } : part));
            }

            return [...parts, { ...mapCatalogProduct(product), ...extra }];
        });
    };

    const removePart = (id) => {
        setSelectedParts((parts) => parts.filter((part) => part.id !== id));
        if (focusedProduct?.id === id) {
            setFocusedProduct(null);
        }
    };

    const updatePartQuantity = (id, quantity) => {
        if (quantity < 1) {
            removePart(id);
            return;
        }

        setSelectedParts((parts) => parts.map((part) => (part.id === id ? { ...part, quantity } : part)));
    };

    const toggleService = (service) => {
        const existing = selectedServices.find((selected) => selected.id === service.id);
        if (existing) {
            setSelectedServices((services) => services.filter((selected) => selected.id !== service.id));
        } else {
            setSelectedServices((services) => [...services, {
                id: service.id,
                name: service.name,
                price: Number(service.price ?? 0),
                quantity: 1,
            }]);
        }
    };

    const loadQuote = async (estimateId) => {
        try {
            const estimate = await getEstimateDetail(estimateId);
            const nextState = mapEstimateDetailToState(estimate);
            setCurrentEstimateId(estimateId);
            setCurrentEstimateNumber(nextState.currentEstimateNumber);
            setCustomerName(nextState.customerName);
            setCustomerPhone(nextState.customerPhone);
            setNotes(nextState.notes);
            setSelectedParts(nextState.selectedParts);
            setSelectedServices(nextState.selectedServices);
            setFocusedProduct(nextState.selectedParts[0] || null);
            const revisionHistory = await getEstimateRevisions(estimateId);
            setRevisions(revisionHistory);
            info(`Loaded quote ${nextState.currentEstimateNumber || estimateId}`);
        } catch (loadError) {
            showError(loadError.message || 'Unable to load the selected quotation.');
        }
    };

    const handleSave = async () => {
        if (!selectedParts.length && !selectedServices.length) {
            showError('Add at least one part or service before saving.');
            return;
        }

        setSaving(true);
        try {
            const payload = buildEstimatePayload({
                customerName,
                customerPhone,
                notes,
                selectedParts,
                selectedServices,
                currentEstimateNumber,
            });

            if (currentEstimateId) {
                await updateEstimate(currentEstimateId, payload, changeNote);
                success('Quotation updated and revision saved.');
                const revisionHistory = await getEstimateRevisions(currentEstimateId);
                setRevisions(revisionHistory);
            } else {
                const estimateId = await createEstimate(payload);
                const estimate = await getEstimateDetail(estimateId);
                setCurrentEstimateId(estimateId);
                setCurrentEstimateNumber(estimate?.estimate?.estimate_number || '');
                success('Quotation saved successfully.');
                const revisionHistory = await getEstimateRevisions(estimateId);
                setRevisions(revisionHistory);
            }

            const refreshedQuotes = await listEstimates(quoteSearch, 8);
            setSavedQuotes(refreshedQuotes);
        } catch (saveError) {
            showError(saveError.message || 'Unable to save the quotation.');
        } finally {
            setSaving(false);
        }
    };

    const handlePrint = () => {
        setShowPreview(true);
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                <div className="xl:col-span-3 space-y-6">
                    <Card title="Saved Quotations" subtitle="Retrieve, revise, and keep quotations active for 30 days.">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
                            <div>
                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                                    <input
                                        type="text"
                                        placeholder="Search quote no., customer, or phone..."
                                        value={quoteSearch}
                                        onChange={(e) => setQuoteSearch(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-primary-200 rounded-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm"
                                    />
                                </div>
                                <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                                    {quotesLoading ? (
                                        <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-500">Loading saved quotations...</div>
                                    ) : savedQuotes.length === 0 ? (
                                        <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-500">No saved quotations matched your search.</div>
                                    ) : savedQuotes.map((quote) => (
                                        <button
                                            key={quote.id}
                                            type="button"
                                            onClick={() => loadQuote(quote.id)}
                                            className={`w-full rounded-xl border p-4 text-left transition-all ${currentEstimateId === quote.id ? 'border-accent-blue bg-accent-blue/5 shadow-sm' : 'border-primary-200 bg-white hover:border-primary-300 hover:shadow-sm'}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="font-semibold text-primary-950">{quote.estimate_number}</span>
                                                <span className="text-xs uppercase tracking-[0.18em] text-primary-400">{quote.status}</span>
                                            </div>
                                            <p className="mt-2 text-sm text-primary-700">{quote.customer_name || 'Walk-in Customer'}</p>
                                            <p className="text-xs text-primary-500">{quote.customer_phone || 'No phone'} · Valid until {quote.valid_until || 'N/A'}</p>
                                            <p className="mt-2 text-sm font-semibold text-accent-blue">{formatCurrency(quote.grand_total || 0)}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-5">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-400">Editable quotation workflow</p>
                                        <h3 className="mt-2 text-xl font-display font-semibold text-primary-950">{currentEstimateNumber || 'New quotation draft'}</h3>
                                        <p className="mt-1 text-sm text-primary-500">
                                            Save revisions without creating a brand new quotation. Customers can retrieve the same quotation for 30 days using the quote number and phone.
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-primary-200 bg-white px-4 py-3">
                                        <p className="text-xs uppercase tracking-[0.18em] text-primary-400">Revision count</p>
                                        <p className="mt-1 text-2xl font-display font-bold text-primary-950">{revisions.length}</p>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                                    <Input
                                        label="Customer Name"
                                        placeholder="Enter customer name"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        leftIcon={<User className="w-4 h-4" />}
                                    />
                                    <Input
                                        label="Phone Number"
                                        placeholder="09XX XXX XXXX"
                                        value={customerPhone}
                                        onChange={(e) => setCustomerPhone(e.target.value)}
                                        leftIcon={<Phone className="w-4 h-4" />}
                                    />
                                </div>

                                <div className="mt-4">
                                    <Input
                                        label="Revision Note"
                                        placeholder="What changed in this quote?"
                                        value={changeNote}
                                        onChange={(e) => setChangeNote(e.target.value)}
                                        leftIcon={<FileClock className="w-4 h-4" />}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card title="Select Mitsubishi Parts" subtitle="Search the imported Supabase catalog and click a part to add it to the quote.">
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                            <input
                                type="text"
                                placeholder="Search parts by name, SKU, or model..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-primary-200 rounded-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {productsLoading ? (
                                <div className="col-span-full rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-500">Loading the current price list from Supabase...</div>
                            ) : productsError ? (
                                <div className="col-span-full rounded-lg border border-accent-danger/20 bg-accent-danger/5 p-4 text-sm text-accent-danger">{productsError}</div>
                            ) : availableProducts.length === 0 ? (
                                <div className="col-span-full rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-500">No priced parts matched your search.</div>
                            ) : availableProducts.map((product) => (
                                <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => addPart(product)}
                                    className={`rounded-xl border p-4 text-left transition-all ${focusedProduct?.id === product.id ? 'border-accent-blue bg-accent-blue/5 shadow-sm' : 'border-primary-200 bg-white hover:border-primary-300 hover:shadow-sm'}`}
                                >
                                    <p className="text-sm font-semibold text-primary-950 line-clamp-2">{product.name}</p>
                                    <p className="mt-1 text-xs font-mono text-primary-500">{product.sku || 'NO SKU'}</p>
                                    <p className="text-[11px] text-primary-400 mt-1">{product.model || 'Universal fitment'}</p>
                                    <p className="mt-3 text-sm font-bold text-accent-blue">{formatCurrency(product.price || 0)}</p>
                                </button>
                            ))}
                        </div>
                    </Card>

                    {focusedProduct && (
                        <ProductPackageSuggestions
                            product={focusedProduct}
                            vehicleModelId={focusedProduct.model || null}
                            onAddProduct={(recommendation) => {
                                if (!recommendation.recommendedProduct) {
                                    return;
                                }

                                addPart(recommendation.recommendedProduct, {
                                    isUpsell: true,
                                    recommendationRuleId: recommendation.ruleId || null,
                                });
                            }}
                            onAddService={(recommendation) => {
                                if (!recommendation.recommendedServiceId) {
                                    return;
                                }

                                setSelectedServices((services) => {
                                    if (services.some((service) => service.id === recommendation.recommendedServiceId)) {
                                        return services;
                                    }

                                    return [
                                        ...services,
                                        {
                                            id: recommendation.recommendedServiceId,
                                            name: recommendation.recommendedServiceName,
                                            price: Number(recommendation.recommendedPrice ?? 0),
                                            quantity: 1,
                                            isUpsell: true,
                                            recommendationRuleId: recommendation.ruleId || null,
                                        },
                                    ];
                                });
                            }}
                            selectedProductIds={selectedParts.map((part) => part.id)}
                            selectedServiceIds={selectedServices.map((service) => service.id)}
                            title="Recommendation Packages"
                            subtitle="Related parts and labor suggested from curated rules and mined quote patterns."
                        />
                    )}

                    <Card title="Select Services" subtitle="Add labor or maintenance services to the quotation.">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {servicesLoading ? (
                                <div className="col-span-full rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-500">Loading services from Supabase...</div>
                            ) : servicesError ? (
                                <div className="col-span-full rounded-lg border border-accent-danger/20 bg-accent-danger/5 p-4 text-sm text-accent-danger">{servicesError}</div>
                            ) : availableServices.length === 0 ? (
                                <div className="col-span-full rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-500">No active services were returned from the database.</div>
                            ) : availableServices.map((service) => {
                                const isSelected = selectedServices.some((selected) => selected.id === service.id);
                                return (
                                    <button
                                        key={service.id}
                                        type="button"
                                        onClick={() => toggleService(service)}
                                        className={`rounded-xl border p-4 text-left transition-all ${isSelected ? 'border-accent-blue bg-accent-blue/5 shadow-sm' : 'border-primary-200 bg-white hover:border-primary-300 hover:shadow-sm'}`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-sm font-semibold text-primary-950">{service.name}</p>
                                                <p className="text-xs text-primary-500 mt-1">{service.code}</p>
                                            </div>
                                            <span className="text-sm font-bold text-accent-blue">{formatCurrency(service.price)}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </Card>

                    <Card title="Additional Notes">
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Add special requests, exclusions, or compatibility notes..."
                            rows={4}
                            className="w-full px-4 py-3 bg-white border border-primary-200 rounded-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm resize-none"
                        />
                    </Card>
                </div>

                <div className="xl:col-span-1">
                    <div className="bg-white border border-primary-200 rounded-xl shadow-sm p-4 sticky top-20">
                        <h3 className="text-lg font-display font-bold text-primary-950 mb-4 pb-3 border-b border-primary-100">Quote Summary</h3>

                        {selectedParts.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm font-semibold text-primary-500 uppercase tracking-widest mb-2">Parts</p>
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {selectedParts.map((part) => (
                                        <div key={part.id} className="flex items-center justify-between p-2 bg-primary-50 rounded-lg border border-primary-100">
                                            <div className="flex-1 min-w-0 mr-2">
                                                <p className="text-sm font-semibold text-primary-950 truncate">{part.name}</p>
                                                <p className="text-[10px] text-primary-500 font-mono">{part.sku || 'NO SKU'}</p>
                                                <p className="text-xs font-bold text-accent-blue mt-1">{formatCurrency(part.price)} x {part.quantity}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={part.quantity}
                                                    onChange={(e) => updatePartQuantity(part.id, parseInt(e.target.value, 10) || 0)}
                                                    className="w-14 px-2 py-1 bg-white border border-primary-200 rounded text-sm text-center font-bold text-primary-950 focus:outline-none focus:border-accent-blue shadow-sm"
                                                    min="1"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removePart(part.id)}
                                                    className="p-1 text-accent-danger hover:bg-accent-danger/10 rounded-md transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedServices.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm font-semibold text-primary-500 uppercase tracking-widest mb-2">Services</p>
                                <div className="space-y-2">
                                    {selectedServices.map((service) => (
                                        <div key={service.id} className="flex items-center justify-between p-2 bg-primary-50 rounded-lg border border-primary-100">
                                            <p className="text-sm font-semibold text-primary-950">{service.name}</p>
                                            <p className="text-sm font-bold text-accent-blue">{formatCurrency(service.price)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedParts.length === 0 && selectedServices.length === 0 && (
                            <div className="text-center py-8">
                                <FileText className="w-12 h-12 text-primary-300 mx-auto mb-3" />
                                <p className="text-primary-500 font-bold tracking-wide">No items selected</p>
                                <p className="text-sm text-primary-400 mt-1">Add parts and services to create a quote</p>
                            </div>
                        )}

                        <div className="border-t border-primary-200 pt-4 mt-4 space-y-2">
                            <div className="flex justify-between text-sm text-primary-600 font-medium">
                                <span>Parts Subtotal</span>
                                <span>{formatCurrency(totals.partsTotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-primary-600 font-medium">
                                <span>Services Subtotal</span>
                                <span>{formatCurrency(totals.servicesTotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-primary-600 font-medium">
                                <span>VAT (12%)</span>
                                <span>{formatCurrency(totals.vat)}</span>
                            </div>
                            <div className="flex justify-between text-xl font-bold text-primary-950 pt-3 mt-1 border-t border-primary-200">
                                <span>Total Estimate</span>
                                <span className="text-accent-blue">{formatCurrency(totals.total)}</span>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            <Button
                                variant="primary"
                                fullWidth
                                leftIcon={<Printer className="w-4 h-4" />}
                                onClick={handlePrint}
                                disabled={selectedParts.length === 0 && selectedServices.length === 0}
                            >
                                Print Quotation
                            </Button>
                            <Button
                                variant="secondary"
                                fullWidth
                                leftIcon={<Save className="w-4 h-4" />}
                                onClick={handleSave}
                                isLoading={saving}
                                disabled={selectedParts.length === 0 && selectedServices.length === 0}
                            >
                                {currentEstimateId ? 'Save Revision' : 'Save Quotation'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Print Preview" size="lg">
                <div className="space-y-6 text-primary-900">
                    <div className="border-b border-primary-200 pb-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-primary-400">Quotation</p>
                        <h2 className="mt-2 text-2xl font-display font-bold text-primary-950">{currentEstimateNumber || 'Draft Quotation'}</h2>
                        <div className="mt-3 grid gap-2 text-sm text-primary-600 sm:grid-cols-2">
                            <p><span className="font-semibold text-primary-950">Customer:</span> {customerName || 'Walk-in Customer'}</p>
                            <p><span className="font-semibold text-primary-950">Phone:</span> {customerPhone || 'N/A'}</p>
                            <p><span className="font-semibold text-primary-950">Valid For:</span> 30 days</p>
                            <p><span className="font-semibold text-primary-950">Prepared:</span> {new Date().toLocaleString()}</p>
                        </div>
                    </div>

                    <div>
                        <p className="text-sm font-semibold text-primary-950 mb-3">Quoted Items</p>
                        <div className="space-y-2">
                            {[...selectedParts, ...selectedServices].map((item) => (
                                <div key={`${item.id}-${item.name}`} className="flex items-center justify-between rounded-lg border border-primary-200 px-4 py-3 text-sm">
                                    <div>
                                        <p className="font-medium text-primary-950">{item.name}</p>
                                        <p className="text-primary-500">Qty {item.quantity || 1}</p>
                                    </div>
                                    <span className="font-semibold text-accent-blue">{formatCurrency((item.price || 0) * (item.quantity || 1))}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
                        <div className="flex items-center justify-between text-sm text-primary-600">
                            <span>Subtotal</span>
                            <span>{formatCurrency(totals.subtotal)}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-sm text-primary-600">
                            <span>VAT</span>
                            <span>{formatCurrency(totals.vat)}</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-primary-200 pt-3 text-lg font-bold text-primary-950">
                            <span>Total</span>
                            <span className="text-accent-blue">{formatCurrency(totals.total)}</span>
                        </div>
                    </div>

                    {notes && (
                        <div>
                            <p className="text-sm font-semibold text-primary-950 mb-2">Notes</p>
                            <p className="rounded-lg border border-primary-200 bg-white px-4 py-3 text-sm text-primary-600">{notes}</p>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default QuoteBuilder;

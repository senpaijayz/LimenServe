import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileClock,
    FileText,
    Phone,
    Printer,
    Save,
    Search,
    ShoppingCart,
    Trash2,
    User,
} from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import { formatCurrency } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import { useCart } from '../../../context/CartContext';
import useProductCatalog from '../../../hooks/useProductCatalog';
import useServiceCatalog from '../../../hooks/useServiceCatalog';
import ProductPackageSuggestions from '../../public/components/ProductPackageSuggestions';
import { buildBundleLineItems, getAppliedBundleSummaries, roundCurrency } from '../../public/utils/bundleQuotePricing';
import { getPartNumberSearchSuggestions, getProductPartNumber } from '../../../utils/barcode';
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

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

function buildPrintableQuote({
    quoteNumber,
    customerName,
    customerPhone,
    notes,
    selectedParts,
    selectedServices,
    totals,
}) {
    const lineItems = [
        ...selectedParts.map((part) => ({
            kind: 'Part',
            name: part.name,
            code: getProductPartNumber(part) || 'No part number',
            quantity: Number(part.quantity ?? 1),
            unitPrice: Number(part.price ?? 0),
            lineTotal: Number(part.price ?? 0) * Number(part.quantity ?? 1),
            bundleLabel: part.bundleKey ? `${part.bundleTierLabel || 'Smart'} bundle` : '',
        })),
        ...selectedServices.map((service) => ({
            kind: 'Service',
            name: service.name,
            code: service.bundleKey ? `${service.bundleTierLabel || 'Smart'} bundle labor` : 'Service / labor',
            quantity: Number(service.quantity ?? 1),
            unitPrice: Number(service.price ?? 0),
            lineTotal: Number(service.price ?? 0) * Number(service.quantity ?? 1),
            bundleLabel: service.bundleKey ? `${service.bundleTierLabel || 'Smart'} bundle` : '',
        })),
    ];

    const rows = lineItems.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.kind)} - ${escapeHtml(item.code)}</span>
                ${item.bundleLabel ? `<em>${escapeHtml(item.bundleLabel)}</em>` : ''}
            </td>
            <td>${item.quantity}</td>
            <td>${escapeHtml(formatCurrency(item.unitPrice))}</td>
            <td>${escapeHtml(formatCurrency(item.lineTotal))}</td>
        </tr>
    `).join('');
    const bundleRows = totals.appliedBundles.length
        ? totals.appliedBundles.map((bundle) => `<p>${escapeHtml(bundle.bundleName)} (${escapeHtml(bundle.bundleTierLabel)}) saved ${escapeHtml(formatCurrency(bundle.savings))}</p>`).join('')
        : '<p>No bundle pricing applied.</p>';

    return `<!doctype html>
        <html>
            <head>
                <meta charset="utf-8" />
                <title>Quotation ${escapeHtml(quoteNumber || 'Draft')}</title>
                <style>
                    @page { size: A4; margin: 14mm; }
                    * { box-sizing: border-box; }
                    body { margin: 0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; background: #fff; font-size: 12px; }
                    .sheet { width: 100%; }
                    .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 14px; }
                    .brand h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
                    .brand p, .doc-title p { margin: 4px 0 0; color: #475569; line-height: 1.45; }
                    .doc-title { text-align: right; }
                    .doc-title h2 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 0.08em; }
                    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
                    .box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; min-height: 64px; }
                    .label { display: block; color: #64748b; font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 5px; }
                    .value { font-weight: 700; color: #0f172a; line-height: 1.35; }
                    .muted { color: #64748b; font-weight: 400; }
                    .section { margin-top: 18px; }
                    .section h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #0f172a; }
                    table { width: 100%; border-collapse: collapse; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 10px; }
                    th { background: #f1f5f9; color: #475569; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; text-align: left; padding: 9px; border-bottom: 1px solid #cbd5e1; }
                    td { padding: 9px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
                    td span, td em { display: block; margin-top: 3px; color: #64748b; font-size: 10px; font-style: normal; }
                    tr:last-child td { border-bottom: 0; }
                    .summary { display: flex; justify-content: flex-end; margin-top: 18px; }
                    .summary-card { width: 300px; border: 1px solid #0f172a; border-radius: 12px; overflow: hidden; }
                    .summary-row { display: flex; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #cbd5e1; }
                    .summary-row.total { background: #0f172a; color: white; font-size: 16px; font-weight: 800; border-bottom: 0; }
                    .notes { border: 1px solid #cbd5e1; border-radius: 10px; padding: 11px; min-height: 48px; line-height: 1.55; color: #334155; }
                    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 10px; text-align: center; }
                    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                </style>
            </head>
            <body>
                <main class="sheet">
                    <section class="header">
                        <div class="brand">
                            <h1>Limen Auto Supply and Services</h1>
                            <p>Genuine Mitsubishi parts quotation and service estimate.</p>
                            <p>Contact: (0915) 522 5629 | Landline: 0285513518</p>
                        </div>
                        <div class="doc-title">
                            <h2>Quotation</h2>
                            <p><strong>${escapeHtml(quoteNumber || 'Draft Quotation')}</strong></p>
                            <p>Generated ${escapeHtml(new Date().toLocaleString())}</p>
                        </div>
                    </section>
                    <section class="meta-grid">
                        <div class="box"><span class="label">Customer</span><div class="value">${escapeHtml(customerName || 'Walk-in Customer')}</div><div class="muted">${escapeHtml(customerPhone || 'No phone recorded')}</div></div>
                        <div class="box"><span class="label">Prepared By</span><div class="value">LimenServe</div><div class="muted">Admin quotation</div></div>
                        <div class="box"><span class="label">Validity</span><div class="value">30 days</div><div class="muted">Subject to stock availability</div></div>
                        <div class="box"><span class="label">Total</span><div class="value">${escapeHtml(formatCurrency(totals.total))}</div><div class="muted">VAT included</div></div>
                    </section>
                    <section class="section">
                        <h3>Quoted Items</h3>
                        <table><thead><tr><th style="width:42px;">#</th><th>Item</th><th style="width:70px;">Qty</th><th style="width:120px;">Unit</th><th style="width:120px;">Total</th></tr></thead><tbody>${rows}</tbody></table>
                    </section>
                    <section class="section"><h3>Bundle Pricing</h3><div class="notes">${bundleRows}</div></section>
                    <section class="summary">
                        <div class="summary-card">
                            <div class="summary-row"><span>Parts subtotal</span><strong>${escapeHtml(formatCurrency(totals.partsTotal))}</strong></div>
                            <div class="summary-row"><span>Services subtotal</span><strong>${escapeHtml(formatCurrency(totals.servicesTotal))}</strong></div>
                            ${totals.bundleDiscountTotal > 0 ? `<div class="summary-row"><span>Bundle savings</span><strong>-${escapeHtml(formatCurrency(totals.bundleDiscountTotal))}</strong></div>` : ''}
                            <div class="summary-row"><span>VAT (12%)</span><strong>${escapeHtml(formatCurrency(totals.vat))}</strong></div>
                            <div class="summary-row total"><span>Total estimate</span><span>${escapeHtml(formatCurrency(totals.total))}</span></div>
                        </div>
                    </section>
                    <section class="section"><h3>Notes</h3><div class="notes">${escapeHtml(notes || 'Quotation prepared in LimenServe.')}</div></section>
                    <p class="footer">This quotation is generated from LimenServe quote records. Final sale is subject to stock, fitment, and cashier confirmation.</p>
                </main>
            </body>
        </html>`;
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
    const appliedBundles = getAppliedBundleSummaries([...selectedParts, ...selectedServices]);
    const bundleDiscountTotal = appliedBundles.reduce((sum, bundle) => sum + Number(bundle.savings ?? 0), 0);
    const subtotalBeforeDiscount = subtotal + bundleDiscountTotal;
    const bundleNote = appliedBundles.length
        ? ` Bundle pricing applied: ${appliedBundles.map((bundle) => `${bundle.bundleName} (${bundle.bundleTierLabel})`).join(', ')}.`
        : '';

    return {
        customer: {
            customer_type: 'walk_in',
            name: customerName || 'Walk-in Customer',
            phone: customerPhone || null,
        },
        estimate: {
            ...defaultMeta,
            estimate_number: currentEstimateNumber || undefined,
            note: `${notes || 'Quotation prepared in LimenServe.'}${bundleNote}`,
            subtotal: subtotalBeforeDiscount,
            discount_total: bundleDiscountTotal,
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
                product_sku: getProductPartNumber(part) || null,
                bundle_key: part.bundleKey || null,
                bundle_name: part.bundleName || null,
                bundle_tier_label: part.bundleTierLabel || null,
                catalog_unit_price: Number(part.catalogPrice ?? part.price ?? 0),
            })),
            ...selectedServices.map((service) => ({
                line_type: 'service',
                service_id: service.id,
                quantity: Number(service.quantity ?? 1),
                unit_price: Number(service.price ?? 0),
                line_total: Number(service.price ?? 0) * Number(service.quantity ?? 1),
                is_upsell: Boolean(service.isUpsell),
                recommendation_rule_id: service.recommendationRuleId || null,
                bundle_key: service.bundleKey || null,
                bundle_name: service.bundleName || null,
                bundle_tier_label: service.bundleTierLabel || null,
                catalog_unit_price: Number(service.catalogPrice ?? service.price ?? 0),
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
                bundleKey: item.bundle_key || '',
                bundleName: item.bundle_name || '',
                bundleTierLabel: item.bundle_tier_label || '',
                catalogPrice: Number(item.catalog_unit_price ?? item.unit_price ?? 0),
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
                bundleKey: item.bundle_key || '',
                bundleName: item.bundle_name || '',
                bundleTierLabel: item.bundle_tier_label || '',
                catalogPrice: Number(item.catalog_unit_price ?? item.unit_price ?? 0),
            })),
    };
}

const QuoteBuilder = () => {
    const navigate = useNavigate();
    const { success, error: showError, info } = useToast();
    const { addItem: addPosItem, clearCart, setCustomerName: setPosCustomerName } = useCart();
    const { services: availableServices, loading: servicesLoading, error: servicesError } = useServiceCatalog();
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [selectedParts, setSelectedParts] = useState([]);
    const [selectedServices, setSelectedServices] = useState([]);
    const [notes, setNotes] = useState('');
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
    const [showSmartBundles, setShowSmartBundles] = useState(true);

    const {
        products: availableProducts,
        loading: productsLoading,
        error: productsError,
    } = useProductCatalog({
        page: 1,
        pageSize: 12,
        searchQuery,
        sortBy: 'name-asc',
        includeCategories: false,
    });
    const partNumberSuggestions = useMemo(() => getPartNumberSearchSuggestions(availableProducts, searchQuery, 5), [availableProducts, searchQuery]);

    const totals = useMemo(() => {
        const partsTotal = selectedParts.reduce((sum, part) => sum + (Number(part.price ?? 0) * Number(part.quantity ?? 1)), 0);
        const servicesTotal = selectedServices.reduce((sum, service) => sum + Number(service.price ?? 0), 0);
        const subtotal = partsTotal + servicesTotal;
        const vat = subtotal * 0.12;
        const appliedBundles = getAppliedBundleSummaries([...selectedParts, ...selectedServices]);
        const bundleDiscountTotal = roundCurrency(appliedBundles.reduce((sum, bundle) => sum + Number(bundle.savings ?? 0), 0));
        return {
            partsTotal,
            servicesTotal,
            appliedBundles,
            bundleDiscountTotal,
            subtotal,
            vat,
            total: subtotal + vat,
        };
    }, [selectedParts, selectedServices]);
    const focusedPartSelection = selectedParts.find((part) => part.id === focusedProduct?.id);

    useEffect(() => {
        let active = true;

        const loadQuotes = async () => {
            setQuotesLoading(true);
            try {
                const records = await listEstimates(quoteSearch, 8);
                if (active) {
                    setSavedQuotes(records);
                }
            } catch {
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
                ...mapCatalogProduct(product),
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

    const addBundleToQuote = (pkg, tier) => {
        if (!tier?.items?.length) {
            return;
        }

        buildBundleLineItems(pkg, tier).forEach((lineItem) => {
            const recommendation = {
                ...lineItem.raw,
                resolvedPrice: lineItem.price,
                catalogPrice: lineItem.catalogPrice,
                bundleMeta: lineItem.bundleMeta,
            };

            if (lineItem.kind === 'service') {
                const nextService = {
                    id: recommendation.recommendedServiceId,
                    name: recommendation.recommendedServiceName,
                    price: Number(recommendation.resolvedPrice ?? recommendation.recommendedPrice ?? 0),
                    quantity: 1,
                    isUpsell: true,
                    recommendationRuleId: recommendation.packageItemId || recommendation.ruleId || null,
                    catalogPrice: Number(recommendation.catalogPrice ?? recommendation.recommendedPrice ?? 0),
                    ...(recommendation.bundleMeta ?? {}),
                };

                setSelectedServices((services) => {
                    const existing = services.find((service) => service.id === nextService.id);
                    return existing
                        ? services.map((service) => (service.id === nextService.id ? { ...service, ...nextService, price: Math.min(Number(service.price ?? 0), Number(nextService.price ?? 0)) } : service))
                        : [...services, nextService];
                });
                return;
            }

            if (recommendation.recommendedProduct) {
                addPart(recommendation.recommendedProduct, {
                    price: Number(recommendation.resolvedPrice ?? recommendation.recommendedProduct.price ?? recommendation.recommendedPrice ?? 0),
                    isUpsell: true,
                    recommendationRuleId: recommendation.packageItemId || recommendation.ruleId || null,
                    catalogPrice: Number(recommendation.catalogPrice ?? recommendation.recommendedProduct.price ?? recommendation.recommendedPrice ?? 0),
                    ...(recommendation.bundleMeta ?? {}),
                });
            }
        });
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

    const hasQuoteItems = selectedParts.length > 0 || selectedServices.length > 0;

    const handlePrint = () => {
        if (!hasQuoteItems) {
            showError('Add at least one part or service before printing.');
            return;
        }

        const printWindow = window.open('', '_blank', 'width=960,height=720');
        if (!printWindow) {
            showError('Please allow pop-ups to print or save the quotation PDF.');
            return;
        }

        const html = buildPrintableQuote({
            quoteNumber: currentEstimateNumber,
            customerName,
            customerPhone,
            notes,
            selectedParts,
            selectedServices,
            totals,
        });

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        window.setTimeout(() => {
            if (!printWindow.closed) {
                printWindow.print();
            }
        }, 350);
    };

    const handleAddToPos = () => {
        if (!hasQuoteItems) {
            showError('Add at least one part or service before sending to POS.');
            return;
        }

        clearCart();
        setPosCustomerName(customerName || 'Walk-in Customer');

        selectedParts.forEach((part) => {
            addPosItem({
                id: part.id,
                productId: part.id,
                lineType: 'product',
                name: part.name,
                sku: getProductPartNumber(part) || part.sku,
                price: Number(part.price ?? 0),
                quantity: Number(part.stock ?? part.maxQuantity ?? 999),
                maxQuantity: Number(part.stock ?? part.maxQuantity ?? 999),
            }, Number(part.quantity ?? 1));
        });

        selectedServices.forEach((service) => {
            addPosItem({
                id: `service-${service.id}`,
                serviceId: service.id,
                lineType: 'service',
                name: service.name,
                sku: 'SERVICE',
                price: Number(service.price ?? 0),
                quantity: 999,
                maxQuantity: 999,
            }, Number(service.quantity ?? 1));
        });

        success('Quotation summary added to POS cart.');
        navigate('/pos');
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
                                            <p className="text-xs text-primary-500">{quote.customer_phone || 'No phone'} � Valid until {quote.valid_until || 'N/A'}</p>
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
                                placeholder="Search parts by part number, name, or model..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-primary-200 rounded-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm"
                            />
                            {searchQuery.trim() && partNumberSuggestions.length > 0 && (
                                <div className="absolute z-20 mt-2 max-h-48 w-full overflow-y-auto rounded-xl border border-primary-200 bg-white py-1 shadow-lg">
                                    {partNumberSuggestions.map((product) => (
                                        <button
                                            key={product.id}
                                            type="button"
                                            onClick={() => {
                                                setSearchQuery(getProductPartNumber(product));
                                                setFocusedProduct(product);
                                            }}
                                            className="flex w-full flex-col px-3 py-2 text-left transition hover:bg-primary-50"
                                        >
                                            <span className="truncate text-sm font-semibold text-primary-950">{product.name}</span>
                                            <span className="font-mono text-xs text-primary-500">{getProductPartNumber(product) || 'No part number'} · {product.model || 'Universal fitment'}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
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
                                    <p className="mt-1 text-xs font-mono text-primary-500">{getProductPartNumber(product) || 'No part number'}</p>
                                    <p className="text-[11px] text-primary-400 mt-1">{product.model || 'Universal fitment'}</p>
                                    <p className="mt-3 text-sm font-bold text-accent-blue">{formatCurrency(product.price || 0)}</p>
                                </button>
                            ))}
                        </div>
                    </Card>

                    {focusedProduct && (
                        <div className="space-y-3">
                            <div className="flex flex-col gap-3 rounded-xl border border-primary-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-400">Selected bundle anchor</p>
                                    <p className="mt-1 font-semibold text-primary-950">{focusedProduct.name}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {selectedParts.length > 1 && (
                                        <select
                                            value={focusedProduct.id}
                                            onChange={(event) => {
                                                const nextProduct = selectedParts.find((part) => part.id === event.target.value);
                                                if (nextProduct) setFocusedProduct(nextProduct);
                                            }}
                                            className="min-h-11 rounded-xl border border-primary-200 bg-primary-50 px-3 text-sm font-semibold text-primary-900 outline-none focus:border-accent-blue"
                                        >
                                            {selectedParts.map((part) => (
                                                <option key={`${part.id}-quote-bundle-anchor`} value={part.id}>{part.name}</option>
                                            ))}
                                        </select>
                                    )}
                                    <Button variant="secondary" onClick={() => setShowSmartBundles((value) => !value)}>
                                        {showSmartBundles ? 'Hide Smart Bundles' : 'Show Smart Bundles'}
                                    </Button>
                                </div>
                            </div>
                            {showSmartBundles && (
                                <ProductPackageSuggestions
                                    product={focusedProduct}
                                    vehicleModelId={focusedProduct.model || null}
                                    anchorQuantity={focusedPartSelection?.quantity ?? 1}
                                    onAddBundle={addBundleToQuote}
                                    onAddProduct={(recommendation) => {
                                if (!recommendation.recommendedProduct) {
                                    return;
                                }

                                addPart(recommendation.recommendedProduct, {
                                    price: Number(recommendation.resolvedPrice ?? recommendation.recommendedProduct.price ?? recommendation.recommendedPrice ?? 0),
                                    isUpsell: true,
                                    recommendationRuleId: recommendation.packageItemId || recommendation.ruleId || null,
                                    catalogPrice: Number(recommendation.catalogPrice ?? recommendation.catalog_price ?? recommendation.recommendedProduct.price ?? recommendation.recommendedPrice ?? 0),
                                    ...(recommendation.bundleMeta ?? {}),
                                });
                                    }}
                                    onAddService={(recommendation) => {
                                if (!recommendation.recommendedServiceId) {
                                    return;
                                }

                                setSelectedServices((services) => {
                                    const nextService = {
                                        id: recommendation.recommendedServiceId,
                                        name: recommendation.recommendedServiceName,
                                        price: Number(recommendation.resolvedPrice ?? recommendation.recommendedPrice ?? 0),
                                        quantity: 1,
                                        isUpsell: true,
                                        recommendationRuleId: recommendation.packageItemId || recommendation.ruleId || null,
                                        catalogPrice: Number(recommendation.catalogPrice ?? recommendation.catalog_price ?? recommendation.recommendedPrice ?? 0),
                                        ...(recommendation.bundleMeta ?? {}),
                                    };
                                    const existing = services.find((service) => service.id === recommendation.recommendedServiceId);

                                    if (existing) {
                                        return services.map((service) => (service.id === recommendation.recommendedServiceId ? {
                                            ...service,
                                            ...nextService,
                                            price: Math.min(Number(service.price ?? 0), Number(nextService.price ?? 0)),
                                        } : service));
                                    }

                                    return [
                                        ...services,
                                        nextService,
                                    ];
                                });
                                    }}
                                    selectedProductIds={selectedParts.map((part) => part.id)}
                                    selectedServiceIds={selectedServices.map((service) => service.id)}
                                    title="Smart Mitsubishi Bundles"
                                    subtitle="Smart upsell bundles of matched parts and services, ranked by exact model first and family fallback second."
                                />
                            )}
                        </div>
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
                    <div className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm xl:sticky xl:top-20">
                        <h3 className="text-lg font-display font-bold text-primary-950 mb-4 pb-3 border-b border-primary-100">Quote Summary</h3>

                        {selectedParts.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm font-semibold text-primary-500 uppercase tracking-widest mb-2">Parts</p>
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {selectedParts.map((part) => (
                                        <div key={part.id} className="flex items-center justify-between p-2 bg-primary-50 rounded-lg border border-primary-100">
                                            <div className="flex-1 min-w-0 mr-2">
                                                <p className="text-sm font-semibold text-primary-950 truncate">{part.name}</p>
                                                <p className="text-[10px] text-primary-500 font-mono">{getProductPartNumber(part) || 'No part number'}</p>
                                                {part.bundleKey && <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-accent-success">{part.bundleTierLabel} bundle</p>}
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
                                            {service.bundleKey && <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent-success">{service.bundleTierLabel} bundle labor</p>}
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
                            {totals.bundleDiscountTotal > 0 && (
                                <div className="flex justify-between text-sm text-accent-success font-medium">
                                    <span>Bundle Savings Applied</span>
                                    <span>-{formatCurrency(totals.bundleDiscountTotal)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm text-primary-600 font-medium">
                                <span>VAT (12%)</span>
                                <span>{formatCurrency(totals.vat)}</span>
                            </div>
                            <div className="flex justify-between text-xl font-bold text-primary-950 pt-3 mt-1 border-t border-primary-200">
                                <span>Total Estimate</span>
                                <span className="min-w-0 break-words text-right text-accent-blue">{formatCurrency(totals.total)}</span>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            <Button
                                variant="secondary"
                                fullWidth
                                leftIcon={<ShoppingCart className="w-4 h-4" />}
                                onClick={handleAddToPos}
                                disabled={!hasQuoteItems}
                            >
                                Add to POS
                            </Button>
                            <Button
                                variant="primary"
                                fullWidth
                                leftIcon={<Printer className="w-4 h-4" />}
                                onClick={handlePrint}
                                disabled={!hasQuoteItems}
                            >
                                Print Quotation
                            </Button>
                            <Button
                                variant="secondary"
                                fullWidth
                                leftIcon={<Save className="w-4 h-4" />}
                                onClick={handleSave}
                                isLoading={saving}
                                disabled={!hasQuoteItems}
                            >
                                {currentEstimateId ? 'Save Revision' : 'Save Quotation'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default QuoteBuilder;



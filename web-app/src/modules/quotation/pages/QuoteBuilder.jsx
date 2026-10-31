import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
    Archive,
    Copy,
    Download,
    FileClock,
    FileText,
    Phone,
    Printer,
    Save,
    Search,
    ShoppingCart,
    Trash2,
    User,
    Wrench,
} from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { formatCurrency } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import useProductCatalog from '../../../hooks/useProductCatalog';
import useServiceCatalog from '../../../hooks/useServiceCatalog';
import useManagedQuotePackages from '../../../hooks/useManagedQuotePackages';
import ManagedQuotePackages from '../../public/components/ManagedQuotePackages';
import PublicVehicleSelector from '../../public/components/PublicVehicleSelector';
import { isManagedBundle, managedSelectionsFromLines, savedManagedOffers } from '../../public/utils/managedQuotePackages';
import { calculateQuoteTotals, clearBundlePricing, createQuoteLineKey } from "../../public/utils/bundleQuotePricing";
import { hasPositivePartPrice } from '../../../utils/catalogPrice';
import { getPartNumberSearchSuggestions, getProductPartNumber } from '../../../utils/barcode';
import { downloadQuotationPdf } from '../utils/downloadQuotationPdf';
import QuoteServiceOrderHandoff from '../components/QuoteServiceOrderHandoff';
import SavedQuotationBrowser from '../components/SavedQuotationBrowser';
import {
    createEstimate,
    archiveEstimate,
    deleteEstimate,
    getEstimateDetail,
    getEstimateRevisions,
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
        lineKey: createQuoteLineKey(),
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
    issuedAt,
    validUntil,
}) {
    const lineItems = [
        ...selectedParts.map((part) => ({
            kind: 'Part',
            name: part.name,
            code: getProductPartNumber(part) || 'No part number',
            quantity: Number(part.quantity ?? 1),
            unitPrice: Number(part.price ?? 0),
            catalogUnitPrice: Number(part.catalogPrice ?? part.price ?? 0),
            lineTotal: Number(part.price ?? 0) * Number(part.quantity ?? 1),
            bundleLabel: part.bundleKey ? `${part.bundleName || 'Package'} (${part.bundleTierLabel || 'Complete package'})` : '',
        })),
        ...selectedServices.map((service) => ({
            kind: 'Service',
            name: service.name,
            code: service.bundleKey ? `${service.bundleTierLabel || 'Smart'} bundle labor` : 'Service / labor',
            quantity: Number(service.quantity ?? 1),
            unitPrice: Number(service.price ?? 0),
            catalogUnitPrice: Number(service.catalogPrice ?? service.price ?? 0),
            lineTotal: Number(service.price ?? 0) * Number(service.quantity ?? 1),
            bundleLabel: service.bundleKey ? `${service.bundleName || 'Package'} (${service.bundleTierLabel || 'Complete package'})` : '',
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
            <td>${escapeHtml(formatCurrency(item.unitPrice))}${item.catalogUnitPrice > item.unitPrice ? `<span>Catalog: ${escapeHtml(formatCurrency(item.catalogUnitPrice))}</span>` : ''}</td>
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
                            <p>Issued ${escapeHtml(issuedAt || 'Not recorded')}</p>
                        </div>
                    </section>
                    <section class="meta-grid">
                        <div class="box"><span class="label">Customer</span><div class="value">${escapeHtml(customerName || 'Walk-in Customer')}</div><div class="muted">${escapeHtml(customerPhone || 'No phone recorded')}</div></div>
                        <div class="box"><span class="label">Prepared By</span><div class="value">LimenServe</div><div class="muted">Admin quotation</div></div>
                        <div class="box"><span class="label">Valid until</span><div class="value">${escapeHtml(validUntil || 'Not recorded')}</div><div class="muted">Subject to stock availability</div></div>
                        <div class="box"><span class="label">Total</span><div class="value">${escapeHtml(formatCurrency(totals.total))}</div><div class="muted">VAT included</div></div>
                    </section>
                    <section class="section">
                        <h3>Quoted Items</h3>
                        <table><thead><tr><th style="width:42px;">#</th><th>Item</th><th style="width:70px;">Qty</th><th style="width:120px;">Unit</th><th style="width:120px;">Total</th></tr></thead><tbody>${rows}</tbody></table>
                    </section>
                    <section class="section"><h3>Bundle Pricing</h3><div class="notes">${bundleRows}</div></section>
                    <section class="summary">
                        <div class="summary-card">
                            <div class="summary-row"><span>Parts subtotal</span><strong>${escapeHtml(formatCurrency(totals.partsCatalogTotal))}</strong></div>
                            <div class="summary-row"><span>Services subtotal</span><strong>${escapeHtml(formatCurrency(totals.servicesCatalogTotal))}</strong></div>
                            ${totals.bundleDiscountTotal > 0 ? `<div class="summary-row"><span>Bundle savings</span><strong>-${escapeHtml(formatCurrency(totals.bundleDiscountTotal))}</strong></div>` : ''}
                            <div class="summary-row"><span>Subtotal after savings</span><strong>${escapeHtml(formatCurrency(totals.subtotal))}</strong></div>
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
    const quoteTotals = calculateQuoteTotals(selectedParts, selectedServices);
    const taxTotal = quoteTotals.vat;
    const appliedBundles = quoteTotals.appliedBundles;
    const bundleDiscountTotal = quoteTotals.bundleDiscountTotal;
    const subtotalBeforeDiscount = quoteTotals.subtotalBeforeDiscount;
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
            grand_total: quoteTotals.total,
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
        currentEstimateStatus: String(estimate?.estimate?.status || 'draft').toLowerCase(),
        customerName: estimate?.customer?.name || '',
        customerPhone: estimate?.customer?.phone || '',
        notes: estimate?.estimate?.note || '',
        currentEstimateNumber: estimate?.estimate?.estimate_number || '',
        currentEstimateRevision: Number(estimate?.estimate?.revision_number ?? 0),
        selectedParts: items
            .filter((item) => item.line_type === 'product')
            .map((item) => ({
                lineKey: item.id || createQuoteLineKey(),
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
                lineKey: item.id || createQuoteLineKey(),
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
    const { success, error: showError, info, loading: showToastLoading, updateToast } = useToast();
    const { services: availableServices, loading: servicesLoading, error: servicesError } = useServiceCatalog();
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [quoteVehicle, setQuoteVehicle] = useState({});
    const [quoteVehicleChanged, setQuoteVehicleChanged] = useState(false);
    const [selectedParts, setSelectedParts] = useState([]);
    const [selectedServices, setSelectedServices] = useState([]);
    const [notes, setNotes] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [quotesRefresh, setQuotesRefresh] = useState(0);
    const [saving, setSaving] = useState(false);
    const [currentEstimateId, setCurrentEstimateId] = useState(null);
    const [currentEstimateNumber, setCurrentEstimateNumber] = useState('');
    const [currentEstimateRevision, setCurrentEstimateRevision] = useState(0);
    const [savedEstimateSnapshot, setSavedEstimateSnapshot] = useState(null);
    const quoteMutationVersion = useRef(0);
    const quoteSaveBusy = useRef(false);
    const quoteConversionBusy = useRef(false);
    const [handoffBusy, setHandoffBusy] = useState(false);
    const quoteLoadRequest = useRef(0);
    const handleHandoffBusy = useCallback((busy) => {
        if (busy && (quoteSaveBusy.current || quoteConversionBusy.current)) return false;
        quoteConversionBusy.current = busy;
        if (busy) quoteLoadRequest.current += 1;
        setHandoffBusy(busy);
        return true;
    }, []);
    const [currentEstimateStatus, setCurrentEstimateStatus] = useState('draft');
    const [quoteDirty, setQuoteDirty] = useState(false);
    const [changeNote, setChangeNote] = useState('Customer requested item updates');
    const [, setRevisions] = useState([]);
    const [focusedProduct, setFocusedProduct] = useState(null);
    const [quoteToDelete, setQuoteToDelete] = useState(null);
    const [deletingQuoteId, setDeletingQuoteId] = useState(null);
    const [quoteToArchive, setQuoteToArchive] = useState(null);
    const [archivingQuoteId, setArchivingQuoteId] = useState(null);

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
    const markQuoteDirty = () => {
        quoteMutationVersion.current += 1;
        setQuoteDirty(true);
    };

    const managedPackages = useManagedQuotePackages({
        parts: selectedParts,
        services: selectedServices,
        setParts: setSelectedParts,
        setServices: setSelectedServices,
        onDirty: markQuoteDirty,
        onError: showError,
    });

    const totals = useMemo(() => {
        const quoteTotals = calculateQuoteTotals(selectedParts, selectedServices);
        return {
            partsCatalogTotal: quoteTotals.partsCatalogSubtotal,
            servicesCatalogTotal: quoteTotals.servicesCatalogSubtotal,
            partsTotal: quoteTotals.partsSubtotal,
            servicesTotal: quoteTotals.servicesSubtotal,
            appliedBundles: quoteTotals.appliedBundles,
            bundleDiscountTotal: quoteTotals.bundleDiscountTotal,
            subtotalBeforeDiscount: quoteTotals.subtotalBeforeDiscount,
            subtotal: quoteTotals.subtotal,
            vat: quoteTotals.vat,
            total: quoteTotals.total,
        };
    }, [selectedParts, selectedServices]);

    const breakBundle = (bundleKey) => {
        if (!bundleKey) return true;
        if (isManagedBundle(bundleKey)) {
            showError('Use the package controls to change this package. Its included items stay together.');
            return false;
        }
        if (!window.confirm('This change removes the package discount from its remaining items and returns them to their listed prices. Continue?')) return false;
        setSelectedParts((parts) => parts.map((part) => part.bundleKey === bundleKey ? clearBundlePricing(part) : part));
        setSelectedServices((services) => services.map((service) => service.bundleKey === bundleKey ? clearBundlePricing(service) : service));
        return true;
    };

    const addPart = (product, extra = {}) => {
        if (!hasPositivePartPrice(product?.price)) {
            showError('Confirm a positive selling price in Products before adding this part.');
            return;
        }
        markQuoteDirty();
        setFocusedProduct(product);
        setSelectedParts((parts) => {
            const bundleKey = extra.bundleKey || '';
            if (bundleKey && parts.some((part) => part.id === product.id && part.bundleKey === bundleKey)) return parts;

            const ordinaryLine = parts.find((part) => part.id === product.id && !part.bundleKey);
            const nextPrice = Number(extra.price ?? product.price ?? ordinaryLine?.price ?? 0);
            if (!Number.isFinite(nextPrice)) return parts;

            if (bundleKey && ordinaryLine && Number(ordinaryLine.quantity || 1) === 1) {
                return parts.map((part) => part.lineKey === ordinaryLine.lineKey
                    ? { ...part, ...extra, lineKey: part.lineKey, price: nextPrice, catalogPrice: Number(extra.catalogPrice ?? part.catalogPrice ?? part.price), quantity: 1 }
                    : part);
            }

            if (!bundleKey && ordinaryLine) {
                return parts.map((part) => part.lineKey === ordinaryLine.lineKey
                    ? { ...part, quantity: Number(part.quantity || 1) + 1 }
                    : part);
            }

            const line = mapCatalogProduct(product);
            return [...parts, { ...line, ...extra, lineKey: createQuoteLineKey(), price: nextPrice, catalogPrice: Number(extra.catalogPrice ?? product.price ?? nextPrice) }];
        });
    };

    const removePart = (identifier) => {
        const selectedLine = selectedParts.find((part) => part.lineKey === identifier) || selectedParts.find((part) => part.id === identifier);
        if (!selectedLine) return;
        if (isManagedBundle(selectedLine.bundleKey)) {
            managedPackages.remove(selectedLine.bundleKey.slice(4));
            return;
        }
        if (selectedLine.bundleKey && !breakBundle(selectedLine.bundleKey)) return;
        markQuoteDirty();
        setSelectedParts((parts) => parts.filter((part) => part.lineKey !== selectedLine.lineKey));
        if (focusedProduct?.id === selectedLine.id) setFocusedProduct(null);
    };

    const updatePartQuantity = (identifier, quantity) => {
        const selectedLine = selectedParts.find((part) => part.lineKey === identifier) || selectedParts.find((part) => part.id === identifier);
        if (!selectedLine) return;
        if (quantity < 1) {
            removePart(selectedLine.lineKey);
            return;
        }
        if (selectedLine.bundleKey && !breakBundle(selectedLine.bundleKey)) return;
        markQuoteDirty();
        setSelectedParts((parts) => parts.map((part) => (part.lineKey === selectedLine.lineKey ? { ...part, quantity } : part)));
    };

    const toggleService = (service) => {
        markQuoteDirty();
        const existing = selectedServices.find((selected) => selected.id === service.id && !selected.bundleKey);
        if (existing) {
            setSelectedServices((services) => services.filter((selected) => selected.lineKey !== existing.lineKey));
        } else {
            setSelectedServices((services) => [...services, {
                lineKey: createQuoteLineKey(),
                id: service.id,
                name: service.name,
                price: Number(service.price ?? 0),
                catalogPrice: Number(service.price ?? 0),
                quantity: 1,
            }]);
        }
    };


    const loadQuote = async (estimateId) => {
        if (quoteSaveBusy.current || quoteConversionBusy.current) return;
        if (quoteDirty && !window.confirm('Load this quotation and discard your unsaved changes?')) return;
        const request = ++quoteLoadRequest.current;
        const version = quoteMutationVersion.current;
        try {
            const [detail, history] = await Promise.allSettled([
                getEstimateDetail(estimateId), getEstimateRevisions(estimateId),
            ]);
            if (request !== quoteLoadRequest.current || quoteSaveBusy.current) return;
            if (version !== quoteMutationVersion.current) {
                info('You made changes while this quotation was loading. Your current edits were kept.');
                return;
            }
            if (detail.status === 'rejected') throw detail.reason;
            const estimate = detail.value;
            savedManagedOffers(estimate);
            const nextState = mapEstimateDetailToState(estimate);
            setCurrentEstimateId(estimateId);
            setCurrentEstimateNumber(nextState.currentEstimateNumber);
            setCurrentEstimateRevision(nextState.currentEstimateRevision);
            setCurrentEstimateStatus(nextState.currentEstimateStatus);
            setCustomerName(nextState.customerName);
            setCustomerPhone(nextState.customerPhone);
            setNotes(nextState.notes);
            setSelectedParts(nextState.selectedParts);
            setSelectedServices(nextState.selectedServices);
            setSavedEstimateSnapshot(estimate);
            setQuoteVehicle(estimate.vehicle ? { ...estimate.vehicle, model: estimate.vehicle.model_name || estimate.vehicle.model,
                fitmentId: estimate.vehicle.fitmentId || estimate.vehicle.metadata?.fitmentId || '',
                variant: estimate.vehicle.variant || estimate.vehicle.metadata?.variant || '',
            } : {});
            setQuoteVehicleChanged(false);
            managedPackages.hydrate(estimate);
            setFocusedProduct(nextState.selectedParts[0] || null);
            setQuoteDirty(false);
            setRevisions(history.status === 'fulfilled' ? history.value : []);
            info(`Loaded quote ${nextState.currentEstimateNumber || estimateId}${history.status === 'rejected' ? '. Its history could not be loaded yet.' : ''}`);
        } catch (loadError) {
            if (request === quoteLoadRequest.current && !quoteSaveBusy.current) showError(loadError.message || 'Unable to load the selected quotation.');
        }
    };

    const resetQuotationEditor = () => {
        if (quoteSaveBusy.current || quoteConversionBusy.current) return;
        quoteLoadRequest.current += 1;
        setCurrentEstimateId(null);
        setCurrentEstimateNumber('');
        setCurrentEstimateRevision(0);
        setSavedEstimateSnapshot(null);
        setCurrentEstimateStatus('draft');
        setCustomerName('');
        setCustomerPhone('');
        setNotes('');
        setSelectedParts([]);
        setSelectedServices([]);
        setQuoteVehicle({});
        setQuoteVehicleChanged(false);
        managedPackages.reset();
        setFocusedProduct(null);
        setRevisions([]);
        setQuoteDirty(false);
    };

    const confirmDeleteQuote = async () => {
        if (quoteConversionBusy.current) return;
        const quote = quoteToDelete;
        if (!quote?.id) {
            return;
        }

        setDeletingQuoteId(quote.id);
        try {
            await deleteEstimate(quote.id);
            setQuotesRefresh((value) => value + 1);
            if (currentEstimateId === quote.id) {
                resetQuotationEditor();
            }
            setQuoteToDelete(null);
            success(quote.estimate_number
                ? `Draft quotation ${quote.estimate_number} deleted.`
                : 'Draft quotation deleted.');
        } catch (deleteError) {
            showError(deleteError.message || 'Unable to delete the draft quotation.');
        } finally {
            setDeletingQuoteId(null);
        }
    };

    const confirmArchiveQuote = async () => {
        if (quoteConversionBusy.current) return;
        const quote = quoteToArchive;
        if (!quote?.id) {
            return;
        }

        setArchivingQuoteId(quote.id);
        try {
            await archiveEstimate(quote.id);
            setQuotesRefresh((value) => value + 1);
            if (currentEstimateId === quote.id) {
                resetQuotationEditor();
            }
            setQuoteToArchive(null);
            success(quote.estimate_number
                ? `Quotation ${quote.estimate_number} archived.`
                : 'Quotation archived.');
        } catch (archiveError) {
            showError(archiveError.message || 'Unable to archive the quotation.');
        } finally {
            setArchivingQuoteId(null);
        }
    };

    const handleSave = async () => {
        if (quoteSaveBusy.current || quoteConversionBusy.current) return;
        if (!selectedParts.length && !selectedServices.length) {
            showError('Add at least one part or service before saving.');
            return;
        }

        quoteSaveBusy.current = true;
        quoteLoadRequest.current += 1;
        setSaving(true);
        let confirmedId = currentEstimateId;
        try {
            const submittedVersion = quoteMutationVersion.current;
            const payload = buildEstimatePayload({
                customerName,
                customerPhone,
                notes,
                selectedParts,
                selectedServices,
                currentEstimateNumber,
            });
            payload.estimate.status = currentEstimateId ? currentEstimateStatus : 'draft';
            payload.managed_packages = managedSelectionsFromLines([...selectedParts, ...selectedServices]);
            payload.reprice_package_ids = managedPackages.repriceIds;
            if (!currentEstimateId || quoteVehicleChanged) {
                payload.vehicle = quoteVehicle.model ? {
                    make: quoteVehicle.make || 'Mitsubishi',
                    model_name: quoteVehicle.model,
                    year: quoteVehicle.year || null,
                    engine: quoteVehicle.engine || null,
                    fitmentId: quoteVehicle.fitmentId || null,
                    variant: quoteVehicle.variant || null,
                } : null;
            }

            if (currentEstimateId) {
                payload.expected_revision = currentEstimateRevision;
                const updated = await updateEstimate(currentEstimateId, payload, changeNote);
                const estimate = updated.estimate;
                setSavedEstimateSnapshot(estimate);
                setCurrentEstimateRevision(Number(estimate.estimate.revision_number));
                managedPackages.acknowledge(estimate);
                if (quoteMutationVersion.current === submittedVersion) setQuoteVehicleChanged(false);
                setQuoteDirty(quoteMutationVersion.current !== submittedVersion);
                success('Quotation updated and revision saved.');
            } else {
                // createEstimate returns the complete API result, not the UUID itself.
                // Passing that object into the detail route stringifies it as
                // "[object Object]" and causes a database UUID error.
                const created = await createEstimate(payload);
                const estimateId = created?.estimateId;
                if (!estimateId) {
                    throw new Error('The quotation was saved, but its identifier was not returned.');
                }

                const estimate = created.estimate;
                confirmedId = estimateId;
                setSavedEstimateSnapshot(estimate);
                setCurrentEstimateId(estimateId);
                setCurrentEstimateNumber(estimate?.estimate?.estimate_number || '');
                setCurrentEstimateRevision(Number(estimate?.estimate?.revision_number ?? 0));
                managedPackages.acknowledge(estimate);
                if (quoteMutationVersion.current === submittedVersion) setCurrentEstimateStatus(String(estimate?.estimate?.status || 'draft').toLowerCase());
                if (quoteMutationVersion.current === submittedVersion) setQuoteVehicleChanged(false);
                setQuoteDirty(quoteMutationVersion.current !== submittedVersion);
                success('Quotation saved successfully.');
            }

            // These panels are secondary reads. Their failure must not relabel
            // a committed quotation as an unsuccessful save or trigger a retry.
            const request = quoteLoadRequest.current;
            setQuotesRefresh((value) => value + 1);
            void getEstimateRevisions(confirmedId).then((history) => {
                if (request === quoteLoadRequest.current) setRevisions(history);
            }).catch(() => {
                if (request === quoteLoadRequest.current) info('Your quotation is saved. Its history could not be refreshed yet.');
            });
        } catch (saveError) {
            showError(saveError.message || 'Unable to save the quotation.');
        } finally {
            quoteSaveBusy.current = false;
            setSaving(false);
        }
    };

    const hasQuoteItems = selectedParts.length > 0 || selectedServices.length > 0;

    // Issued documents use the acknowledged snapshot, never current CMS prices
    // or a fresh validity date calculated when somebody downloads them again.
    const getDocumentState = () => {
        const saved = currentEstimateId ? savedEstimateSnapshot : null;
        const state = saved ? mapEstimateDetailToState(saved) : { customerName, customerPhone, notes, selectedParts, selectedServices };
        const calculated = saved ? calculateQuoteTotals(state.selectedParts, state.selectedServices) : null;
        const header = saved?.estimate;
        const documentTotals = saved ? {
            partsCatalogTotal: calculated.partsCatalogSubtotal,
            servicesCatalogTotal: calculated.servicesCatalogSubtotal,
            appliedBundles: calculated.appliedBundles,
            subtotalBeforeDiscount: Number(header.subtotal),
            bundleDiscountTotal: Number(header.discount_total),
            subtotal: Number(header.subtotal) - Number(header.discount_total),
            vat: Number(header.tax_total),
            total: Number(header.grand_total),
        } : totals;
        const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-PH') : '';
        return { ...state, totals: documentTotals,
            quoteNumber: header?.estimate_number || currentEstimateNumber || 'Draft Quotation',
            issuedAt: formatDate(header ? header.issued_at || header.created_at : new Date()),
            validUntil: formatDate(header ? header.valid_until : Date.now() + 30 * 24 * 60 * 60 * 1000),
        };
    };

    const handlePrint = () => {
        if (saving || (currentEstimateId && (quoteDirty || !savedEstimateSnapshot))) {
            showError('Save this quotation revision before printing, so the document matches the saved record.');
            return;
        }
        if (!hasQuoteItems) {
            showError('Add at least one part or service before printing.');
            return;
        }

        const printWindow = window.open('', '_blank', 'width=960,height=720');
        if (!printWindow) {
            showError('Please allow pop-ups to print or save the quotation PDF.');
            return;
        }

        const html = buildPrintableQuote(getDocumentState());

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

    const handleDownloadPdf = async () => {
        if (saving || (currentEstimateId && (quoteDirty || !savedEstimateSnapshot))) {
            showError('Save this quotation revision before downloading, so the PDF matches the saved record.');
            return;
        }
        if (!hasQuoteItems) {
            showError('Add at least one part or service before downloading the quotation.');
            return;
        }
        const toastId = showToastLoading('Preparing your quotation PDF…');
        try {
            const { quoteNumber, customerName, customerPhone, notes, selectedParts, selectedServices, totals, issuedAt, validUntil } = getDocumentState();
            await downloadQuotationPdf({
                referenceValue: quoteNumber,
                customerName: customerName || 'Walk-in Customer',
                customerPhone,
                issuedAt,
                validUntil,
                note: notes,
                subtotalBeforeDiscount: totals.subtotalBeforeDiscount,
                subtotalAfterDiscount: totals.subtotal,
                discountTotal: totals.bundleDiscountTotal,
                vat: totals.vat,
                total: totals.total,
                items: [
                    ...selectedParts.map((part) => ({
                        kind: 'Part',
                        partNumber: getProductPartNumber(part),
                        name: part.name,
                        subtitle: part.bundleKey ? `${part.bundleName || 'Package'} · ${part.bundleTierLabel || 'Bundle'}` : '',
                        quantity: Number(part.quantity ?? 1),
                        unitPrice: Number(part.price ?? 0),
                        catalogUnitPrice: Number(part.catalogPrice ?? part.price ?? 0),
                        lineTotal: Number(part.price ?? 0) * Number(part.quantity ?? 1),
                    })),
                    ...selectedServices.map((service) => ({
                        kind: 'Service',
                        name: service.name,
                        subtitle: service.bundleKey ? `${service.bundleName || 'Package'} · ${service.bundleTierLabel || 'Bundle labor'}` : 'Service / labor',
                        quantity: Number(service.quantity ?? 1),
                        unitPrice: Number(service.price ?? 0),
                        catalogUnitPrice: Number(service.catalogPrice ?? service.price ?? 0),
                        lineTotal: Number(service.price ?? 0) * Number(service.quantity ?? 1),
                    })),
                ],
            });
            updateToast(toastId, { type: 'success', message: 'Quotation PDF downloaded.' });
        } catch (pdfError) {
            updateToast(toastId, { type: 'error', message: pdfError.message || 'Unable to create the quotation PDF.' });
        }
    };

    const handleCopyQuoteNumber = async () => {
        if (!currentEstimateNumber) return;
        try {
            await navigator.clipboard.writeText(currentEstimateNumber);
            success('Quotation number copied!');
        } catch {
            showError('Unable to copy the quotation number.');
        }
    };

    const handleAddToPos = () => {
        if (!currentEstimateId || quoteDirty || saving || handoffBusy || !['approved','converted_sale'].includes(savedEstimateSnapshot?.estimate?.status)) {
            showError('Save an approved quotation before opening its POS checkout.');
            return;
        }
        navigate('/pos?estimateId=' + encodeURIComponent(currentEstimateId));
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                <div className="xl:col-span-3 space-y-6">
                    <Card title="Saved Quotations" subtitle="Find a saved quotation, review its items, or continue working on a current quote.">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
                            <SavedQuotationBrowser selectedId={currentEstimateId} onSelect={loadQuote}
                                onDelete={setQuoteToDelete} onArchive={setQuoteToArchive}
                                refreshKey={quotesRefresh} disabled={saving || handoffBusy} />

                            <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-5">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-400">Editable quotation workflow</p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <h3 className="text-xl font-display font-semibold text-primary-950">{currentEstimateNumber || 'New quotation draft'}</h3>
                                            {currentEstimateNumber && (
                                                <button type="button" onClick={handleCopyQuoteNumber} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-primary-200 bg-white px-3 text-xs font-semibold text-primary-700 transition hover:border-accent-blue hover:text-accent-blue" aria-label="Copy quotation number">
                                                    <Copy className="h-3.5 w-3.5" /> Copy number
                                                </button>
                                            )}
                                        </div>
                                        <p className="mt-1 text-sm text-primary-500">
                                            Save revisions without creating a brand new quotation. Customers can retrieve the same quotation for 30 days using the quote number and phone.
                                        </p>
                                    </div>
                                    {currentEstimateId && currentEstimateStatus === 'draft' && (
                                        <button
                                            type="button"
                                            onClick={() => setQuoteToDelete({ id: currentEstimateId, estimate_number: currentEstimateNumber, status: currentEstimateStatus })}
                                            className="inline-flex items-center gap-2 rounded-xl border border-accent-danger/30 bg-white px-3 py-2 text-sm font-semibold text-accent-danger transition hover:border-accent-danger hover:bg-accent-danger hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-danger/40"
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            Delete draft
                                        </button>
                                    )}
                                    {currentEstimateId && currentEstimateStatus !== 'draft' && (
                                        <button
                                            type="button"
                                            onClick={() => setQuoteToArchive({ id: currentEstimateId, estimate_number: currentEstimateNumber, status: currentEstimateStatus })}
                                            className="inline-flex items-center gap-2 rounded-xl border border-accent-blue/30 bg-white px-3 py-2 text-sm font-semibold text-accent-blue transition hover:border-accent-blue hover:bg-accent-blue hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40"
                                        >
                                            <Archive className="h-4 w-4" aria-hidden="true" />
                                            Archive quotation
                                        </button>
                                    )}
                                </div>

                                {currentEstimateId && ['approved', 'converted_service'].includes(savedEstimateSnapshot?.estimate?.status) && (
                                    <QuoteServiceOrderHandoff key={currentEstimateId} estimateId={currentEstimateId}
                                        estimateNumber={currentEstimateNumber} status={savedEstimateSnapshot.estimate.status}
                                        dirty={quoteDirty} saving={saving} onBusyChange={handleHandoffBusy} />
                                )}
                                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                                    {currentEstimateId && !currentEstimateStatus.startsWith('converted_') && (
                                        <label className="text-sm font-semibold text-primary-700">
                                            Quotation status
                                            <select
                                                className="mt-2 w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-primary-950"
                                                value={currentEstimateStatus}
                                                onChange={(event) => { markQuoteDirty(); setCurrentEstimateStatus(event.target.value); }}
                                            >
                                                <option value="draft">Draft</option>
                                                <option value="sent">Sent to customer</option>
                                                <option value="approved">Approved by customer</option>
                                                <option value="rejected">Rejected</option>
                                            </select>
                                            <span className="mt-1 block text-xs font-normal text-primary-500">Save the quotation after changing its status.</span>
                                        </label>
                                    )}
                                    <Input
                                        label="Customer Name"
                                        placeholder="Enter customer name"
                                        value={customerName}
                                        onChange={(e) => { markQuoteDirty(); setCustomerName(e.target.value); }}
                                        leftIcon={<User className="w-4 h-4" />}
                                    />
                                    <Input
                                        label="Phone Number"
                                        placeholder="09XX XXX XXXX"
                                        value={customerPhone}
                                        onChange={(e) => { markQuoteDirty(); setCustomerPhone(e.target.value); }}
                                        leftIcon={<Phone className="w-4 h-4" />}
                                    />
                                </div>

                                <div className="mt-4">
                                    <Input
                                        label="Revision Note"
                                        placeholder="What changed in this quote?"
                                        value={changeNote}
                                        onChange={(e) => { markQuoteDirty(); setChangeNote(e.target.value); }}
                                        leftIcon={<FileClock className="w-4 h-4" />}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card title="Order Parts" subtitle="Search by part number, product name, or vehicle model, then choose the parts for this quotation.">
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

                        <div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-sm font-semibold text-primary-950">Matched Components</h3><p className="text-xs text-primary-500">Review part numbers and fitment notes before adding items.</p></div><span className="shrink-0 text-xs text-primary-500">{availableProducts.length} shown</span></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {productsLoading ? (
                                <div className="col-span-full rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-500">Loading parts and current prices…</div>
                            ) : productsError ? (
                                <div className="col-span-full rounded-lg border border-accent-danger/20 bg-accent-danger/5 p-4 text-sm text-accent-danger">{productsError}</div>
                            ) : availableProducts.length === 0 ? (
                                <div className="col-span-full rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-500">No priced parts matched your search.</div>
                            ) : availableProducts.map((product) => (
                                <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => addPart(product)}
                                    disabled={!hasPositivePartPrice(product.price)}
                                    title={hasPositivePartPrice(product.price) ? `Add ${getProductPartNumber(product) || product.name}` : 'Confirm this part’s price in Products first.'}
                                    className={`rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:bg-primary-50 ${focusedProduct?.id === product.id ? 'border-accent-blue bg-accent-blue/5 shadow-sm' : 'border-primary-200 bg-white hover:border-primary-300 hover:shadow-sm'}`}
                                >
                                    <p className="text-sm font-semibold text-primary-950 line-clamp-2">{product.name}</p>
                                    <p className="mt-1 text-xs font-mono text-primary-500">{getProductPartNumber(product) || 'No part number'}</p>
                                    <p className="text-[11px] text-primary-600 mt-1">{product.model || 'Vehicle details not recorded'}</p>
                                    <p className="mt-3 text-sm font-bold text-accent-blue">{hasPositivePartPrice(product.price) ? formatCurrency(product.price) : 'Price needs review'}</p>
                                </button>
                            ))}
                        </div>
                    </Card>


                    <Card title="Select Services" subtitle="Add labor or maintenance services to the quotation.">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {servicesLoading ? (
                                <div className="col-span-full rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-500">Loading services...</div>
                            ) : servicesError ? (
                                <div className="col-span-full rounded-lg border border-accent-danger/20 bg-accent-danger/5 p-4 text-sm text-accent-danger">{servicesError}</div>
                            ) : availableServices.length === 0 ? (
                                <div className="col-span-full rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-500">No services are available right now.</div>
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

                    <PublicVehicleSelector vehicle={quoteVehicle} title="Vehicle for this quotation"
                        subtitle={currentEstimateId ? 'Vehicle changes apply only to this quotation. Review selected packages again before saving a different vehicle.' : 'Choose a model, year, and engine to see approved packages. Vehicle-independent services do not require a vehicle.'}
                        onChange={(patch) => { setQuoteVehicle((current) => ({ ...current, ...patch })); setQuoteVehicleChanged(true); markQuoteDirty(); }}
                        onClear={() => { setQuoteVehicle({}); setQuoteVehicleChanged(true); markQuoteDirty(); }} />

                    <ManagedQuotePackages controller={managedPackages} parts={selectedParts} services={selectedServices} vehicle={quoteVehicle} busy={saving} />

                    <Card title="Additional Notes">
                        <textarea
                            value={notes}
                            onChange={(e) => { markQuoteDirty(); setNotes(e.target.value); }}
                            placeholder="Add special requests, exclusions, or compatibility notes..."
                            rows={4}
                            className="w-full px-4 py-3 bg-white border border-primary-200 rounded-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm resize-none"
                        />
                    </Card>
                </div>

                <div className="xl:col-span-1">
                    <div className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-primary-100 pb-3"><h3 className="text-lg font-display font-bold text-primary-950">Quotation Summary</h3>{quoteDirty && <span role="status" className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{currentEstimateId ? 'Unsaved changes' : 'Unsaved draft'}</span>}</div>

                        {selectedParts.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm font-semibold text-primary-500 uppercase tracking-widest mb-2">Parts</p>
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {selectedParts.map((part) => (
                                        <div key={part.lineKey} className="flex items-center justify-between p-2 bg-primary-50 rounded-lg border border-primary-100">
                                            <div className="flex-1 min-w-0 mr-2">
                                                <p className="text-sm font-semibold text-primary-950 truncate">{part.name}</p>
                                                <p className="text-[10px] text-primary-500 font-mono">{getProductPartNumber(part) || 'No part number'}</p>
                                                {part.bundleKey && <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-accent-success">{part.bundleTierLabel} bundle</p>}
                                                <p className="text-xs font-bold text-accent-blue mt-1">{formatCurrency(part.price)} x {part.quantity}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    disabled={isManagedBundle(part.bundleKey)}
                                                    aria-label={`Quantity for ${part.name}`}
                                                    value={part.quantity}
                                                    onChange={(e) => updatePartQuantity(part.lineKey, parseInt(e.target.value, 10) || 0)}
                                                    className="w-14 px-2 py-1 bg-white border border-primary-200 rounded text-sm text-center font-bold text-primary-950 focus:outline-none focus:border-accent-blue shadow-sm"
                                                    min="1"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removePart(part.lineKey)}
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
                                        <div key={service.lineKey} className="flex items-center justify-between p-2 bg-primary-50 rounded-lg border border-primary-100">
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
                                <span>{formatCurrency(totals.partsCatalogTotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-primary-600 font-medium">
                                <span>Services Subtotal</span>
                                <span>{formatCurrency(totals.servicesCatalogTotal)}</span>
                            </div>
                            {totals.bundleDiscountTotal > 0 && (
                                <div className="flex justify-between text-sm text-accent-success font-medium">
                                    <span>Bundle Savings Applied</span>
                                    <span>-{formatCurrency(totals.bundleDiscountTotal)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm text-primary-600 font-medium">
                                <span>Subtotal after savings</span>
                                <span>{formatCurrency(totals.subtotal)}</span>
                            </div>
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
                                disabled={!currentEstimateId || quoteDirty || saving || handoffBusy || !['approved','converted_sale'].includes(savedEstimateSnapshot?.estimate?.status)}
                            >
                                Open saved quote in POS
                            </Button>
                            <p className="text-xs text-primary-700">Save an approved quotation first. Its POS checkout keeps the saved prices and leaves your regular cart unchanged.</p>
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
                                variant="outline"
                                fullWidth
                                leftIcon={<Download className="w-4 h-4" />}
                                onClick={handleDownloadPdf}
                                disabled={!hasQuoteItems}
                            >
                                Download PDF
                            </Button>
                            <Button
                                variant="secondary"
                                fullWidth
                                leftIcon={<Save className="w-4 h-4" />}
                                onClick={handleSave}
                                isLoading={saving}
                                disabled={!hasQuoteItems || handoffBusy}
                            >
                                {currentEstimateId ? 'Save Revision' : 'Save Quotation'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <ConfirmDialog
                isOpen={Boolean(quoteToDelete)}
                title="Delete draft quotation?"
                message={`This permanently removes ${quoteToDelete?.estimate_number || 'this draft'} and its saved line items. Sent or approved quotations cannot be deleted.`}
                confirmLabel="Delete draft"
                confirmVariant="delete"
                isLoading={deletingQuoteId === quoteToDelete?.id}
                onConfirm={confirmDeleteQuote}
                onClose={() => {
                    if (!deletingQuoteId) {
                        setQuoteToDelete(null);
                    }
                }}
            />

            <ConfirmDialog
                isOpen={Boolean(quoteToArchive)}
                title="Archive quotation?"
                message={`This removes ${quoteToArchive?.estimate_number || 'this quotation'} from the active list while keeping its history. Draft quotations should be deleted instead.`}
                confirmLabel="Archive quotation"
                confirmVariant="primary"
                isLoading={archivingQuoteId === quoteToArchive?.id}
                onConfirm={confirmArchiveQuote}
                onClose={() => {
                    if (!archivingQuoteId) {
                        setQuoteToArchive(null);
                    }
                }}
            />

        </div>
    );
};

export default QuoteBuilder;



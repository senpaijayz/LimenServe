import { useState, useEffect, useMemo } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { X, Wrench, User, Phone, Car, FileText, Save, CheckCircle, ArrowRight, Archive, CreditCard, Package, CalendarDays, UserCheck, Printer, Download, Search, Plus, Trash2, Clock } from 'lucide-react';
import Button from '../../../components/ui/Button';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import Input from '../../../components/ui/Input';
import { formatCurrency, formatDateTime, formatRelativeTime } from '../../../utils/formatters';
import ServiceStageBadge from './ServiceStageBadge';
import useDataStore from '../../../store/useDataStore';
import { getPartNumberSearchSuggestions, getProductPartNumber } from '../../../utils/barcode';
import { listMechanics } from '../../../services/mechanicsApi';
import { getServiceScheduleSlots } from '../../../services/serviceOrdersApi';
import { isServiceOrderOverdue } from '../utils/serviceOrderDisplay';
import { useToast } from '../../../components/ui/Toast';

const PRIORITY_STYLES = {
    low: 'border-slate-200 bg-slate-50 text-slate-700',
    normal: 'border-blue-200 bg-blue-50 text-blue-800',
    high: 'border-orange-200 bg-orange-50 text-orange-800',
    urgent: 'border-red-200 bg-red-50 text-red-800',
};

export function PriorityBadge({ priority }) {
    const normalized = String(priority || 'normal').toLowerCase();
    const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${PRIORITY_STYLES[normalized] || PRIORITY_STYLES.normal}`}>Priority: {label}</span>;
}

function manilaDateTimeParts(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function manilaDateInputValue(date = new Date()) {
    const parts = manilaDateTimeParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function manilaDateTimeInputValue(date) {
    const parts = manilaDateTimeParts(date);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function formatManilaDateTime(value) {
    if (!value || Number.isNaN(new Date(value).getTime())) return 'Not scheduled';
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(value));
}

function manilaDateTimeToIso(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return '';
    const [, year, month, day, hour, minute] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute))).toISOString();
}

function validateManilaSchedule(startValue, endValue) {
    const start = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(startValue || '');
    const end = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(endValue || '');
    if (!start || !end) return 'Choose a mechanic and service schedule.';
    const [, startDate, startHour, startMinute] = start;
    const [, endDate, endHour, endMinute] = end;
    const startTime = Number(startHour) * 60 + Number(startMinute);
    const endTime = Number(endHour) * 60 + Number(endMinute);
    const today = manilaDateInputValue(new Date());
    if (startDate < today) return 'Start date cannot be in the past.';
    if (startDate === today && new Date(manilaDateTimeToIso(startValue)).getTime() <= Date.now()) return 'Start time cannot be in the past.';
    if (endDate !== startDate) return 'End time must be on the same workday. Schedule separate workday assignments for multi-day jobs.';
    if (endTime <= startTime) return 'End time must be later than the start time.';
    const sunday = new Date(`${startDate}T12:00:00Z`).getUTCDay() === 0;
    const closing = sunday ? 12 * 60 : 17 * 60;
    if (startTime < 8 * 60 || startTime >= closing || endTime > closing) return sunday
        ? 'Sunday appointments must be between 8:00 AM and 12:00 PM.'
        : 'Workshop hours are 8:00 AM–5:00 PM.';
    return '';
}

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getLineItemDisplay = (item, index) => {
    const name = item.itemName ?? item.item_name ?? item.displayName ?? item.display_name ?? item.name ?? `Line ${index + 1}`;
    const code = item.itemSku ?? item.item_sku ?? item.sku ?? item.code ?? '';
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unitPrice ?? item.unit_price ?? item.price ?? 0);
    const lineTotal = Number(item.lineTotal ?? item.line_total ?? (quantity * unitPrice));

    return { name, code, quantity, unitPrice, lineTotal };
};

const buildPrintRows = (items, emptyLabel) => {
    if (!items.length) {
        return `<tr><td colspan="5" class="empty">${escapeHtml(emptyLabel)}</td></tr>`;
    }

    return items.map((item, index) => {
        const line = getLineItemDisplay(item, index);
        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <strong>${escapeHtml(line.name)}</strong>
                    ${line.code ? `<span>${escapeHtml(line.code)}</span>` : ''}
                </td>
                <td>${line.quantity}</td>
                <td>${escapeHtml(formatCurrency(line.unitPrice))}</td>
                <td>${escapeHtml(formatCurrency(line.lineTotal))}</td>
            </tr>
        `;
    }).join('');
};

const printServiceOrderDocument = ({ order, serviceItems, partItems, orderTotal, completedAt, mechanicName }) => {
    const printWindow = window.open('', '_blank', 'width=960,height=720');
    if (!printWindow) return;

    const vehicleLabel = [order.vehicle?.year, order.vehicle?.make, order.vehicle?.model].filter(Boolean).join(' ') || 'Vehicle not recorded';
    const createdAt = order.createdAt ?? order.created_at;
    const orderNumber = order.orderNumber ?? order.order_number ?? order.id;
    const status = order.status ? order.status.replace(/_/g, ' ') : 'pending';
    const paymentStatus = order.paymentStatus || order.payment_status || 'Unpaid';

    const html = `
        <!doctype html>
        <html>
            <head>
                <meta charset="utf-8" />
                <title>Service Order ${escapeHtml(orderNumber)}</title>
                <style>
                    @page { size: A4; margin: 14mm; }
                    * { box-sizing: border-box; }
                    body { margin: 0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; background: #fff; font-size: 12px; }
                    .sheet { width: 100%; }
                    .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 14px; }
                    .brand h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
                    .brand p { margin: 4px 0 0; color: #475569; line-height: 1.45; }
                    .doc-title { text-align: right; }
                    .doc-title h2 { margin: 0; font-size: 20px; text-transform: uppercase; }
                    .doc-title p { margin: 5px 0 0; color: #475569; }
                    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
                    .box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; min-height: 64px; }
                    .label { display: block; color: #64748b; font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 5px; }
                    .value { font-weight: 700; color: #0f172a; line-height: 1.35; }
                    .muted { color: #64748b; font-weight: 400; }
                    .section { margin-top: 18px; }
                    .section h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #0f172a; }
                    .notes { border: 1px solid #cbd5e1; border-radius: 10px; padding: 11px; min-height: 54px; line-height: 1.55; color: #334155; }
                    table { width: 100%; border-collapse: collapse; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 10px; }
                    th { background: #f1f5f9; color: #475569; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; text-align: left; padding: 9px; border-bottom: 1px solid #cbd5e1; }
                    td { padding: 9px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
                    td span { display: block; margin-top: 3px; color: #64748b; font-size: 10px; }
                    tr:last-child td { border-bottom: 0; }
                    .empty { color: #64748b; font-style: italic; text-align: center; }
                    .summary { display: flex; justify-content: flex-end; margin-top: 18px; }
                    .summary-card { width: 280px; border: 1px solid #0f172a; border-radius: 12px; overflow: hidden; }
                    .summary-row { display: flex; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #cbd5e1; }
                    .summary-row.total { background: #0f172a; color: white; font-size: 16px; font-weight: 800; border-bottom: 0; }
                    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 44px; }
                    .signature { border-top: 1px solid #0f172a; padding-top: 7px; text-align: center; color: #475569; font-size: 10px; }
                    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 10px; text-align: center; }
                    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                </style>
            </head>
            <body>
                <main class="sheet">
                    <section class="header">
                        <div class="brand">
                            <h1>Limen Auto Supply and Services</h1>
                            <p>Service order, workshop record, and invoice-ready customer copy.</p>
                            <p>Contact: (0915) 522 5629 | Landline: 0285513518</p>
                        </div>
                        <div class="doc-title">
                            <h2>Service Order</h2>
                            <p><strong>${escapeHtml(orderNumber)}</strong></p>
                            <p>Generated ${escapeHtml(formatDateTime(new Date()))}</p>
                        </div>
                    </section>
                    <section class="meta-grid">
                        <div class="box"><span class="label">Customer</span><div class="value">${escapeHtml(order.customerName || 'Walk-in customer')}</div><div class="muted">${escapeHtml(order.customerPhone || 'No phone recorded')}</div></div>
                        <div class="box"><span class="label">Vehicle</span><div class="value">${escapeHtml(vehicleLabel)}</div><div class="muted">${escapeHtml(order.vehicle?.plate || 'No plate recorded')}</div></div>
                        <div class="box"><span class="label">Status</span><div class="value">${escapeHtml(status.toUpperCase())}</div><div class="muted">${escapeHtml(paymentStatus)}</div></div>
                        <div class="box"><span class="label">Mechanic</span><div class="value">${escapeHtml(mechanicName || 'Not assigned')}</div><div class="muted">${completedAt ? `Completed ${escapeHtml(formatDateTime(completedAt))}` : `Created ${escapeHtml(formatDateTime(createdAt))}`}</div></div>
                    </section>
                    <section class="section"><h3>Job Notes</h3><div class="notes">${escapeHtml(order.description || order.note || 'No service notes recorded.')}</div></section>
                    <section class="section">
                        <h3>Services</h3>
                        <table><thead><tr><th style="width: 42px;">#</th><th>Service</th><th style="width: 80px;">Qty</th><th style="width: 120px;">Unit</th><th style="width: 120px;">Total</th></tr></thead><tbody>${buildPrintRows(serviceItems, 'No itemized services recorded. Job notes are used as the service reference.')}</tbody></table>
                    </section>
                    <section class="section">
                        <h3>Parts Used</h3>
                        <table><thead><tr><th style="width: 42px;">#</th><th>Part</th><th style="width: 80px;">Qty</th><th style="width: 120px;">Unit</th><th style="width: 120px;">Total</th></tr></thead><tbody>${buildPrintRows(partItems, 'No parts were attached to this service order.')}</tbody></table>
                    </section>
                    <section class="summary">
                        <div class="summary-card">
                            <div class="summary-row"><span>Service / parts total</span><strong>${escapeHtml(formatCurrency(orderTotal))}</strong></div>
                            <div class="summary-row"><span>Payment status</span><strong>${escapeHtml(paymentStatus)}</strong></div>
                            <div class="summary-row total"><span>Final amount</span><span>${escapeHtml(formatCurrency(orderTotal))}</span></div>
                        </div>
                    </section>
                    <section class="signatures"><div class="signature">Prepared By</div><div class="signature">Customer Approval</div><div class="signature">Authorized Signature</div></section>
                    <p class="footer">This document is generated from LimenServe service order records. Final prices may be subject to confirmation by authorized staff.</p>
                </main>
            </body>
        </html>
    `;

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

// ── Parts search sub-component ────────────────────────────────────────────────
export function PartSearch({ onAdd }) {
    const { findProduct, products } = useDataStore();
    const [query, setQuery] = useState('');
    const [result, setResult] = useState(null);
    const [qty, setQty] = useState('1');
    const [unitPrice, setUnitPrice] = useState('');
    const [searching, setSearching] = useState(false);
    const [notFound, setNotFound] = useState(false);
    const suggestions = useMemo(() => getPartNumberSearchSuggestions(products || [], query, 5), [products, query]);

    useEffect(() => {
        const id = query.trim();
        let active = true;
        void (async () => {
            if (!id) {
                if (!active) return;
                setResult(null);
                setNotFound(false);
                setSearching(false);
                return;
            }
            setSearching(true);
            const found = await findProduct(id);
            if (!active) return;
            if (found) { setResult(found); setUnitPrice(String(found.price ?? '')); setNotFound(false); }
            else { setResult(null); setNotFound(true); }
            setSearching(false);
        })();
        return () => { active = false; };
    }, [findProduct, query]);

    const handleAdd = () => {
        if (!result) return;
        const q = Number(qty); const p = Number(unitPrice);
        if (q <= 0 || p < 0) return;
        onAdd({ itemName: result.name, itemSku: result.sku, quantity: q, unitPrice: p, lineTotal: q * p, lineType: 'part', productId: result.id });
        setQuery(''); setResult(null); setQty('1'); setUnitPrice(''); setNotFound(false);
    };

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input type="text" placeholder="Search by part number or part name..." value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 border border-primary-200 rounded-xl text-sm text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 bg-white" />
                    {query.trim() && suggestions.length > 0 && (
                        <div className="absolute z-20 mt-2 max-h-48 w-full overflow-y-auto rounded-xl border border-primary-200 bg-white py-1 shadow-lg">
                            {suggestions.map((product) => (
                                <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => {
                                        const partNumber = getProductPartNumber(product);
                                        setQuery(partNumber);
                                        setResult(product);
                                        setUnitPrice(String(product.price ?? ''));
                                        setNotFound(false);
                                    }}
                                    className="flex w-full flex-col px-3 py-2 text-left transition hover:bg-primary-50"
                                >
                                    <span className="truncate text-sm font-semibold text-primary-950">{product.name}</span>
                                    <span className="font-mono text-xs text-primary-500">{getProductPartNumber(product) || 'No part number'} · Stock: {product.quantity ?? product.stock ?? 0}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {searching && <p className="text-xs text-primary-400">Searching catalog...</p>}
            {notFound && !searching && <p className="text-xs text-red-500">Part not found in catalog.</p>}
            {result && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-primary-950 truncate">{result.name}</p>
                            <p className="text-xs font-mono text-primary-500">{getProductPartNumber(result)} · Stock: {result.quantity ?? result.stock ?? 0}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-xs font-bold text-primary-500 uppercase tracking-wide block mb-1">Qty</label>
                            <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}
                                className="w-full border border-primary-200 rounded-lg px-2 py-1.5 text-sm text-primary-950 focus:outline-none focus:border-accent-blue bg-white" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-primary-500 uppercase tracking-wide block mb-1">Unit Price (₱)</label>
                            <input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
                                className="w-full border border-primary-200 rounded-lg px-2 py-1.5 text-sm text-primary-950 focus:outline-none focus:border-accent-blue bg-white" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-primary-500 uppercase tracking-wide block mb-1">Subtotal</label>
                            <p className="py-1.5 text-sm font-bold text-accent-blue">{formatCurrency((Number(qty) || 0) * (Number(unitPrice) || 0))}</p>
                        </div>
                    </div>
                    <button type="button" onClick={handleAdd}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-accent-blue text-white text-sm font-bold py-2 hover:bg-blue-700 transition-colors">
                        <Plus className="w-4 h-4" /> Add Part
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * CreateServiceOrderModal
 * Modal for creating a new service order
 */
export const CreateServiceOrderModal = ({ isOpen, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        customerName: '',
        customerPhone: '',
        vehicleMake: 'Mitsubishi',
        vehicleModel: '',
        vehicleYear: '',
        vehiclePlate: '',
        description: '',
        estimatedCost: '',
        priority: 'normal',
    });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [parts, setParts] = useState([]);

    const partsTotal = parts.reduce((sum, p) => sum + Number(p.lineTotal ?? 0), 0);
    const laborCost = parseFloat(formData.estimatedCost) || 0;
    const combinedTotal = laborCost + partsTotal;

    const validate = () => {
        const newErrors = {};
        if (!formData.customerName.trim()) newErrors.customerName = 'Customer name is required';
        if (!formData.vehicleModel.trim()) newErrors.vehicleModel = 'Vehicle model is required';
        if (!formData.vehiclePlate.trim()) newErrors.vehiclePlate = 'Plate number is required';
        if (!formData.description.trim()) newErrors.description = 'Service description is required';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setSaving(true);
        setSubmitError('');

        try {
            await onSave?.({
                customerName: formData.customerName,
                customerPhone: formData.customerPhone,
                vehicleMake: formData.vehicleMake,
                vehicleModel: formData.vehicleModel,
                vehicleYear: parseInt(formData.vehicleYear, 10) || null,
                vehiclePlate: formData.vehiclePlate,
                description: formData.description,
                estimatedCost: combinedTotal,
                status: 'pending',
                priority: formData.priority,
                items: [
                    ...parts,
                    ...(laborCost > 0 ? [{
                        lineType: 'service',
                        serviceId: null,
                        displayName: formData.description.trim().slice(0, 120) || 'Service labor',
                        itemName: formData.description.trim().slice(0, 120) || 'Service labor',
                        itemSku: 'LABOR',
                        quantity: 1,
                        unitPrice: laborCost,
                        lineTotal: laborCost,
                    }] : []),
                ],
            });
            onClose();
        } catch (error) {
            setSubmitError(error.message || 'Failed to create service order.');
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <Motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <Motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white rounded-2xl border border-primary-200 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary-100">
                                <Wrench className="w-5 h-5 text-primary-700" />
                            </div>
                            <h2 className="text-xl font-display font-bold text-primary-950">New Service Order</h2>
                        </div>
                        <button type="button" onClick={onClose} aria-label="Close service order" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Customer Info Section */}
                        <div>
                            <p className="text-sm font-semibold text-primary-300 mb-3 flex items-center gap-2">
                                <User className="w-4 h-4 text-accent-primary" /> Customer Information
                            </p>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Input
                                    label="Customer Name *"
                                    placeholder="Full name"
                                    value={formData.customerName}
                                    onChange={e => updateField('customerName', e.target.value)}
                                    required
                                    error={errors.customerName}
                                />
                                <Input
                                    label="Phone Number"
                                    placeholder="09XX XXX XXXX"
                                    value={formData.customerPhone}
                                    onChange={e => updateField('customerPhone', e.target.value)}
                                    leftIcon={<Phone className="w-4 h-4" />}
                                />
                            </div>
                        </div>

                        {submitError && (
                            <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                                {submitError}
                            </div>
                        )}

                        {/* Vehicle Info Section */}
                        <div>
                            <p className="text-sm font-semibold text-primary-300 mb-3 flex items-center gap-2">
                                <Car className="w-4 h-4 text-accent-primary" /> Vehicle Information
                            </p>
                            <div className="grid grid-cols-1 gap-4 mb-3 sm:grid-cols-2">
                                <div>
                                    <label className="input-label mb-1 block">Make</label>
                                    <select value={formData.vehicleMake} onChange={e => updateField('vehicleMake', e.target.value)} className="input">
                                        <option value="Mitsubishi">Mitsubishi</option>
                                        <option value="Toyota">Toyota</option>
                                        <option value="Honda">Honda</option>
                                        <option value="Nissan">Nissan</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <Input
                                    label="Model *"
                                    placeholder="e.g. Montero Sport"
                                    value={formData.vehicleModel}
                                    onChange={e => updateField('vehicleModel', e.target.value)}
                                    required
                                    error={errors.vehicleModel}
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Input
                                    label="Year"
                                    type="number"
                                    placeholder={String(new Date().getFullYear())}
                                    value={formData.vehicleYear}
                                    onChange={e => updateField('vehicleYear', e.target.value)}
                                />
                                <Input
                                    label="Plate Number *"
                                    placeholder="ABC 1234"
                                    value={formData.vehiclePlate}
                                    onChange={e => updateField('vehiclePlate', e.target.value)}
                                    required
                                    error={errors.vehiclePlate}
                                />
                            </div>
                        </div>

                        {/* Service Details */}
                        <div>
                            <p className="text-sm font-semibold text-primary-300 mb-3 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-accent-primary" /> Service Details
                            </p>
                            <div>
                                <label className="input-label mb-1 block">Description of Service *</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => updateField('description', e.target.value)}
                                    required
                                    aria-invalid={Boolean(errors.description) || undefined}
                                    placeholder="Describe the service needed..."
                                    rows={3}
                                    className="input resize-none"
                                />
                                {errors.description && <p className="mt-1 text-xs text-accent-danger" role="alert">{errors.description}</p>}
                                {errors.description && <p className="text-xs text-accent-danger mt-1">{errors.description}</p>}
                            </div>
                            <div className="grid grid-cols-1 gap-4 mt-3 sm:grid-cols-2">
                                <Input
                                    label="Estimated Labor Cost (₱)"
                                    type="number"
                                    placeholder="0.00"
                                    value={formData.estimatedCost}
                                    onChange={e => updateField('estimatedCost', e.target.value)}
                                    min="0"
                                    step="0.01"
                                />
                                <div>
                                    <label className="input-label mb-1 block">Priority</label>
                                    <select value={formData.priority} onChange={e => updateField('priority', e.target.value)} className="input">
                                        <option value="low">Low</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                        <option value="urgent">Urgent</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Parts / Inventory Items */}
                        <div className="rounded-xl border border-primary-200 p-4 space-y-4">
                            <p className="text-sm font-semibold text-primary-300 flex items-center gap-2">
                                <Package className="w-4 h-4 text-accent-primary" /> Parts / Inventory Items
                            </p>
                            <PartSearch onAdd={(part) => setParts((prev) => [...prev, { ...part, _id: Date.now() + Math.random() }])} />
                            {parts.length > 0 && (
                                <div className="space-y-2">
                                    {parts.map((part) => (
                                        <div key={part._id} className="flex items-center justify-between gap-3 rounded-xl border border-primary-100 bg-white px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-primary-950 truncate">{part.itemName}</p>
                                                <p className="text-xs text-primary-400 font-mono">{part.itemSku} · Qty {part.quantity} × {formatCurrency(part.unitPrice)}</p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <p className="text-sm font-bold text-accent-blue">{formatCurrency(part.lineTotal)}</p>
                                                <button type="button" onClick={() => setParts((prev) => prev.filter((p) => p._id !== part._id))} className="p-1 rounded-lg hover:bg-red-50 text-primary-400 hover:text-red-600 transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between pt-2 border-t border-primary-100">
                                        <span className="text-xs font-bold uppercase tracking-wide text-primary-500">Parts Total</span>
                                        <span className="text-sm font-bold text-primary-950">{formatCurrency(partsTotal)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Combined total */}
                        {(laborCost > 0 || partsTotal > 0) && (
                            <div className="rounded-xl bg-primary-950 text-white p-4 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/50">Combined Total</p>
                                    <p className="text-xs text-white/40 mt-0.5">Labor {formatCurrency(laborCost)} + Parts {formatCurrency(partsTotal)}</p>
                                </div>
                                <p className="text-2xl font-display font-bold">{formatCurrency(combinedTotal)}</p>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pt-4 border-t border-primary-700">
                                <Button variant="cancel" fullWidth onClick={onClose} type="button">Cancel</Button>
                            <Button variant="primary" fullWidth type="submit" isLoading={saving} leftIcon={<Save className="w-4 h-4" />}>
                                Create Order
                            </Button>
                        </div>
                    </form>
                </Motion.div>
            </Motion.div>
        </AnimatePresence>
    );
};

/**
 * ServiceOrderDetailModal
 * Modal for viewing a service order's details and updating its status
 */
const toDateTimeLocalValue = (value, fallbackOffsetHours = 0) => {
    const date = value ? new Date(value) : new Date(Date.now() + fallbackOffsetHours * 60 * 60 * 1000);
    if (Number.isNaN(date.getTime())) return '';
    if (!value) {
        date.setMinutes(0, 0, 0);
        const parts = manilaDateTimeParts(date);
        const localDay = `${parts.year}-${parts.month}-${parts.day}`;
        const sunday = new Date(`${localDay}T12:00:00Z`).getUTCDay() === 0;
        if (Number(parts.hour) < 8 || Number(parts.hour) >= (sunday ? 12 : 17)) {
            const nextDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, 9 - 8));
            return manilaDateTimeInputValue(nextDay);
        }
    }
    return manilaDateTimeInputValue(date);
};

export const ServiceOrderDetailModal = ({
    isOpen,
    pageMode = false,
    workshopMode = false,
    onClose,
    order,
    onStatusUpdate,
    onComplete,
    canAssignMechanic = false,
    onAssignMechanic,
    onRemoveMechanic,
}) => {
    const toast = useToast();
    const [updating, setUpdating] = useState(false);
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [mechanics, setMechanics] = useState([]);
    const [mechanicsLoading, setMechanicsLoading] = useState(false);
    const [assignmentError, setAssignmentError] = useState('');
    const [assignmentSaving, setAssignmentSaving] = useState(false);
    const [assignmentRemoving, setAssignmentRemoving] = useState(false);
    const [removeConfirmationOpen, setRemoveConfirmationOpen] = useState(false);
    const [showCompletionReview, setShowCompletionReview] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [cashReceived, setCashReceived] = useState('');
    const [paymentReceivedConfirmed, setPaymentReceivedConfirmed] = useState(false);
    const [mechanicId, setMechanicId] = useState('');
    const [scheduledStart, setScheduledStart] = useState('');
    const [scheduledEnd, setScheduledEnd] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [appointmentMinutes, setAppointmentMinutes] = useState(60);
    const [scheduleSlots, setScheduleSlots] = useState([]);
    const [scheduleHours, setScheduleHours] = useState(null);
    const [slotsLoading, setSlotsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !order) return;
        const storedStart = order.scheduledStart ?? order.scheduled_start;
        const storedEnd = order.scheduledEnd ?? order.scheduled_end;
        const nextStart = toDateTimeLocalValue(storedStart, 1);
        const nextEnd = storedEnd
            ? toDateTimeLocalValue(storedEnd)
            : manilaDateTimeInputValue(new Date(Date.parse(manilaDateTimeToIso(nextStart)) + 60 * 60 * 1000));
        setMechanicId(order.assignment?.mechanicId ?? order.assignedMechanic?.id ?? '');
        setScheduledStart(nextStart);
        setScheduledEnd(nextEnd > nextStart ? nextEnd : manilaDateTimeInputValue(new Date(Date.parse(manilaDateTimeToIso(nextStart)) + 60 * 60 * 1000)));
        setScheduleDate(nextStart.slice(0, 10));
        const storedDuration = storedStart && storedEnd ? (Date.parse(storedEnd) - Date.parse(storedStart)) / 60000 : 60;
        setAppointmentMinutes([30, 60, 90, 120, 180, 240].includes(storedDuration) ? storedDuration : 60);
        setAssignmentError('');
    }, [isOpen, order]);

    useEffect(() => {
        if (!isOpen || !canAssignMechanic || !scheduleDate) return undefined;
        let active = true;
        setSlotsLoading(true);
        getServiceScheduleSlots({ date: scheduleDate, duration: appointmentMinutes, mechanicId: mechanicId || undefined, orderId: order?.id })
            .then((data) => {
                if (!active) return;
                setScheduleSlots(data?.slots || []);
                setScheduleHours(data?.hours || null);
                setAssignmentError('');
            })
            .catch((error) => {
                if (active) { setScheduleSlots([]); setAssignmentError(error.message || 'Unable to load appointment times.'); }
            })
            .finally(() => { if (active) setSlotsLoading(false); });
        return () => { active = false; };
    }, [isOpen, canAssignMechanic, scheduleDate, appointmentMinutes, mechanicId, order?.id]);

    useEffect(() => {
        if (!isOpen || !canAssignMechanic || !scheduledStart || !scheduledEnd) return undefined;

        let active = true;
        const timer = window.setTimeout(async () => {
            setMechanicsLoading(true);
            try {
                const rows = await listMechanics({
                    activeOnly: true,
                    orderId: order.id,
                    start: manilaDateTimeToIso(scheduledStart),
                    end: manilaDateTimeToIso(scheduledEnd),
                });
                if (active) setMechanics(rows);
            } catch (error) {
                if (active) setAssignmentError(error.message || 'Unable to load mechanics.');
            } finally {
                if (active) setMechanicsLoading(false);
            }
        }, 250);

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [canAssignMechanic, isOpen, order?.id, scheduledEnd, scheduledStart]);

    if (!isOpen || !order) return null;

    const statusFlow = ['pending', 'in_progress', 'completed'];
    const currentIndex = statusFlow.indexOf(order.status);
    const nextStatus = currentIndex < statusFlow.length - 1 ? statusFlow[currentIndex + 1] : null;
    const items = Array.isArray(order.items) ? order.items : Array.isArray(order.lineItems) ? order.lineItems : [];
    const serviceItems = items.filter((item) => (item.lineType ?? item.line_type) === 'service' || item.serviceId || item.service_id);
    const partItems = items.filter((item) => !serviceItems.includes(item));
    const recordedTotal = Number(order.totalAmount ?? order.total_amount ?? order.estimatedCost ?? order.estimated_cost ?? 0);
    const itemSubtotal = items.reduce((sum, item, index) => sum + getLineItemDisplay(item, index).lineTotal, 0);
    const orderTotal = items.length
        ? Math.max(itemSubtotal - Number(order.discountTotal ?? order.discount_total ?? 0) + Number(order.taxTotal ?? order.tax_total ?? 0), 0)
        : recordedTotal;
    const completedAt = order.completedAt ?? order.completed_at ?? null;
    const mechanicName = order.assignedMechanic?.name ?? order.assignment?.mechanic?.name ?? order.mechanicName ?? order.assignedMechanicName ?? order.assigned_to_name ?? order.assignedToName ?? '';
    const isOverdue = isServiceOrderOverdue(order);
    const todayManila = manilaDateInputValue(new Date());

    const statusLabels = {
        pending: 'Pending',
        in_progress: 'In Progress',
        completed: 'Completed',
    };

    const handleStatusUpdate = async (newStatus) => {
        setUpdating(true);
        try {
            await onStatusUpdate?.(order.id, newStatus);
        } finally {
            setUpdating(false);
        }
    };

    const handleComplete = async () => {
        const received = Number(cashReceived);
        if (!paymentReceivedConfirmed) return;
        if (paymentMethod === 'cash' && (!Number.isFinite(received) || received < orderTotal)) return;
        setCompleting(true);
        try {
            await onComplete?.(order.id, {
                paymentMethod,
                cashReceived: paymentMethod === 'cash' ? received : 0,
                changeDue: paymentMethod === 'cash' ? Math.max(received - orderTotal, 0) : 0,
                paymentReceivedConfirmed: true,
            });
            setShowCompletionReview(false);
        } finally {
            setCompleting(false);
        }
    };

    const handlePrint = () => {
        printServiceOrderDocument({
            order,
            serviceItems,
            partItems,
            orderTotal,
            completedAt,
            mechanicName,
        });
    };

    const handleSavePdf = async () => {
        setDownloadingPdf(true);
        try {
            const { downloadServiceOrderPdf } = await import('../utils/downloadServicePdf');
            downloadServiceOrderPdf({ order, serviceItems, partItems, orderTotal, mechanicName });
            toast.success('Service order PDF saved.');
        } catch (error) {
            toast.error(error.message || 'Unable to save the service order PDF.');
        } finally {
            setDownloadingPdf(false);
        }
    };

    const handleAssignmentSubmit = async (event) => {
        event.preventDefault();
        setAssignmentError('');

        const scheduleError = validateManilaSchedule(scheduledStart, scheduledEnd);
        if (!mechanicId || scheduleError) {
            setAssignmentError(scheduleError || 'Choose a mechanic and service schedule.');
            return;
        }

        setAssignmentSaving(true);
        try {
            await onAssignMechanic?.(order.id, {
                mechanicId,
                scheduledStart: manilaDateTimeToIso(scheduledStart),
                scheduledEnd: manilaDateTimeToIso(scheduledEnd),
            });
        } catch (error) {
            setAssignmentError(error.message || 'Unable to assign the mechanic.');
        } finally {
            setAssignmentSaving(false);
        }
    };

    const handleAssignmentRemove = async () => {
        setAssignmentRemoving(true);
        setAssignmentError('');
        try {
            await onRemoveMechanic?.(order.id);
            setMechanicId('');
            setRemoveConfirmationOpen(false);
        } catch (error) {
            setAssignmentError(error.message || 'Unable to remove the assignment.');
        } finally {
            setAssignmentRemoving(false);
        }
    };

    const renderItemRow = (item, index) => {
        const { name, code, quantity, unitPrice, lineTotal } = getLineItemDisplay(item, index);

        return (
            <div key={item.id ?? `${name}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border border-primary-100 bg-white px-3 py-2.5">
                <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-semibold text-primary-950">{name}</p>
                    <p className="text-xs text-primary-500">
                        {code || 'No code'} - Qty {quantity} - {formatCurrency(unitPrice)}
                    </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-accent-blue">{formatCurrency(lineTotal)}</p>
            </div>
        );
    };

    return (
        <>
        <AnimatePresence>
            <Motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={pageMode ? 'relative w-full' : 'fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4'}
                onClick={pageMode ? undefined : onClose}
            >
                <Motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className={pageMode ? 'w-full overflow-hidden rounded-2xl border border-primary-200 bg-white shadow-sm' : 'w-full max-w-4xl overflow-hidden rounded-2xl border border-primary-200 bg-white shadow-xl'}
                    onClick={e => e.stopPropagation()}
                    role={pageMode ? undefined : 'dialog'}
                    aria-modal={pageMode ? undefined : 'true'}
                    aria-labelledby="service-order-detail-title"
                >
                    <div className="flex items-start justify-between gap-4 border-b border-primary-100 bg-primary-50 px-5 py-4 sm:px-6">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary-500">{order.orderNumber || order.id}</p>
                                <ServiceStageBadge order={order} />
                                <PriorityBadge priority={order.priority} />
                                {isOverdue && <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-800"><Clock className="h-3.5 w-3.5" /> Overdue</span>}
                            </div>
                            <h2 id="service-order-detail-title" className="mt-2 text-xl font-display font-bold text-primary-950 sm:text-2xl">Customer Service Order</h2>
                            <p className="mt-1 text-sm text-primary-500">Review customer, vehicle, services, parts, and completion record.</p>
                        </div>
                        <button type="button" onClick={onClose} aria-label="Close service order" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className={pageMode ? 'p-4 sm:p-6' : 'max-h-[78vh] overflow-y-auto p-5 sm:p-6'}>
                        {!workshopMode && <div className="mb-5 grid gap-3 rounded-2xl border border-primary-100 bg-white p-3 sm:grid-cols-3">
                            {statusFlow.map((status, i) => (
                                <div key={status} className={`rounded-xl border px-3 py-3 ${currentIndex >= i ? 'border-accent-primary/25 bg-accent-primary/5' : 'border-primary-100 bg-primary-50'}`}>
                                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${currentIndex >= i ? 'bg-accent-primary text-white' : 'bg-white text-primary-400'}`}>
                                        {currentIndex > i ? <CheckCircle className="w-4 h-4" /> : i + 1}
                                    </div>
                                    <p className={`mt-2 text-sm font-semibold ${currentIndex >= i ? 'text-primary-950' : 'text-primary-500'}`}>{statusLabels[status]}</p>
                                    <p className="mt-1 text-xs text-primary-500">
                                        {status === 'completed' ? 'Archived and posted to Sales' : status === 'in_progress' ? 'Workshop handling' : 'Awaiting review'}
                                    </p>
                                </div>
                            ))}
                        </div>}

                        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <User className="h-4 w-4" /> Customer
                                        </div>
                                        <p className="text-base font-semibold text-primary-950">{order.customerName || 'Walk-in customer'}</p>
                                        {order.customerPhone && <p className="mt-1 text-sm text-primary-600">{order.customerPhone}</p>}
                                    </div>
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <Car className="h-4 w-4" /> Vehicle
                                        </div>
                                        <p className="text-base font-semibold text-primary-950">
                                            {[order.vehicle?.year, order.vehicle?.make, order.vehicle?.model].filter(Boolean).join(' ') || 'Vehicle not recorded'}
                                        </p>
                                        <p className="mt-1 text-sm text-primary-600">{order.vehicle?.plate || 'No plate recorded'}</p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-primary-100 bg-white p-4">
                                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                        <FileText className="h-4 w-4" /> Job notes
                                    </div>
                                    <p className="text-sm leading-6 text-primary-700">{order.description || order.note || 'No service notes recorded.'}</p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-2xl border border-primary-100 bg-white p-4">
                                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <Wrench className="h-4 w-4" /> {workshopMode ? 'Estimated labor at intake' : 'Services'}
                                        </div>
                                        <div className="space-y-2">
                                            {serviceItems.length > 0 ? serviceItems.map(renderItemRow) : (
                                                <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50 px-3 py-4 text-sm text-primary-500">
                                                    No itemized labor estimate recorded. Add actual labor before billing.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-primary-100 bg-white p-4">
                                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <Package className="h-4 w-4" /> {workshopMode ? 'Estimated parts at intake' : 'Parts used'}
                                        </div>
                                        <div className="space-y-2">
                                            {partItems.length > 0 ? partItems.map(renderItemRow) : (
                                                <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50 px-3 py-4 text-sm text-primary-500">
                                                    No parts were attached to this service order.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <aside className="space-y-4">
                                <div className="rounded-2xl border border-primary-100 bg-primary-950 p-5 text-white">
                                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">{workshopMode ? 'Intake estimate' : 'Final amount'}</p>
                                    <p className="mt-2 text-3xl font-display font-bold">{formatCurrency(orderTotal)}</p>
                                    <p className="mt-2 text-sm text-white/60">{workshopMode ? 'Actual parts and labor are recorded below. Estimates do not deduct stock.' : 'Receipt review and payment confirmation are required before posting.'}</p>
                                </div>

                                <div className="grid gap-3">
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <UserCheck className="h-4 w-4" /> Mechanic
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-primary-950">{mechanicName || 'Not assigned'}</p>
                                        {order.assignedMechanic?.specialization && <p className="mt-1 text-xs text-primary-600">{order.assignedMechanic.specialization}</p>}
                                        {order.scheduledStart && <p className="mt-2 text-xs text-primary-600">{formatManilaDateTime(order.scheduledStart)} – {formatManilaDateTime(order.scheduledEnd)}</p>}
                                    </div>
                                    {canAssignMechanic && order.status !== 'completed' && order.status !== 'cancelled' && (
                                        <form onSubmit={handleAssignmentSubmit} className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-800">Admin mechanic assignment</p>
                                            {assignmentError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800" role="alert">{assignmentError}</p>}
                                            <label className="mt-3 block text-xs font-semibold text-primary-700">Mechanic
                                                <select className="input mt-1" value={mechanicId} onChange={(event) => { setMechanicId(event.target.value); setScheduledStart(''); setScheduledEnd(''); }} disabled={mechanicsLoading} required>
                                                    <option value="">{mechanicsLoading ? 'Loading mechanics…' : 'Choose active mechanic'}</option>
                                                    {mechanics.map((mechanic) => (
                                                        <option key={mechanic.id} value={mechanic.id} disabled={!mechanic.isActive || mechanic.availability_status === 'off_duty'}>
                                                            {mechanic.full_name || mechanic.fullName} · {mechanic.specialization} · {mechanic.currentWorkload} booked
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                <label className="text-xs font-semibold text-primary-700">Date <span className="text-red-600">*</span><input type="date" className="input mt-1" value={scheduleDate} min={todayManila} onChange={(event) => { setScheduleDate(event.target.value); setScheduledStart(''); setScheduledEnd(''); }} required /></label>
                                                <label className="text-xs font-semibold text-primary-700">Appointment length
                                                    <select className="input mt-1" value={appointmentMinutes} onChange={(event) => { setAppointmentMinutes(Number(event.target.value)); setScheduledStart(''); setScheduledEnd(''); }}>
                                                        {[30, 60, 90, 120, 180, 240].map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes === 60 ? '' : 's'}`}</option>)}
                                                    </select>
                                                </label>
                                            </div>
                                            <p className="mt-2 text-xs text-blue-800">{scheduleHours?.closesAt?.startsWith('12') ? 'Sunday half-day hours: 8:00 AM – 12:00 PM.' : 'Workshop hours: 8:00 AM – 5:00 PM.'} Philippine time.</p>
                                            <div className="mt-3 grid max-h-40 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3" aria-label="Available appointment times">
                                                {scheduleSlots.map((slot) => {
                                                    const selected = scheduledStart && manilaDateTimeToIso(scheduledStart) === slot.start;
                                                    const label = `${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(slot.start))} – ${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(slot.end))}`;
                                                    return <button key={slot.start} type="button" disabled={!slot.available || !mechanicId} title={slot.reason || undefined} aria-pressed={Boolean(selected)} onClick={() => { setScheduledStart(manilaDateTimeInputValue(new Date(slot.start))); setScheduledEnd(manilaDateTimeInputValue(new Date(slot.end))); }} className={`rounded-lg border px-2 py-2 text-xs font-medium ${selected ? 'border-blue-700 bg-blue-700 text-white' : 'border-primary-200 bg-white text-primary-800 hover:border-blue-500'} disabled:cursor-not-allowed disabled:opacity-40`}>{label}</button>;
                                                })}
                                            </div>
                                            {slotsLoading && <p className="mt-2 text-xs text-primary-600">Checking available times…</p>}
                                            {!slotsLoading && !scheduleSlots.some((slot) => slot.available) && <p className="mt-2 text-xs text-primary-700">No available schedule remains for this day. Choose another date.</p>}
                                            {scheduledStart && <p className="mt-2 text-xs font-semibold text-blue-900">Selected: {formatManilaDateTime(manilaDateTimeToIso(scheduledStart))} – {new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(manilaDateTimeToIso(scheduledEnd)))}</p>}
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <Button type="submit" size="sm" variant="confirm" isLoading={assignmentSaving} leftIcon={<UserCheck className="h-4 w-4" />}>{order.assignment ? 'Change assignment' : 'Assign mechanic'}</Button>
                                                {order.assignment && <Button size="sm" variant="delete" isLoading={assignmentRemoving} onClick={() => setRemoveConfirmationOpen(true)}>Remove</Button>}
                                            </div>
                                        </form>
                                    )}
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <CalendarDays className="h-4 w-4" /> Dates
                                        </div>
                                        <p className="mt-2 text-sm text-primary-700">Created {formatRelativeTime(order.createdAt)}</p>
                                        {completedAt && <p className="mt-1 text-sm text-primary-700">Completed {formatRelativeTime(completedAt)}</p>}
                                    </div>
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <CreditCard className="h-4 w-4" /> Payment
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-primary-950">{order.paymentStatus || order.payment_status || 'Unpaid'}</p>
                                    </div>
                                </div>
                            </aside>
                        </div>

                        <div className="mt-5 flex flex-col gap-3 border-t border-primary-100 pt-4 sm:flex-row sm:justify-end">
                            {!workshopMode && <Button variant="outline" leftIcon={<Download className="w-4 h-4" />} isLoading={downloadingPdf} loadingLabel="Saving PDF…" onClick={handleSavePdf}>
                                Save PDF
                            </Button>}
                            {!workshopMode && <Button variant="outline" leftIcon={<Printer className="w-4 h-4" />} onClick={handlePrint}>
                                Print service order
                            </Button>}
                            <Button variant="cancel" onClick={onClose}>Close</Button>
                            {!workshopMode && nextStatus === 'in_progress' && (
                                <Button
                                    variant="primary"
                                    isLoading={updating}
                                    leftIcon={<ArrowRight className="w-4 h-4" />}
                                    onClick={() => handleStatusUpdate(nextStatus)}
                                >
                                    Start Work
                                </Button>
                            )}
                            {!workshopMode && order.status !== 'completed' && order.status !== 'cancelled' && (
                                <Button
                                    variant="success"
                                    isDisabled={completing}
                                    leftIcon={<Archive className="w-4 h-4" />}
                                    onClick={() => {
                                        setCashReceived('');
                                        setPaymentReceivedConfirmed(false);
                                        setShowCompletionReview(true);
                                    }}
                                >
                                    Review Completion
                                </Button>
                            )}
                            {order.status === 'completed' && (
                                <div className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-accent-success/20 bg-accent-success/10 px-4 text-accent-success">
                                    <CheckCircle className="w-5 h-5" />
                                    <span className="text-sm font-medium">Archived in completed service history</span>
                                </div>
                            )}
                        </div>
                    </div>
                </Motion.div>
            </Motion.div>
        </AnimatePresence>
        <AnimatePresence>
            {showCompletionReview && (
                <Motion.div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { if (!completing) setShowCompletionReview(false); }}>
                    <Motion.div role="dialog" aria-modal="true" aria-labelledby="service-completion-review-title" className="flex max-h-[95dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-primary-200 bg-white shadow-2xl sm:rounded-2xl" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }} onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 border-b border-primary-200 px-4 py-4 sm:px-6">
                            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-500">Final review</p><h3 id="service-completion-review-title" className="mt-1 text-xl font-display font-bold text-primary-950">Review service receipt</h3><p className="mt-1 text-sm text-primary-600">Check the work, parts, and amount with the customer before finishing.</p></div>
                            <button type="button" onClick={() => setShowCompletionReview(false)} aria-label="Close receipt review" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                            <div className="grid gap-3 rounded-xl bg-primary-50 p-4 text-sm sm:grid-cols-2">
                                <p><span className="text-primary-500">Order</span><br /><strong>{order.orderNumber || order.id}</strong></p>
                                <p><span className="text-primary-500">Customer</span><br /><strong>{order.customerName || 'Walk-in customer'}</strong></p>
                                <p><span className="text-primary-500">Vehicle</span><br /><strong>{[order.vehicle?.year, order.vehicle?.make, order.vehicle?.model, order.vehicle?.plate].filter(Boolean).join(' ') || 'Not recorded'}</strong></p>
                                <p><span className="text-primary-500">Mechanic</span><br /><strong>{mechanicName || 'Not assigned'}</strong></p>
                            </div>
                            <div className="space-y-2"><h4 className="font-semibold text-primary-950">Work and parts</h4>{[...serviceItems, ...partItems].length ? [...serviceItems, ...partItems].map(renderItemRow) : <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No itemized lines were saved. The service note will be used as the receipt description.</p>}</div>
                            <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-white p-4"><span className="font-semibold text-primary-700">Total due</span><strong className="text-xl text-primary-950">{formatCurrency(orderTotal)}</strong></div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-sm font-medium text-primary-700">Payment method <span className="text-red-600">*</span><select className="input mt-1" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank_transfer">Bank transfer</option></select></label>
                                {paymentMethod === 'cash' && <label className="text-sm font-medium text-primary-700">Cash received <span className="text-red-600">*</span><input className="input mt-1" type="number" min={orderTotal} step="0.01" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder="Enter amount received" /></label>}
                            </div>
                            {paymentMethod === 'cash' && Number(cashReceived) >= orderTotal && <p className="text-sm text-primary-600">Change due: <strong>{formatCurrency(Number(cashReceived) - orderTotal)}</strong></p>}
                            <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent-primary" checked={paymentReceivedConfirmed} onChange={(event) => setPaymentReceivedConfirmed(event.target.checked)} /><span><strong>Confirm work and payment.</strong> I checked the completed job, and the customer’s payment shown above has actually been received. This will post the receipt to Sales.</span></label>
                        </div>
                        <div className="flex flex-col-reverse gap-2 border-t border-primary-200 bg-primary-50 p-3 sm:flex-row sm:justify-end sm:px-6">
                            <Button variant="cancel" onClick={() => setShowCompletionReview(false)} isDisabled={completing}>Back to order</Button>
                            <Button variant="success" onClick={handleComplete} isLoading={completing} isDisabled={!paymentReceivedConfirmed || (paymentMethod === 'cash' && Number(cashReceived) < orderTotal)} leftIcon={<Archive className="h-4 w-4" />}>Confirm Finish & Add to Sales</Button>
                        </div>
                    </Motion.div>
                </Motion.div>
            )}
        </AnimatePresence>
        <ConfirmDialog
            isOpen={removeConfirmationOpen}
            title="Remove mechanic assignment?"
            message={`This will unassign ${mechanicName || 'the current mechanic'} from ${order.orderNumber || 'this service order'} while preserving the assignment history.`}
            confirmLabel="Remove assignment"
            confirmVariant="delete"
            isLoading={assignmentRemoving}
            onConfirm={handleAssignmentRemove}
            onClose={() => setRemoveConfirmationOpen(false)}
        />
        </>
    );
};

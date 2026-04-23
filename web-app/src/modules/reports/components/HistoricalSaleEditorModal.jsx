import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import { PAYMENT_LABELS, PAYMENT_METHODS } from '../../../utils/constants';
import { createHistoricalPosSale, updateHistoricalPosSale } from '../../../services/posApi';
import { getProductCatalog, getServiceCatalog } from '../../../services/catalogApi';

function createEmptyLine(type = 'product') {
    return {
        id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        lineType: type,
        productId: null,
        serviceId: null,
        displayName: '',
        sku: '',
        quantity: 1,
        unitPrice: 0,
    };
}

function toDateTimeLocal(value) {
    if (!value) {
        return new Date().toISOString().slice(0, 16);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return new Date().toISOString().slice(0, 16);
    }

    const local = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
}

function buildInitialState(saleDetail) {
    const sale = saleDetail?.sale ?? null;
    const items = Array.isArray(saleDetail?.items) && saleDetail.items.length > 0
        ? saleDetail.items.map((item, index) => ({
            id: item.id ?? `line-${index}`,
            lineType: item.lineType ?? item.line_type ?? 'product',
            productId: item.productId ?? item.product_id ?? null,
            serviceId: item.serviceId ?? item.service_id ?? null,
            displayName: item.itemName ?? item.item_name ?? '',
            sku: item.itemSku ?? item.item_sku ?? '',
            quantity: Number(item.quantity ?? 1),
            unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
        }))
        : [createEmptyLine('product')];

    const subtotal = Number(sale?.subtotal ?? 0);
    const discountTotal = Number(sale?.discountTotal ?? 0);

    return {
        saleAt: toDateTimeLocal(sale?.saleAt ?? sale?.createdAt),
        originalReference: sale?.originalReference ?? '',
        customerName: sale?.customerName ?? '',
        cashierName: sale?.cashierNameSnapshot ?? sale?.cashierName ?? '',
        paymentMethod: sale?.paymentMethod ?? PAYMENT_METHODS.CASH,
        discountPercent: subtotal > 0 ? Number(((discountTotal / subtotal) * 100).toFixed(2)) : 0,
        taxTotal: Number(sale?.taxTotal ?? 0),
        cashReceived: Number(sale?.cashReceived ?? sale?.totalAmount ?? 0),
        lines: items,
    };
}

function HistoricalSaleLineItemEditor({
    line,
    onChange,
    onRemove,
    serviceOptions,
}) {
    const [productQuery, setProductQuery] = useState(line.displayName || line.sku || '');
    const [productMatches, setProductMatches] = useState([]);
    const [isSearchingProducts, setIsSearchingProducts] = useState(false);

    useEffect(() => {
        setProductQuery(line.displayName || line.sku || '');
    }, [line.id, line.displayName, line.sku]);

    useEffect(() => {
        let active = true;

        if (line.lineType !== 'product' || productQuery.trim().length < 2) {
            setProductMatches([]);
            setIsSearchingProducts(false);
            return () => {
                active = false;
            };
        }

        const timeoutId = window.setTimeout(async () => {
            try {
                setIsSearchingProducts(true);
                const result = await getProductCatalog({
                    page: 1,
                    pageSize: 6,
                    q: productQuery.trim(),
                    category: 'all',
                    sortBy: 'name-asc',
                    includeCategories: false,
                });

                if (active) {
                    setProductMatches(result.products ?? []);
                }
            } catch {
                if (active) {
                    setProductMatches([]);
                }
            } finally {
                if (active) {
                    setIsSearchingProducts(false);
                }
            }
        }, 220);

        return () => {
            active = false;
            window.clearTimeout(timeoutId);
        };
    }, [line.lineType, productQuery]);

    const handleSelectProduct = (product) => {
        onChange({
            ...line,
            productId: product.id,
            serviceId: null,
            displayName: product.name,
            sku: product.sku,
            unitPrice: Number(product.price ?? 0),
        });
        setProductQuery(`${product.sku} ${product.name}`);
        setProductMatches([]);
    };

    const handleSelectService = (serviceId) => {
        if (!serviceId) {
            onChange({
                ...line,
                serviceId: null,
            });
            return;
        }

        const selected = serviceOptions.find((service) => service.id === serviceId);
        if (!selected) {
            return;
        }

        onChange({
            ...line,
            serviceId: selected.id,
            productId: null,
            displayName: selected.name,
            sku: selected.code,
            unitPrice: Number(selected.price ?? 0),
        });
    };

    return (
        <div className="rounded-2xl border border-primary-200 bg-white/70 p-4">
            <div className="grid gap-3 xl:grid-cols-[150px_minmax(0,1fr)_120px_120px_auto]">
                <select
                    className="input py-2.5 text-sm"
                    value={line.lineType}
                    onChange={(event) => onChange({
                        ...createEmptyLine(event.target.value),
                        id: line.id,
                        lineType: event.target.value,
                    })}
                >
                    <option value="product">Product</option>
                    <option value="service">Service</option>
                </select>

                <div className="space-y-2">
                    {line.lineType === 'product' ? (
                        <>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                                <input
                                    type="text"
                                    className="input py-2.5 pl-10 text-sm"
                                    value={productQuery}
                                    onChange={(event) => {
                                        setProductQuery(event.target.value);
                                        onChange({
                                            ...line,
                                            productId: null,
                                            displayName: event.target.value,
                                            sku: '',
                                        });
                                    }}
                                    placeholder="Search live catalog product"
                                />
                            </div>

                            {productMatches.length > 0 && (
                                <div className="max-h-44 overflow-y-auto rounded-xl border border-primary-100 bg-white">
                                    {productMatches.map((product) => (
                                        <button
                                            key={product.id}
                                            type="button"
                                            className="flex w-full items-start justify-between gap-3 border-b border-primary-50 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-primary-50"
                                            onClick={() => handleSelectProduct(product)}
                                        >
                                            <div>
                                                <div className="font-semibold text-primary-950">{product.sku}</div>
                                                <div className="text-primary-600">{product.name}</div>
                                            </div>
                                            <div className="text-accent-blue">\u20B1{Number(product.price ?? 0).toFixed(2)}</div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {isSearchingProducts && (
                                <p className="text-xs text-primary-500">Searching live catalog...</p>
                            )}
                        </>
                    ) : (
                        <div className="space-y-2">
                            <select
                                className="input py-2.5 text-sm"
                                value={line.serviceId ?? ''}
                                onChange={(event) => handleSelectService(event.target.value)}
                            >
                                <option value="">Manual service line</option>
                                {serviceOptions.map((service) => (
                                    <option key={service.id} value={service.id}>
                                        {service.code} - {service.name}
                                    </option>
                                ))}
                            </select>

                            <input
                                type="text"
                                className="input py-2.5 text-sm"
                                value={line.displayName}
                                onChange={(event) => onChange({
                                    ...line,
                                    displayName: event.target.value,
                                })}
                                placeholder="Service label"
                            />
                        </div>
                    )}

                    <input
                        type="text"
                        className="input py-2.5 text-sm"
                        value={line.sku}
                        onChange={(event) => onChange({
                            ...line,
                            sku: event.target.value,
                        })}
                        placeholder={line.lineType === 'product' ? 'Part number' : 'Receipt code'}
                    />
                </div>

                <input
                    type="number"
                    min="1"
                    step="1"
                    className="input py-2.5 text-sm"
                    value={line.quantity}
                    onChange={(event) => onChange({
                        ...line,
                        quantity: Number(event.target.value || 1),
                    })}
                    placeholder="Qty"
                />

                <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input py-2.5 text-sm"
                    value={line.unitPrice}
                    onChange={(event) => onChange({
                        ...line,
                        unitPrice: Number(event.target.value || 0),
                    })}
                    placeholder="Unit price"
                />

                <div className="flex items-center justify-end gap-3">
                    <div className="text-right text-sm">
                        <div className="font-semibold text-primary-950">\u20B1{(Number(line.quantity ?? 0) * Number(line.unitPrice ?? 0)).toFixed(2)}</div>
                        <div className="text-primary-500">Line total</div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onRemove}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function HistoricalSaleEditorModal({
    isOpen,
    onClose,
    onSaved,
    saleDetail = null,
}) {
    const [form, setForm] = useState(buildInitialState(saleDetail));
    const [serviceOptions, setServiceOptions] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setForm(buildInitialState(saleDetail));
        setError('');
    }, [isOpen, saleDetail]);

    useEffect(() => {
        let active = true;

        if (!isOpen) {
            return () => {
                active = false;
            };
        }

        const loadServices = async () => {
            try {
                const services = await getServiceCatalog();
                if (active) {
                    setServiceOptions(services ?? []);
                }
            } catch {
                if (active) {
                    setServiceOptions([]);
                }
            }
        };

        void loadServices();

        return () => {
            active = false;
        };
    }, [isOpen]);

    const computedTotals = useMemo(() => {
        const rawSubtotal = form.lines.reduce((sum, line) => sum + (Number(line.quantity ?? 0) * Number(line.unitPrice ?? 0)), 0);
        const discountAmount = rawSubtotal * (Number(form.discountPercent ?? 0) / 100);
        const tax = Number(form.taxTotal ?? 0);
        const total = rawSubtotal - discountAmount + tax;
        const cashReceived = form.paymentMethod === PAYMENT_METHODS.CASH
            ? Math.max(Number(form.cashReceived ?? 0), total)
            : 0;

        return {
            rawSubtotal: Number(rawSubtotal.toFixed(2)),
            discountAmount: Number(discountAmount.toFixed(2)),
            tax: Number(tax.toFixed(2)),
            total: Number(total.toFixed(2)),
            cashReceived: Number(cashReceived.toFixed(2)),
            changeDue: Number(Math.max(cashReceived - total, 0).toFixed(2)),
        };
    }, [form.cashReceived, form.discountPercent, form.lines, form.paymentMethod, form.taxTotal]);

    const handleLineChange = (lineId, nextLine) => {
        setForm((current) => ({
            ...current,
            lines: current.lines.map((line) => (line.id === lineId ? nextLine : line)),
        }));
    };

    const handleAddLine = (lineType) => {
        setForm((current) => ({
            ...current,
            lines: [...current.lines, createEmptyLine(lineType)],
        }));
    };

    const handleRemoveLine = (lineId) => {
        setForm((current) => ({
            ...current,
            lines: current.lines.length > 1
                ? current.lines.filter((line) => line.id !== lineId)
                : [createEmptyLine('product')],
        }));
    };

    const handleSubmit = async () => {
        setError('');
        setIsSaving(true);

        try {
            const payload = {
                saleAt: new Date(form.saleAt).toISOString(),
                originalReference: form.originalReference,
                customerName: form.customerName,
                cashierName: form.cashierName,
                paymentMethod: form.paymentMethod,
                discountPercent: Number(form.discountPercent ?? 0),
                taxTotal: Number(form.taxTotal ?? 0),
                cashReceived: computedTotals.cashReceived,
                changeDue: computedTotals.changeDue,
                totals: computedTotals,
                items: form.lines.map((line) => ({
                    lineType: line.lineType,
                    productId: line.lineType === 'product' ? line.productId : null,
                    serviceId: line.lineType === 'service' ? line.serviceId : null,
                    quantity: Number(line.quantity ?? 0),
                    unitPrice: Number(line.unitPrice ?? 0),
                    lineTotal: Number((Number(line.quantity ?? 0) * Number(line.unitPrice ?? 0)).toFixed(2)),
                    displayName: line.displayName,
                    sku: line.sku,
                })),
            };

            const saved = saleDetail?.sale?.id
                ? await updateHistoricalPosSale(saleDetail.sale.id, payload)
                : await createHistoricalPosSale(payload);

            onSaved?.(saved);
            onClose();
        } catch (submitError) {
            setError(submitError.message || 'Failed to save the historical sale.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={saleDetail?.sale?.id ? 'Edit Historical Sale' : 'Encode Historical Sale'}
            size="xl"
        >
            <div className="space-y-6">
                {error && (
                    <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                        {error}
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-primary-700">Sale date and time</label>
                        <input
                            type="datetime-local"
                            className="input py-2.5 text-sm"
                            value={form.saleAt}
                            onChange={(event) => setForm((current) => ({ ...current, saleAt: event.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-primary-700">Paper reference</label>
                        <input
                            type="text"
                            className="input py-2.5 text-sm"
                            value={form.originalReference}
                            onChange={(event) => setForm((current) => ({ ...current, originalReference: event.target.value }))}
                            placeholder="OR / invoice / receipt no."
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-primary-700">Customer</label>
                        <input
                            type="text"
                            className="input py-2.5 text-sm"
                            value={form.customerName}
                            onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
                            placeholder="Walk-in or recorded customer"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-primary-700">Original cashier</label>
                        <input
                            type="text"
                            className="input py-2.5 text-sm"
                            value={form.cashierName}
                            onChange={(event) => setForm((current) => ({ ...current, cashierName: event.target.value }))}
                            placeholder="Cashier on the paper receipt"
                        />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-primary-700">Payment method</label>
                        <select
                            className="input py-2.5 text-sm"
                            value={form.paymentMethod}
                            onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}
                        >
                            {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-primary-700">Discount %</label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            className="input py-2.5 text-sm"
                            value={form.discountPercent}
                            onChange={(event) => setForm((current) => ({ ...current, discountPercent: Number(event.target.value || 0) }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-primary-700">Tax total</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input py-2.5 text-sm"
                            value={form.taxTotal}
                            onChange={(event) => setForm((current) => ({ ...current, taxTotal: Number(event.target.value || 0) }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-primary-700">Cash received</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input py-2.5 text-sm"
                            value={form.paymentMethod === PAYMENT_METHODS.CASH ? form.cashReceived : 0}
                            onChange={(event) => setForm((current) => ({ ...current, cashReceived: Number(event.target.value || 0) }))}
                            disabled={form.paymentMethod !== PAYMENT_METHODS.CASH}
                        />
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="text-base font-semibold text-primary-950">Historical line items</h3>
                            <p className="text-sm text-primary-500">Use live products where possible so reports stay accurate.</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => handleAddLine('product')}>
                                Add Product
                            </Button>
                            <Button variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => handleAddLine('service')}>
                                Add Service
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {form.lines.map((line) => (
                            <HistoricalSaleLineItemEditor
                                key={line.id}
                                line={line}
                                onChange={(nextLine) => handleLineChange(line.id, nextLine)}
                                onRemove={() => handleRemoveLine(line.id)}
                                serviceOptions={serviceOptions}
                            />
                        ))}
                    </div>
                </div>

                <div className="grid gap-4 rounded-2xl border border-primary-100 bg-primary-50 p-4 md:grid-cols-2 xl:grid-cols-5">
                    <div>
                        <div className="text-xs uppercase tracking-wide text-primary-500">Subtotal</div>
                        <div className="text-lg font-semibold text-primary-950">\u20B1{computedTotals.rawSubtotal.toFixed(2)}</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wide text-primary-500">Discount</div>
                        <div className="text-lg font-semibold text-primary-950">\u20B1{computedTotals.discountAmount.toFixed(2)}</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wide text-primary-500">Tax</div>
                        <div className="text-lg font-semibold text-primary-950">\u20B1{computedTotals.tax.toFixed(2)}</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wide text-primary-500">Total</div>
                        <div className="text-lg font-semibold text-accent-blue">\u20B1{computedTotals.total.toFixed(2)}</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wide text-primary-500">Change due</div>
                        <div className="text-lg font-semibold text-primary-950">\u20B1{computedTotals.changeDue.toFixed(2)}</div>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" isLoading={isSaving} onClick={handleSubmit}>
                        {saleDetail?.sale?.id ? 'Update Historical Sale' : 'Save Historical Sale'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

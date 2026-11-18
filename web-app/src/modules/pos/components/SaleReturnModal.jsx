import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/formatters';
import { createPosSaleReturn, getPosSaleReturnContext } from '../../../services/posApi';

const REASONS = [
    { value: 'wrong_part', label: 'Wrong part' },
    { value: 'defective', label: 'Defective' },
    { value: 'excess', label: 'No longer needed / excess' },
    { value: 'other', label: 'Other' },
];

const REFUND_METHODS = [
    { value: 'cash', label: 'Cash' },
    { value: 'check', label: 'Check' },
    { value: 'store_credit', label: 'Store credit' },
];

function estimateRefund(item, quantity) {
    const returnableQuantity = Number(item.returnableQuantity || 0);
    const returnableAmount = Number(item.returnableAmount || 0);
    if (!returnableQuantity || !quantity) return 0;
    return Math.round((returnableAmount * quantity / returnableQuantity + Number.EPSILON) * 100) / 100;
}

export default function SaleReturnModal({ isOpen, onClose, saleDetail, onSaved }) {
    const saleId = saleDetail?.sale?.id;
    const [context, setContext] = useState(null);
    const [quantities, setQuantities] = useState({});
    const [conditions, setConditions] = useState({});
    const [reason, setReason] = useState('wrong_part');
    const [reasonNote, setReasonNote] = useState('');
    const [refundMethod, setRefundMethod] = useState('cash');
    const [refundReference, setRefundReference] = useState('');
    const [refundConfirmed, setRefundConfirmed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [pendingRetry, setPendingRetry] = useState(null);
    const [savedReturnId, setSavedReturnId] = useState(null);
    const requestRef = useRef(null);

    const reloadContext = useCallback(async (active = () => true) => {
        if (!saleId) return;
        setLoading(true);
        setError('');
        try {
            const data = await getPosSaleReturnContext(saleId);
            if (active()) {
                setContext(data);
                setQuantities({});
                setConditions({});
                setSavedReturnId(null);
                requestRef.current = null;
            }
        } catch (loadError) {
            if (active()) setError(loadError.message || 'Unable to load return details for this receipt.');
        } finally {
            if (active()) setLoading(false);
        }
    }, [saleId]);

    useEffect(() => {
        let active = true;
        if (isOpen) {
            setContext(null);
            setQuantities({});
            setConditions({});
            setReason('wrong_part');
            setReasonNote('');
            setRefundMethod('cash');
            setRefundReference('');
            setRefundConfirmed(false);
            setError('');
            setPendingRetry(null);
            setSavedReturnId(null);
            requestRef.current = null;
            void reloadContext(() => active);
        }
        return () => { active = false; };
    }, [isOpen, reloadContext, saleId]);

    const availableItems = context?.items?.filter((item) => Number(item.returnableQuantity) > 0) ?? [];
    const selectedItems = availableItems
        .filter((item) => Number(quantities[item.id] || 0) > 0)
        .map((item) => ({
            saleItemId: item.id,
            quantity: Number(quantities[item.id]),
            condition: conditions[item.id] || 'resalable',
        }));
    const refundEstimate = availableItems.reduce((total, item) => (
        total + estimateRefund(item, Number(quantities[item.id] || 0))
    ), 0);
    const savedReturn = context?.returns?.find((entry) => entry.id === savedReturnId)
        ?? context?.returns?.[0];
    const isReadOnly = Boolean(pendingRetry);

    const buildPayload = () => ({
        requestId: requestRef.current?.id ?? window.crypto.randomUUID(),
        items: selectedItems,
        reason,
        reasonNote: reasonNote.trim(),
        refundMethod,
        refundReference: refundReference.trim(),
        refundConfirmed,
    });

    const submitReturn = async () => {
        if (!saleId || saving) return;
        const payload = pendingRetry?.payload ?? buildPayload();
        const fingerprint = JSON.stringify({ saleId, ...payload, requestId: undefined });
        const requestId = pendingRetry?.payload.requestId
            ?? (requestRef.current?.fingerprint === fingerprint ? requestRef.current.id : window.crypto.randomUUID());
        const request = { ...payload, requestId };
        requestRef.current = { fingerprint, id: requestId };
        setSaving(true);
        setError('');
        try {
            const data = await createPosSaleReturn(saleId, request);
            setContext(data);
            setSavedReturnId(data.savedReturnId);
            setPendingRetry(null);
            requestRef.current = null;
            void onSaved?.(data);
        } catch (submitError) {
            setError(submitError.message || 'The return could not be confirmed.');
            if (submitError.statusCode >= 400 && submitError.statusCode < 500) {
                requestRef.current = null;
                setPendingRetry(null);
                if (submitError.statusCode === 409) {
                    await reloadContext();
                    setError(submitError.message || 'The receipt changed. Review its returnable quantities and try again.');
                }
            } else {
                setPendingRetry({ payload: request });
            }
        } finally {
            setSaving(false);
        }
    };

    const retryAfterReload = async () => {
        setPendingRetry(null);
        await reloadContext();
    };

    const updateQuantity = (item, rawValue) => {
        const maximum = Number(item.returnableQuantity || 0);
        const parsed = rawValue === '' ? 0 : Number(rawValue);
        const next = Number.isFinite(parsed) ? Math.round(Math.min(Math.max(parsed, 0), maximum) * 100) / 100 : 0;
        setQuantities((current) => ({ ...current, [item.id]: next }));
    };

    const handleClose = () => {
        setPendingRetry(null);
        requestRef.current = null;
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Return items from this sale" size="xl">
            <div className="space-y-5">
                <div className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm">
                    <p className="font-semibold text-primary-950">Receipt {saleDetail?.sale?.transactionNumber || '—'}</p>
                    <p className="mt-1 text-primary-700">{saleDetail?.sale?.customerName || 'Walk-in Customer'} · Original total {formatCurrency(saleDetail?.sale?.totalAmount)}</p>
                </div>

                {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
                {loading && <p role="status" className="py-6 text-center text-sm text-primary-600">Loading the receipt’s returnable items…</p>}

                {!loading && context && !context.canReturn && (
                    <div role="status" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <p>Only paid, completed itemized POS receipts can be returned. Unpaid, historical, and service-only records are not eligible.</p>
                    </div>
                )}

                {!loading && context?.canReturn && !savedReturnId && (
                    <>
                        {availableItems.length === 0 ? (
                            <div className="rounded-xl border border-primary-200 bg-white p-5 text-sm text-primary-700">
                                All parts on this receipt have already been returned, or none of the remaining lines can be restocked.
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-xl border border-primary-200">
                                <div className="hidden grid-cols-[minmax(0,1fr)_100px_130px_155px] gap-3 bg-primary-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-primary-600 sm:grid">
                                    <span>Part</span><span>Return qty</span><span>Condition</span><span>Available</span>
                                </div>
                                <div className="divide-y divide-primary-100">
                                    {availableItems.map((item) => (
                                        <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_100px_130px_155px] sm:items-center">
                                            <div className="min-w-0">
                                                <p className="break-words font-semibold text-primary-950">{item.itemName}</p>
                                                <p className="mt-1 text-xs text-primary-500">{item.itemSku || 'No part number'} · Sold {formatNumber(item.quantity)} · Returned {formatNumber(item.returnedQuantity)}</p>
                                            </div>
                                            <label className="text-xs font-semibold text-primary-600">Quantity
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={item.returnableQuantity}
                                                    step="0.01"
                                                    value={quantities[item.id] ?? ''}
                                                    onChange={(event) => updateQuantity(item, event.target.value)}
                                                    disabled={isReadOnly}
                                                    className="input mt-1 py-2 text-sm"
                                                    aria-label={`Return quantity for ${item.itemName}`}
                                                />
                                            </label>
                                            <label className="text-xs font-semibold text-primary-600">Condition
                                                <select
                                                    value={conditions[item.id] || 'resalable'}
                                                    onChange={(event) => setConditions((current) => ({ ...current, [item.id]: event.target.value }))}
                                                    disabled={isReadOnly}
                                                    className="input mt-1 py-2 text-sm"
                                                    aria-label={`Condition for ${item.itemName}`}
                                                >
                                                    <option value="resalable">Resalable — restock</option>
                                                    <option value="damaged">Damaged — do not restock</option>
                                                </select>
                                            </label>
                                            <div className="text-sm sm:text-right">
                                                <span className="text-xs text-primary-500 sm:hidden">Still returnable: </span>
                                                <strong className="text-accent-success">{formatNumber(item.returnableQuantity)} units · up to {formatCurrency(item.returnableAmount)}</strong>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="text-sm font-semibold text-primary-800">Return reason
                                <select value={reason} onChange={(event) => setReason(event.target.value)} disabled={isReadOnly} className="input mt-1">
                                    {REASONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                            <label className="text-sm font-semibold text-primary-800">Refund method
                                <select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)} disabled={isReadOnly} className="input mt-1">
                                    {REFUND_METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                        </div>
                        {(reason === 'other' || reasonNote) && (
                            <label className="block text-sm font-semibold text-primary-800">Return note{reason === 'other' ? ' (required)' : ' (optional)'}
                                <textarea value={reasonNote} onChange={(event) => setReasonNote(event.target.value)} maxLength={500} disabled={isReadOnly} rows={2} className="input mt-1 resize-y" placeholder="Add a short explanation" />
                            </label>
                        )}
                        {refundMethod === 'check' && (
                            <label className="block text-sm font-semibold text-primary-800">Refund check number
                                <input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} maxLength={120} disabled={isReadOnly} className="input mt-1" />
                            </label>
                        )}

                        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                            <strong>Refund amount (estimate): {formatCurrency(refundEstimate)}</strong>
                            <p className="mt-1">The system calculates the final amount from the original VAT-inclusive sale price and discount. It records the refund; cash/check must be issued manually.</p>
                        </div>

                        {!isReadOnly && (
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary-200 bg-white p-3 text-sm text-primary-800">
                                <input type="checkbox" checked={refundConfirmed} onChange={(event) => setRefundConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
                                <span>I confirm this refund or store credit has actually been issued to the customer.</span>
                            </label>
                        )}
                        {pendingRetry && <p role="status" className="text-sm text-amber-900">The save result may be unclear. Retry uses the same request, so it cannot record a second refund.</p>}
                    </>
                )}

                {!loading && savedReturnId && savedReturn && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
                            <p className="font-bold">Return recorded · {savedReturn.returnNumber}</p>
                            <p className="mt-1">Refund: {formatCurrency(savedReturn.refundTotal)} via {REFUND_METHODS.find((method) => method.value === savedReturn.refundMethod)?.label || savedReturn.refundMethod}</p>
                            <p className="mt-1">Net sale after returns: {formatCurrency(context.netAmount)}</p>
                        </div>
                        <div className="rounded-xl border border-primary-200 bg-white p-4">
                            <p className="text-sm font-bold text-primary-950">Returned parts</p>
                            <ul className="mt-2 divide-y divide-primary-100">
                                {savedReturn.items?.map((item) => (
                                    <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                                        <span className="min-w-0 break-words">{item.itemName} · {formatNumber(item.quantity)} · {item.condition === 'resalable' ? 'Restocked' : 'Not restocked'}</span>
                                        <strong>{formatCurrency(item.refundAmount)}</strong>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-3 text-xs text-primary-500">Recorded {formatDateTime(savedReturn.createdAt)} by {savedReturn.processedByName || 'staff'}.</p>
                        </div>
                    </div>
                )}

                {!loading && context?.returns?.length > 0 && !savedReturnId && (
                    <details className="rounded-xl border border-primary-200 bg-white p-4">
                        <summary className="cursor-pointer text-sm font-semibold text-primary-800">Return history ({context.returns.length}) · Total refunded {formatCurrency(context.totalRefunded)}</summary>
                        <ul className="mt-3 divide-y divide-primary-100">
                            {context.returns.map((entry) => (
                                <li key={entry.id} className="py-3 text-sm">
                                    <div className="flex flex-wrap justify-between gap-2"><strong>{entry.returnNumber} · {formatCurrency(entry.refundTotal)}</strong><span>{formatDateTime(entry.createdAt)}</span></div>
                                    <p className="mt-1 text-primary-600">{REASONS.find((option) => option.value === entry.reason)?.label || entry.reason} · {entry.items?.map((item) => `${item.itemName} × ${formatNumber(item.quantity)}`).join(', ')}</p>
                                </li>
                            ))}
                        </ul>
                    </details>
                )}

                <div className="flex flex-col-reverse justify-end gap-2 border-t border-primary-200 pt-4 sm:flex-row">
                    <Button variant="secondary" onClick={handleClose}>{savedReturnId ? 'Done' : 'Cancel'}</Button>
                    {pendingRetry && <Button variant="outline" onClick={() => void retryAfterReload()} isDisabled={saving || loading}>Reload return status</Button>}
                    {context?.canReturn && !savedReturnId && (
                        <Button
                            leftIcon={<RotateCcw className="h-4 w-4" />}
                            isLoading={saving}
                            isDisabled={loading || saving || (pendingRetry ? false : (!selectedItems.length || !refundConfirmed || (reason === 'other' && !reasonNote.trim()) || (refundMethod === 'check' && !refundReference.trim())))}
                            onClick={() => void submitReturn()}
                        >
                            {pendingRetry ? 'Retry same return' : 'Record return and refund'}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}

import { useEffect, useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { PAYMENT_LABELS, PAYMENT_METHODS } from '../../../utils/constants';
import { formatCurrency } from '../../../utils/formatters';
import {
    createHistoricalSalesAggregate,
    updateHistoricalSalesAggregate,
} from '../../../services/posApi';

const PERIOD_OPTIONS = [
    { value: 'day', label: 'Day total', hint: 'One calendar day' },
    { value: 'month', label: 'Month total', hint: 'Automatically uses the full month' },
    { value: 'year', label: 'Year total', hint: 'Automatically uses January–December' },
];

function today() {
    return new Date().toISOString().slice(0, 10);
}

function createIdempotencyKey() {
    return globalThis.crypto?.randomUUID?.()
        ?? `historical-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildInitialState(aggregate) {
    return {
        periodGranularity: aggregate?.periodGranularity ?? aggregate?.period_granularity ?? 'day',
        periodStart: aggregate?.periodStart ?? aggregate?.period_start ?? today(),
        totalAmount: Number(aggregate?.totalAmount ?? aggregate?.total_amount ?? 0),
        transactionCount: Number(aggregate?.transactionCount ?? aggregate?.transaction_count ?? 1),
        paymentMethod: aggregate?.paymentMethod ?? aggregate?.payment_method ?? 'unknown',
        originalReference: aggregate?.originalReference ?? aggregate?.original_reference ?? '',
        customerName: aggregate?.customerName ?? aggregate?.customer_name ?? '',
        cashierName: aggregate?.cashierName ?? aggregate?.cashier_name ?? '',
        note: aggregate?.note ?? '',
        idempotencyKey: aggregate?.idempotencyKey ?? createIdempotencyKey(),
    };
}

export default function HistoricalAggregateEditorModal({
    isOpen,
    onClose,
    onSaved,
    aggregate = null,
}) {
    const [form, setForm] = useState(buildInitialState(aggregate));
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setForm(buildInitialState(aggregate));
            setError('');
        }
    }, [aggregate, isOpen]);

    const selectedPeriod = PERIOD_OPTIONS.find((option) => option.value === form.periodGranularity);

    const handleSubmit = async () => {
        setError('');
        setIsSaving(true);

        try {
            const payload = {
                ...form,
                totalAmount: Number(form.totalAmount || 0),
                transactionCount: Number(form.transactionCount || 1),
            };
            const saved = aggregate?.aggregateId
                ? await updateHistoricalSalesAggregate(aggregate.aggregateId, payload)
                : await createHistoricalSalesAggregate(payload);
            onSaved?.(saved);
            onClose();
        } catch (saveError) {
            setError(saveError.message || 'Unable to save the period total.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={aggregate?.aggregateId ? 'Edit Historical Period Total' : 'Encode Historical Period Total'}
            size="lg"
        >
            <div className="space-y-5">
                <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/5 p-4">
                    <p className="text-sm font-semibold text-primary-950">Use this for paper reports without item lines</p>
                    <p className="mt-1 text-sm text-primary-600">
                        The total is kept separate from item-level analytics, so no product is credited with an unknown amount.
                    </p>
                </div>

                {error && (
                    <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                        {error}
                    </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                    {PERIOD_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setForm((current) => ({ ...current, periodGranularity: option.value }))}
                            className={`rounded-2xl border p-4 text-left transition ${form.periodGranularity === option.value
                                ? 'border-accent-blue bg-accent-blue/10 shadow-sm'
                                : 'border-primary-200 bg-white hover:border-accent-blue/40'
                                }`}
                        >
                            <p className="font-semibold text-primary-950">{option.label}</p>
                            <p className="mt-1 text-xs text-primary-500">{option.hint}</p>
                        </button>
                    ))}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-semibold text-primary-700">
                        {form.periodGranularity === 'day' ? 'Sale date' : 'Any date in the period'}
                        <input
                            type="date"
                            className="input py-2.5 text-sm font-normal"
                            value={form.periodStart}
                            onChange={(event) => setForm((current) => ({ ...current, periodStart: event.target.value }))}
                        />
                    </label>
                    <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-600">
                        <p className="font-semibold text-primary-900">Recorded period</p>
                        <p className="mt-1">{selectedPeriod?.hint}. The server normalizes the exact start and end dates.</p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-semibold text-primary-700">
                        Total sales amount
                        <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary-400">₱</span>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="input py-2.5 pl-8 text-sm font-normal"
                                value={form.totalAmount}
                                onChange={(event) => setForm((current) => ({ ...current, totalAmount: event.target.value }))}
                            />
                        </div>
                        <span className="block text-xs font-normal text-primary-500">{formatCurrency(Number(form.totalAmount || 0))}</span>
                    </label>
                    <label className="space-y-2 text-sm font-semibold text-primary-700">
                        Number of transactions
                        <input
                            type="number"
                            min="1"
                            step="1"
                            className="input py-2.5 text-sm font-normal"
                            value={form.transactionCount}
                            onChange={(event) => setForm((current) => ({ ...current, transactionCount: event.target.value }))}
                        />
                    </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-semibold text-primary-700">
                        Payment method
                        <select
                            className="input py-2.5 text-sm font-normal"
                            value={form.paymentMethod}
                            onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}
                        >
                            <option value="unknown">Unknown / paper summary</option>
                            <option value="mixed">Mixed methods</option>
                            {Object.entries(PAYMENT_LABELS)
                                .filter(([value]) => Object.values(PAYMENT_METHODS).includes(value))
                                .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-2 text-sm font-semibold text-primary-700">
                        Original paper reference
                        <input
                            type="text"
                            className="input py-2.5 text-sm font-normal"
                            value={form.originalReference}
                            onChange={(event) => setForm((current) => ({ ...current, originalReference: event.target.value }))}
                            placeholder="Monthly close / OR range"
                        />
                    </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-semibold text-primary-700">
                        Customer label (optional)
                        <input
                            type="text"
                            className="input py-2.5 text-sm font-normal"
                            value={form.customerName}
                            onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
                            placeholder="Walk-in customers / account name"
                        />
                    </label>
                    <label className="space-y-2 text-sm font-semibold text-primary-700">
                        Original cashier
                        <input
                            type="text"
                            className="input py-2.5 text-sm font-normal"
                            value={form.cashierName}
                            onChange={(event) => setForm((current) => ({ ...current, cashierName: event.target.value }))}
                            placeholder="Cashier on the paper summary"
                        />
                    </label>
                </div>

                <label className="block space-y-2 text-sm font-semibold text-primary-700">
                    Note (optional)
                    <textarea
                        className="input min-h-20 py-2.5 text-sm font-normal"
                        value={form.note}
                        onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                        placeholder="Source batch, filing note, or reconciliation details"
                    />
                </label>

                <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" isLoading={isSaving} onClick={handleSubmit}>
                        {aggregate?.aggregateId ? 'Update Period Total' : 'Save Period Total'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

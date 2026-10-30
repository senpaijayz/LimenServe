import { useEffect, useState } from 'react';
import { Archive, Eye, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../../../context/useAuth';
import { searchSavedEstimates } from '../../../services/estimatesApi';
import { formatCurrency } from '../../../utils/formatters';
import CustomerRecordPreview from '../../customers/components/CustomerRecordPreview';

const statuses = [
    ['', 'All saved statuses'], ['draft', 'Draft'], ['sent', 'Sent'], ['approved', 'Approved'],
    ['converted_sale', 'Converted to sale'], ['converted_service', 'Converted to service'],
    ['rejected', 'Rejected'], ['expired', 'Marked expired'],
];
const label = (status) => statuses.find(([value]) => value === status)?.[1] || 'Unknown status';
const fieldClass = 'mt-1 min-h-11 w-full rounded-lg border border-primary-300 bg-white px-3 py-2 text-sm text-primary-950';
const actionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary-300 px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-50';

export default function SavedQuotationBrowser({ selectedId, onSelect, onDelete, onArchive, refreshKey, disabled }) {
    const { user } = useAuth();
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [validity, setValidity] = useState('current');
    const [page, setPage] = useState(1);
    const [retry, setRetry] = useState(0);
    const [preview, setPreview] = useState(null);
    const [state, setState] = useState({ key: '', data: null, error: '' });
    const owner = user?.id || '';
    const key = JSON.stringify([owner, search, status, validity, page, retry, refreshKey]);
    const ready = state.key === key;
    const data = ready ? state.data : null;
    const error = ready ? state.error : '';
    const loading = !ready;

    useEffect(() => {
        const controller = new AbortController();
        if (!owner) return () => controller.abort();
        const timer = setTimeout(() => {
            searchSavedEstimates({ search, status, validity, page, signal: controller.signal }).then((result) => {
                if (controller.signal.aborted) return;
                if (result.page !== page) { setPage(result.page); return; }
                setState({ key, data: result, error: '' });
            }).catch((failure) => {
                if (!controller.signal.aborted) setState({ key, data: null, error: failure.message || 'Saved quotations could not load.' });
            });
        }, 250);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [owner, search, status, validity, page, key]);

    const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
    return <section className="min-w-0 space-y-3" aria-label="Find a saved quotation" aria-busy={loading}>
        <label className="block text-sm font-semibold text-primary-800">Find a quotation
            <input type="search" value={search} maxLength={100} placeholder="Quote number, customer, phone or vehicle"
                onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={fieldClass} />
        </label>
        <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 text-xs font-semibold text-primary-800">Saved status
                <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className={fieldClass}>
                    {statuses.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
            </label>
            <label className="min-w-0 text-xs font-semibold text-primary-800">Quote validity
                <select value={validity} onChange={(event) => { setValidity(event.target.value); setPage(1); }} className={fieldClass}>
                    <option value="current">Current</option><option value="past">Past quotes</option><option value="all">All dates</option>
                </select>
            </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-primary-700" role="status">{loading ? 'Loading quotations…' : error ? 'List unavailable' : data?.total
                ? `${(page - 1) * data.pageSize + 1}–${Math.min(page * data.pageSize, data.total)} of ${data.total} matching quotes` : 'No matching quotes'}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={loading} className={actionClass} aria-label="Refresh saved quotations"><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh</button>
        </div>
        <p className="text-xs text-primary-700">Past quotes open as view-only records. Archived quotes are not listed.</p>
        <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
            {loading ? <p className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-700">Loading saved quotations…</p>
                : error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" className="mt-2 block min-h-11 font-semibold underline" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>
                    : !data?.quotes.length ? <p className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-700">No quotes match these filters. Try another status, validity or search.</p>
                        : data.quotes.map((quote) => <article key={quote.id} className={`rounded-xl border p-3 ${selectedId === quote.id ? 'border-blue-500 bg-blue-50/50' : 'border-primary-200 bg-white'}`}>
                            <p className="break-all text-base font-bold text-primary-950">{quote.estimate_number}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                                <span className="rounded-md bg-primary-100 px-2 py-1 text-primary-800">{label(quote.status)}</span>
                                {quote.past_validity && <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-900">Past validity</span>}
                            </div>
                            <p className="mt-2 break-words text-sm text-primary-800">{quote.customer_name || 'Walk-in customer'}</p>
                            <p className="text-xs text-primary-700">{quote.customer_phone || 'No phone recorded'}</p>
                            <p className="mt-2 font-semibold text-blue-800">{quote.grand_total == null ? 'Total not recorded' : formatCurrency(quote.grand_total)}</p>
                            <p className="mt-1 text-xs text-primary-700">Valid until {quote.valid_until || 'Not recorded'}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {!quote.past_validity && <button type="button" disabled={disabled} className={actionClass} onClick={() => onSelect(quote.id)} aria-pressed={selectedId === quote.id}>Open quotation</button>}
                                <button type="button" className={actionClass} onClick={() => setPreview({ ...quote, owner })}><Eye className="h-4 w-4" aria-hidden="true" />{quote.past_validity ? 'View quote' : 'Preview'}</button>
                                {!quote.past_validity && <button type="button" disabled={disabled} className={`${actionClass} ${quote.status === 'draft' ? 'text-red-700' : ''}`}
                                    aria-label={`${quote.status === 'draft' ? 'Delete draft' : 'Archive quotation'} ${quote.estimate_number}`}
                                    onClick={() => quote.status === 'draft' ? onDelete(quote) : onArchive(quote)}>
                                    {quote.status === 'draft' ? <Trash2 className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
                                    {quote.status === 'draft' ? 'Delete' : 'Archive'}
                                </button>}
                            </div>
                        </article>)}
        </div>
        <nav className="flex items-center justify-between gap-2 border-t border-primary-200 pt-3" aria-label="Saved quotation pages">
            <button type="button" className={actionClass} disabled={loading || Boolean(error) || !data || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span className="text-xs text-primary-700">{data ? `${page} / ${totalPages}` : '—'}</span>
            <button type="button" className={actionClass} disabled={loading || Boolean(error) || !data || page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
        </nav>
        {preview?.owner === owner && <CustomerRecordPreview key={`${owner}:${preview.id}`} record={{ id: preview.id, reference: preview.estimate_number }} kind="quotes" onClose={() => setPreview(null)} />}
    </section>;
}

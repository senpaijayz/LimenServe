import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Camera, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../context/useAuth';
import { useTheme } from '../../../context/ThemeContext';
import { getProductCatalog, getSuppliers, receiveInventoryBatch } from '../../../services/catalogApi';
import { getProductPartNumber } from '../../../utils/barcode';
import { createIdempotencyKey } from '../../../utils/idempotency';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import AddStockModal from '../components/AddStockModal';
import { useLocator3DStore } from '../../locator3d/store/useLocator3DStore';

const field = 'w-full min-h-11 rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-950 focus:outline-none focus:ring-2 focus:ring-accent-blue';
const today = () => { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-'); };
const empty = () => ({ version: 1, items: [], supplierId: '', referenceNumber: '', receivedDate: today(), notes: '', requestKey: createIdempotencyKey('receipt') });

export default function ReceiveStock() {
    const { user } = useAuth();
    const { sidebarCollapsed } = useTheme();
    const navigate = useNavigate();
    const storageKey = user?.id ? `limen:receiving:v1:${user.id}` : null;
    const [draft, setDraft] = useState(empty);
    const [loadedKey, setLoadedKey] = useState(null);
    const [draftStatus, setDraftStatus] = useState('');
    const [suppliers, setSuppliers] = useState([]);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [quantity, setQuantity] = useState('1');
    const [busy, setBusy] = useState(false);
    const [review, setReview] = useState(false);
    const [error, setError] = useState('');
    const [receipt, setReceipt] = useState(null);
    const [camera, setCamera] = useState(false);
    const [invoice, setInvoice] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const inFlight = useRef(false);

    useEffect(() => {
        if (!storageKey) return;
        setReceipt(null); setUncertain(false); setReview(false);
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
            if (saved?.version === 1 && Array.isArray(saved.items)) {
                setDraft(saved); setUncertain(Boolean(saved.submitted)); setDraftStatus('Continue Draft — restored on this device');
            } else setDraft(empty());
        } catch { setDraft(empty()); }
        setLoadedKey(storageKey);
    }, [storageKey]);
    useEffect(() => {
        if (!storageKey || loadedKey !== storageKey || receipt) return;
        setDraftStatus('Saving...');
        try { localStorage.setItem(storageKey, JSON.stringify(draft)); setDraftStatus('Draft Saved'); }
        catch { setDraftStatus('Draft could not be saved on this device. Keep this page open.'); }
    }, [draft, loadedKey, receipt, storageKey]);
    useEffect(() => { getSuppliers().then(setSuppliers).catch(() => setError('Suppliers could not load. You can still receive without a supplier.')); }, []);
    useEffect(() => {
        let active = true;
        const timer = window.setTimeout(async () => {
            if (!query.trim()) { setResults([]); return; }
            try {
                const data = await getProductCatalog({ q: query.trim(), page: 1, pageSize: 8, includeCategories: false });
                if (active) setResults(data.products || []);
            } catch (e) { if (active) setError(e.message); }
        }, 220);
        return () => { active = false; window.clearTimeout(timer); };
    }, [query]);
    const change = (patch) => { if (!busy && !uncertain) { setDraft((d) => ({ ...d, ...patch })); setReview(false); } };
    const add = (product) => {
        const qty = Number(quantity);
        if (busy || uncertain) return;
        if (!Number.isInteger(qty) || qty < 1 || qty > 1000000) { setError('Enter a whole-number quantity from 1 to 1,000,000.'); return; }
        if (draft.items.length >= 100 && !draft.items.some((x) => x.productId === product.id)) { setError('Receive up to 100 distinct products in one receipt.'); return; }
        const existing = draft.items.find((x) => x.productId === product.id);
        if (Number(existing?.quantity || 0) + qty > 1000000) { setError('The combined quantity cannot exceed 1,000,000 for one product.'); return; }
        const item = { productId: product.id, partNumber: getProductPartNumber(product), description: product.name, currentStock: Number(product.stock ?? product.quantity ?? 0), quantity: qty };
        change({ items: existing ? draft.items.map((x) => x.productId === product.id ? { ...x, quantity: Number(x.quantity) + qty } : x) : [...draft.items, item] });
        setQuery(''); setResults([]); setQuantity('1'); setError('');
    };
    const scan = async (value) => {
        setQuery(value);
        try {
            const data = await getProductCatalog({ q: value, page: 1, pageSize: 8, includeCategories: false });
            const exact = (data.products || []).find((p) => [p.sku, p.barcode, getProductPartNumber(p)].some((v) => String(v || '').toUpperCase() === String(value).toUpperCase()));
            if (exact) add(exact); else { setResults(data.products || []); setError('Choose the matching part below.'); }
        } catch (e) { setError(e.message); }
    };
    const receive = async () => {
        if (inFlight.current || !draft.items.length) return;
        if (draft.items.some((x) => !Number.isInteger(Number(x.quantity)) || Number(x.quantity) < 1 || Number(x.quantity) > 1000000)) { setError('Every quantity must be a whole number from 1 to 1,000,000.'); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.receivedDate) || !Number.isFinite(Date.parse(draft.receivedDate))) { setError('Choose a valid received date.'); return; }
        inFlight.current = true; setBusy(true); setError('');
        const submitted = { ...draft, submitted: true };
        try {
            // Store the identity before sending; an interrupted response must reuse it.
            localStorage.setItem(storageKey, JSON.stringify(submitted));
            setDraft(submitted); setUncertain(true);
            const saved = await receiveInventoryBatch({ items: draft.items.map(({ productId, quantity: q }) => ({ productId, quantity: Number(q) })), supplierId: draft.supplierId || null, referenceNumber: draft.referenceNumber, receivedDate: draft.receivedDate, reason: draft.notes }, { idempotencyKey: draft.requestKey });
            setReceipt(saved); localStorage.removeItem(storageKey); setDraftStatus('Receipt confirmed');
            useLocator3DStore.getState().setRecentlyReceivedStock({ receiptId: saved.receiptId, items: saved.items, returnTo: '/inventory/receive' });
            try { sessionStorage.setItem(`limen:received:${user.id}`, JSON.stringify({ ...saved, savedAt: Date.now() })); } catch { /* The confirmed receipt is also held in memory. */ }
        } catch (e) {
            if (e.receiptRejected) {
                setUncertain(false);
                setDraft((d) => ({ ...d, submitted: false, requestKey: createIdempotencyKey('receipt') }));
                setError(`${e.message} Nothing was received. Correct the details and try again.`);
            } else setError(`${e.message || 'The receipt could not be confirmed.'} Your draft is kept. Retry this same receipt to check its result safely.`);
        } finally { inFlight.current = false; setBusy(false); }
    };
    const discard = () => {
        if (uncertain) { setError('Resolve this submitted receipt before changing or discarding it. Retry with the same receipt identity.'); return; }
        if (draft.items.length && !window.confirm('Discard this receiving draft?')) return;
        setDraft(empty()); setReview(false); setError('');
    };
    const units = draft.items.reduce((n, x) => n + (Number(x.quantity) || 0), 0);
    if (!['admin', 'stock_clerk'].includes(user?.role)) return <p>You do not have permission to receive stock.</p>;
    if (receipt) return <div className="mx-auto max-w-3xl space-y-5 rounded-2xl border bg-white p-5"><h1 className="text-2xl font-bold">Stock received</h1><p>{receipt.totalLines} products · {receipt.totalQuantity} units · {receipt.referenceNumber}</p><p>Stock is confirmed. You can now assign physical locations, or do that later.</p><div className="flex flex-wrap gap-3"><button className="btn btn-primary" onClick={() => navigate('/locator-3d?received=1')}>Assign Locations in 3D</button><Link className="btn btn-secondary" to="/inventory">Back to Inventory</Link><button className="btn btn-secondary" onClick={() => { setReceipt(null); setUncertain(false); setDraft(empty()); }}>Receive more stock</button></div></div>;
    return <div className="mx-auto max-w-5xl space-y-5 pb-40">
        <header className="flex flex-wrap items-start justify-between gap-3"><div><Link className="inline-flex min-h-11 items-center gap-2 text-sm text-primary-600" to="/inventory"><ArrowLeft size={16} /> Back to Inventory</Link><h1 className="text-2xl font-bold">Receive Stock</h1><p role="status" className="mt-1 text-sm text-primary-500">{draftStatus}</p></div><button className="btn btn-secondary" disabled={busy || uncertain} onClick={() => setInvoice(true)}>Scan / enter invoice</button></header>
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        {uncertain && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">This receipt was submitted. Its details are locked until the server confirms the result. Retry safely below.</div>}
        <fieldset disabled={busy || uncertain} className="rounded-2xl border bg-white p-4"><legend className="px-2 font-semibold">Receipt details</legend><div className="grid gap-4 sm:grid-cols-2"><label>Supplier (Optional)<select className={`${field} mt-1`} value={draft.supplierId} onChange={(e) => change({ supplierId: e.target.value })}><option value="">No supplier / Not provided</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Reference number (Optional)<input className={`${field} mt-1`} value={draft.referenceNumber} maxLength={120} onChange={(e) => change({ referenceNumber: e.target.value })} /></label><label>Received date<input type="date" required className={`${field} mt-1`} value={draft.receivedDate} onChange={(e) => change({ receivedDate: e.target.value })} /></label><label>Notes (Optional)<input className={`${field} mt-1`} value={draft.notes} maxLength={1000} onChange={(e) => change({ notes: e.target.value })} /></label></div></fieldset>
        <section className="rounded-2xl border bg-white p-4"><h2 className="mb-3 font-semibold">Add products</h2><div className="flex flex-wrap gap-2"><input disabled={busy || uncertain} className={`${field} min-w-0 flex-1 basis-48`} placeholder="Search part number or product name" aria-label="Search receiving products" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void scan(query); } }} /><input disabled={busy || uncertain} className={`${field} !w-24`} type="number" min="1" step="1" aria-label="Quantity to add" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><button className="btn btn-secondary" disabled={busy || uncertain} aria-label="Scan barcode" onClick={() => setCamera(true)}><Camera size={18} /></button></div><div className="mt-2 divide-y">{results.map((p) => <button disabled={busy || uncertain} className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left hover:bg-primary-50" key={p.id} onClick={() => add(p)}><span><strong className="block font-mono text-sm">{getProductPartNumber(p)}</strong><span className="text-sm text-primary-600">{p.name}</span></span><Plus className="shrink-0" size={18} /></button>)}</div></section>
        <section className="overflow-hidden rounded-2xl border bg-white"><h2 className="border-b p-4 font-semibold">Receiving list · {draft.items.length} products</h2>{!draft.items.length && <p className="p-6 text-sm text-primary-500">Search or scan a part to start this receipt.</p>}<div className="divide-y">{draft.items.map((x) => <div key={x.productId} className="grid grid-cols-[minmax(0,1fr)_90px_40px] items-center gap-2 p-3 sm:gap-4"><div className="min-w-0"><p className="break-all font-mono text-sm font-bold">{x.partNumber}</p><p className="break-words text-sm">{x.description}</p><p className="mt-1 text-xs text-primary-500">Current: {x.currentStock} · Expected: {x.currentStock + Number(x.quantity || 0)}</p></div><label className="text-xs text-primary-500">Add quantity<input className={`${field} mt-1`} type="number" min="1" max="1000000" step="1" disabled={busy || uncertain} value={x.quantity} onChange={(e) => change({ items: draft.items.map((row) => row.productId === x.productId ? { ...row, quantity: e.target.value } : row) })} /></label><button className="min-h-11 rounded-lg text-red-700 hover:bg-red-50" disabled={busy || uncertain} aria-label={`Remove ${x.partNumber}`} onClick={() => change({ items: draft.items.filter((row) => row.productId !== x.productId) })}><Trash2 size={18} /></button></div>)}</div></section>
        {review && <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><h2 className="font-bold">Review this receipt</h2><p className="mt-2 text-sm">{draft.items.length} distinct products · {units} incoming units. Supplier: {suppliers.find((s) => s.id === draft.supplierId)?.name || 'Not provided'}. All lines will be received together.</p><p className="mt-2 text-xs">Displayed stock is a snapshot. The server records the actual balances when it receives the stock.</p></section>}
        <footer style={{ '--sidebar-width': sidebarCollapsed ? '5rem' : '16rem' }} className="fixed inset-x-0 bottom-0 z-30 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg lg:left-[var(--sidebar-width,0px)]"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{draft.items.length} products · {units} incoming units</p><div className="flex flex-wrap gap-2"><button className="btn btn-secondary" disabled={busy || uncertain} onClick={discard}>Discard Draft</button><button className="btn btn-secondary" disabled={busy} onClick={() => { try { localStorage.setItem(storageKey, JSON.stringify(draft)); setDraftStatus('Draft Saved'); } catch { setError('Draft storage is unavailable.'); } }}>Save Draft</button><button className="btn btn-primary" disabled={busy || !draft.items.length} onClick={() => { if (review || uncertain) void receive(); else setReview(true); }}>{busy ? 'Receiving...' : uncertain ? 'Check / retry receipt' : review ? 'Confirm Receive Stock' : 'Review & Receive Stock'}</button></div></div></footer>
        <CameraScannerModal isOpen={camera} onClose={() => setCamera(false)} onScan={(value) => { setCamera(false); void scan(value); }} />
        <AddStockModal isOpen={invoice} initialMode="invoice" onClose={() => setInvoice(false)} />
    </div>;
}

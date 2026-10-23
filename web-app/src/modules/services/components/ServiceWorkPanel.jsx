import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, CreditCard, FileText, Package, Pause, Play, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { completeServiceOrder, getServiceWork, recordServiceWorkEvent, saveServiceWorkLines } from '../../../services/serviceOrdersApi';
import { formatCurrency } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import { PartSearch } from './ServiceOrderModals';

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const escapeHtml = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const stageLabels = { intake: 'Intake', scheduled: 'Scheduled', in_progress: 'In progress', paused: 'Paused', work_completed: 'Repair finished · awaiting payment', released: 'Completed / released', cancelled: 'Cancelled' };
const lineFromRow = (line) => ({ id: line.id || crypto.randomUUID(), kind: line.kind, productId: line.product_id || null, description: line.description, quantity: String(line.quantity), unitPrice: String(line.unit_price) });

function printReceipt(order, work) {
  const sale = work.sale;
  if (!sale) return;
  const printWindow = window.open('', '_blank', 'width=900,height=720');
  if (!printWindow) return;
  const rows = (sale.lines || []).map((line) => `<tr><td>${escapeHtml(line.item_sku_snapshot || '')}</td><td>${escapeHtml(line.item_name_snapshot)}</td><td>${escapeHtml(line.quantity)}</td><td>${escapeHtml(formatCurrency(line.unit_price))}</td><td>${escapeHtml(formatCurrency(line.line_total))}</td></tr>`).join('');
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Service receipt ${escapeHtml(order.orderNumber || order.id)}</title><style>@page{size:A4;margin:16mm}body{font:13px Arial;color:#111827}h1{font-size:21px;margin:0}h2{font-size:16px;margin-top:26px}.head{display:flex;justify-content:space-between;border-bottom:2px solid #111827;padding-bottom:15px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:18px}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{padding:9px 6px;text-align:left;border-bottom:1px solid #d1d5db}th{background:#f3f4f6}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:22px}.muted{color:#64748b}footer{margin-top:45px;border-top:1px solid #d1d5db;padding-top:12px}</style></head><body><div class="head"><div><h1>Limen Auto Supply and Services</h1><p>Service receipt</p></div><div><strong>${escapeHtml(sale.transaction_number)}</strong><br>${escapeHtml(order.orderNumber || order.id)}</div></div><div class="meta"><div><span class="muted">Customer</span><br><strong>${escapeHtml(order.customerName || 'Walk-in customer')}</strong></div><div><span class="muted">Vehicle</span><br>${escapeHtml([order.vehicle?.year,order.vehicle?.make,order.vehicle?.model,order.vehicle?.plate].filter(Boolean).join(' '))}</div><div><span class="muted">Payment</span><br>${escapeHtml(sale.payment_method)}</div><div><span class="muted">Date</span><br>${escapeHtml(new Date(sale.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'}))}</div></div><h2>Work and parts</h2><table><thead><tr><th>Part no.</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p class="total">Total paid: ${escapeHtml(formatCurrency(sale.total_amount))}</p>${sale.payment_method==='cash'?`<p class="total" style="font-size:13px">Cash: ${escapeHtml(formatCurrency(sale.cash_received))} · Change: ${escapeHtml(formatCurrency(sale.change_due))}</p>`:''}<footer>Thank you for trusting Limen Auto Supply and Services.</footer></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => { if (!printWindow.closed) printWindow.print(); }, 300);
}

export default function ServiceWorkPanel({ order, onOrderUpdated }) {
  const toast = useToast();
  const [work, setWork] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState('');
  const [laborDescription, setLaborDescription] = useState('');
  const [laborQuantity, setLaborQuantity] = useState('1');
  const [laborRate, setLaborRate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    const data = await getServiceWork(order.id);
    setWork(data); setLines((data.lines || []).map(lineFromRow)); setDirty(false);
  }, [order.id]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    getServiceWork(order.id).then((data) => { if (active) { setWork(data); setLines((data.lines || []).map(lineFromRow)); setDirty(false); } })
      .catch((err) => { if (active) setError(err.message || 'Unable to load workshop progress.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [order.id]);
  const stage = work?.state?.stage || 'intake';
  const editable = Boolean(work) && !['released','cancelled'].includes(stage) && order.status !== 'completed' && order.status !== 'cancelled';
  const actualTotal = useMemo(() => money(lines.reduce((sum, line) => sum + money(line.quantity) * money(line.unitPrice), 0)), [lines]);
  const estimate = money(work?.state?.estimate_total ?? order.estimatedCost ?? order.totalAmount ?? order.total_amount);
  const approvalNeeded = actualTotal > estimate + 0.01;

  const event = async (eventType, eventNote = note) => {
    setSaving(true); setError('');
    try {
      const result = await recordServiceWorkEvent(order.id, eventType, eventNote);
      if (result?.order) onOrderUpdated(result.order);
      setNote(''); await reload(); toast.success('Work update saved.');
    } catch (err) { setError(err.message || 'Unable to save work update.'); }
    finally { setSaving(false); }
  };
  const saveLines = async () => {
    setSaving(true); setError('');
    try {
      await saveServiceWorkLines(order.id, lines.map((line) => ({ kind: line.kind, productId: line.productId, description: line.description.trim(), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })));
      await reload(); toast.success('Actual parts and labor saved.');
    } catch (err) { setError(err.message || 'Unable to save actual charges.'); }
    finally { setSaving(false); }
  };
  const pay = async () => {
    setSaving(true); setError('');
    try {
      const result = await completeServiceOrder(order.id, { paymentMethod, cashReceived: paymentMethod === 'cash' ? Number(cashReceived) : 0, paymentReference: paymentMethod === 'cash' ? '' : paymentReference.trim(), paymentReceivedConfirmed: paymentVerified });
      onOrderUpdated(result.order); await reload(); toast.success('Payment posted once; service order completed.');
    } catch (err) { setError(err.message || 'Unable to post the payment. No duplicate sale was created.'); }
    finally { setSaving(false); }
  };
  const changeLine = (id, key, value) => { setLines((current) => current.map((line) => line.id === id ? { ...line, [key]: value } : line)); setDirty(true); };

  if (loading) return <section className="rounded-xl border border-primary-200 bg-white p-5 text-sm text-primary-600">Loading workshop progress…</section>;
  if (!work) return <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{error || 'Workshop progress could not be loaded.'} <button type="button" className="ml-2 underline" onClick={() => { setLoading(true); reload().then(() => setError('')).catch((err) => setError(err.message || 'Unable to reload workshop progress.')).finally(() => setLoading(false)); }}>Try again</button></section>;
  return <div className="space-y-5" id="workshop-progress">
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <section className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-primary-500">Workshop progress</p><h2 className="mt-1 text-xl font-bold text-primary-950">{stageLabels[stage] || stage}</h2><p className="mt-1 text-sm text-primary-600">Finishing the repair does not mark it paid.</p></div><span className="rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{order.assignedMechanic?.name || 'Mechanic not assigned'}</span></div>
      {editable && <div className="mt-5 flex flex-wrap gap-2">{stage==='intake' || stage==='scheduled' ? <button type="button" className="btn bg-blue-700 text-white" disabled={saving} onClick={() => event('start','Work started.')}><Play className="h-4 w-4" /> Start work</button> : null}{stage==='in_progress' && <button type="button" className="btn" disabled={saving} onClick={() => event('pause',note)}><Pause className="h-4 w-4" /> Pause with reason</button>}{stage==='paused' && <button type="button" className="btn bg-blue-700 text-white" disabled={saving} onClick={() => event('resume','Work resumed.')}><Play className="h-4 w-4" /> Resume</button>}{stage==='in_progress' && <button type="button" className="btn bg-emerald-700 text-white" disabled={saving || dirty} onClick={() => event('work_completed','Repair work finished; billing review pending.')}><CheckCircle2 className="h-4 w-4" /> Mark repair finished</button>}</div>}
      {editable && <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"><textarea className="input min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Record diagnosis, repair notes, or a delay reason…" /><div className="flex gap-2"><button type="button" className="btn" disabled={saving || !note.trim()} onClick={() => event('note')}><Plus className="h-4 w-4" /> Note</button><button type="button" className="btn" disabled={saving || !note.trim()} onClick={() => event('diagnosis')}><FileText className="h-4 w-4" /> Diagnosis</button></div></div>}
      {dirty && <p className="mt-2 text-xs text-amber-800">Save actual parts and labor before marking the repair finished.</p>}
    </section>

    <section className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex items-center gap-2"><Package className="h-5 w-5 text-blue-700" /><h2 className="text-lg font-bold text-primary-950">Actual parts & labor</h2></div><p className="mt-1 text-sm text-primary-600">Intake estimates are separate. Parts are deducted once, when confirmed payment posts to Sales.</p>
      {editable && <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-primary-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-primary-950">Add a part used</h3>
          <PartSearch onAdd={(part) => { setLines((current) => [...current, { id: crypto.randomUUID(), kind: 'part', productId: part.productId, description: part.itemName, quantity: String(part.quantity), unitPrice: String(part.unitPrice) }]); setDirty(true); }} />
        </div>
        <div className="rounded-xl border border-primary-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-primary-950">Add labor performed</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input sm:col-span-2" placeholder="Labor description" value={laborDescription} onChange={(e) => setLaborDescription(e.target.value)} />
            <input className="input text-right tabular-nums" type="number" min="0.01" step="0.01" aria-label="Labor hours or quantity" placeholder="Hours / qty" value={laborQuantity} onChange={(e) => setLaborQuantity(e.target.value)} />
            <input className="input text-right tabular-nums" type="number" min="0" step="0.01" aria-label="Labor rate" placeholder="Rate (₱)" value={laborRate} onChange={(e) => setLaborRate(e.target.value)} />
          </div>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border-2 border-primary-800 bg-primary-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-primary-950 hover:bg-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:border-primary-500 disabled:bg-primary-500 disabled:text-white disabled:opacity-75"
            disabled={!laborDescription.trim() || Number(laborQuantity) <= 0 || Number(laborRate) < 0 || laborRate === ''}
            onClick={() => { setLines((current) => [...current, { id: crypto.randomUUID(), kind: 'labor', productId: null, description: laborDescription.trim(), quantity: laborQuantity, unitPrice: laborRate }]); setLaborDescription(''); setLaborQuantity('1'); setLaborRate(''); setDirty(true); }}
          >
            <Plus className="h-4 w-4" /> Add labor
          </button>
        </div>
      </div>}
      <div className="mt-4 space-y-2">
        {lines.length === 0 && <p className="rounded-xl border border-dashed border-primary-200 p-4 text-sm text-primary-500">No actual charges recorded yet.</p>}
        {lines.map((line) => (
          <div key={line.id} className="grid gap-3 rounded-xl border border-primary-200 p-3 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_8rem_auto] sm:items-center">
            <div className="flex min-h-11 min-w-0 flex-col justify-center">
              <span className="text-xs font-bold uppercase text-primary-500">{line.kind}</span>
              <p className="truncate text-sm font-semibold text-primary-950">{line.description}</p>
            </div>
            <label className="text-xs text-primary-600">Quantity<input className="input mt-1 text-right tabular-nums" type="number" min={line.kind === 'part' ? '1' : '0.01'} step={line.kind === 'part' ? '1' : '0.01'} value={line.quantity} disabled={!editable} onChange={(e) => changeLine(line.id, 'quantity', e.target.value)} /></label>
            <label className="text-xs text-primary-600">Unit price<input className="input mt-1 text-right tabular-nums" type="number" min="0" step="0.01" value={line.unitPrice} disabled={!editable || line.kind === 'part'} onChange={(e) => changeLine(line.id, 'unitPrice', e.target.value)} /></label>
            <strong className="self-center text-right text-sm tabular-nums text-primary-950">{formatCurrency(money(line.quantity) * money(line.unitPrice))}</strong>
            {editable && <button type="button" className="inline-flex h-10 w-10 items-center justify-center justify-self-end rounded-lg border border-red-200 bg-white text-red-600 transition hover:border-red-300 hover:bg-red-50" aria-label={`Remove ${line.description}`} onClick={() => { setLines((current) => current.filter((item) => item.id !== line.id)); setDirty(true); }}><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-primary-100 pt-4"><p className="text-sm text-primary-600">Estimate: {formatCurrency(estimate)} · Actual: <strong className="text-primary-950">{formatCurrency(actualTotal)}</strong></p>{editable && <button type="button" className="btn bg-blue-700 text-white" disabled={saving || !dirty} onClick={saveLines}><Save className="h-4 w-4" /> Save actuals</button>}</div>
      {approvalNeeded && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Actual charges exceed the estimate by {formatCurrency(actualTotal-estimate)}.</strong><p className="mt-1">Record the customer's approval before posting. An approval is cleared if actual charges change.</p>{work?.state?.customer_approval_note && <p className="mt-2">Recorded approval: {work.state.customer_approval_note}</p>}{editable && <button type="button" className="btn mt-3" disabled={saving || dirty || !note.trim()} onClick={() => event('customer_approval',note)}>Record approval note above</button>}</div>}
    </section>

    <section className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-blue-700" /><h2 className="text-lg font-bold text-primary-950">Billing & receipt</h2></div>{work?.sale ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"><span>Paid · {work.sale.transaction_number} · {formatCurrency(work.sale.total_amount)}</span><button type="button" className="btn" onClick={() => printReceipt(order,work)}><Printer className="h-4 w-4" /> Print / Save PDF</button></div> : <>
      <p className="mt-2 text-sm text-primary-600">Payment is separate from repair completion. Review the final lines above before confirming money received.</p>
      {stage==='work_completed' && <div className="mt-4 space-y-4"><div className="rounded-xl bg-primary-950 p-4 text-white"><span>Final amount due</span><strong className="float-right text-xl">{formatCurrency(actualTotal)}</strong></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-primary-700">Payment method<select className="input mt-1" value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setPaymentVerified(false); }}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank_transfer">Bank Transfer</option></select></label>{paymentMethod==='cash'?<label className="text-sm font-semibold text-primary-700">Cash received<input className="input mt-1" type="number" min={actualTotal} step="0.01" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} /></label>:<label className="text-sm font-semibold text-primary-700">Verified transaction reference<input className="input mt-1" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Reference from confirmed payment" /></label>}</div>{paymentMethod==='cash' && Number(cashReceived)>=actualTotal && <p className="text-sm text-primary-700">Change due: {formatCurrency(Number(cashReceived)-actualTotal)}</p>}<label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><input type="checkbox" className="mt-1" checked={paymentVerified} onChange={(e) => setPaymentVerified(e.target.checked)} /><span>I verified that the customer paid this final amount. Posting creates the sale and deducts actual parts once.</span></label><button type="button" className="btn bg-emerald-700 text-white" disabled={saving || dirty || !lines.length || !paymentVerified || (paymentMethod==='cash' && Number(cashReceived)<actualTotal) || (paymentMethod!=='cash' && !paymentReference.trim()) || (approvalNeeded && !work?.state?.customer_approval_note)} onClick={pay}>Confirm payment & post to Sales</button></div>}
      {stage!=='work_completed' && <p className="mt-3 rounded-xl bg-primary-50 p-3 text-sm text-primary-600">Mark the repair work finished to begin billing review. The job remains unpaid until payment is confirmed.</p>}
    </>}</section>

    <section className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-blue-700" /><h2 className="text-lg font-bold text-primary-950">Activity history</h2></div><div className="mt-4 space-y-2">{(work?.events || []).length===0 && <p className="text-sm text-primary-500">No workshop updates have been recorded yet.</p>}{(work?.events || []).map((item) => <div key={item.id} className="border-l-2 border-blue-200 py-2 pl-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="capitalize text-primary-950">{item.event_type.replaceAll('_',' ')}</strong><time className="text-primary-500">{new Date(item.occurred_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</time></div>{item.note && <p className="mt-1 text-primary-700">{item.note}</p>}</div>)}</div></section>
  </div>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { createServiceOrder, getServiceScheduleSlots, getServiceIntakeResult } from '../../../services/serviceOrdersApi';
import { getServiceIntakeContext } from '../../../services/customerHistoryApi';
import SavedCustomerIntake from '../components/SavedCustomerIntake';
import { savedIntakeFields } from '../utils/savedIntakeFields';
import { listMechanics } from '../../../services/mechanicsApi';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../context/useAuth';
import { ROLES } from '../../../utils/constants';
import { formatCurrency } from '../../../utils/formatters';
import { PartSearch } from '../components/ServiceOrderModals';
import Modal from '../../../components/ui/Modal';

const DRAFT_KEY_PREFIX = 'limen-service-intake-draft-v2';
const initial = { customerId: '', vehicleId: '', identityVersion: '', customerName: '', customerPhone: '', vehicleMake: 'Mitsubishi', vehicleModel: '', vehicleYear: '', vehiclePlate: '', description: '', laborEstimate: '', priority: 'normal', mechanicId: '', date: '', duration: 60, slotStart: '', slotEnd: '', parts: [] };
const steps = ['Customer & vehicle', 'Requested work', 'Schedule', 'Review'];
const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const timeLabel = (value) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const fieldClass = 'input mt-1 w-full min-w-0';

export default function ServiceOrderNew() {
  const { user } = useAuth();
  return <ServiceIntake key={user?.id || 'unavailable'} user={user} />;
}

function ServiceIntake({ user }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const draftKey = `${DRAFT_KEY_PREFIX}:${user?.id || 'unavailable'}`;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => {
    try {
      const loaded = { ...initial, ...JSON.parse(localStorage.getItem(draftKey) || '{}') };
      for (const [key, value] of Object.entries(initial)) if (typeof value === 'string') loaded[key] = String(loaded[key] ?? value);
      if (!Array.isArray(loaded.parts)) loaded.parts = [];
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(loaded.intakeRequestId || '')) loaded.intakeRequestId = crypto.randomUUID();
      return loaded;
    }
    catch { return { ...initial, intakeRequestId: crypto.randomUUID() }; }
  });
  const [mechanics, setMechanics] = useState([]);
  const [slots, setSlots] = useState([]);
  const [hours, setHours] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(!!params.get('customer'));
  const [checkingIdentity, setCheckingIdentity] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveredOrder, setRecoveredOrder] = useState(null);
  const [recoveryReload, setRecoveryReload] = useState(0);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const committed = useRef(false);
  const mounted = useRef(true);
  const creating = useRef(false);
  const canProceed = !saving && !checkingIdentity && !checkingRecovery && !recoveryError && !recoveredOrder;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const partsTotal = useMemo(() => form.parts.reduce((sum, part) => sum + Number(part.lineTotal || 0), 0), [form.parts]);
  const labor = Math.max(Number(form.laborEstimate) || 0, 0);
  const total = Math.round((labor + partsTotal) * 100) / 100;

  useEffect(() => {
    const timer = window.setTimeout(() => { if (committed.current) return; try { localStorage.setItem(draftKey, JSON.stringify(form)); } catch { /* Saving is checked again before any creation request. */ } }, 250);
    return () => window.clearTimeout(timer);
  }, [form, draftKey]);

  useEffect(() => {
    let active = true;
    setCheckingRecovery(true);
    getServiceIntakeResult(form.intakeRequestId)
      .then((result) => { if (active) { setRecoveredOrder(result.orderId); setRecoveryError(''); } })
      .catch((err) => { if (active) setRecoveryError(err.message); })
      .finally(() => { if (active) setCheckingRecovery(false); });
    return () => { active = false; };
  }, [form.intakeRequestId, recoveryReload]);

  const applySavedIdentity = (selection) => {
    setForm((current) => ({ ...current, ...selection, ...(current.customerId !== selection.customerId || current.vehicleId !== selection.vehicleId ? { mechanicId: '', date: '', slotStart: '', slotEnd: '' } : {}) }));
    setPickerOpen(false); setError('');
    // A handoff is only a suggestion. Once accepted, the saved draft is the
    // source for reopening; an old link must not re-suggest a different pair.
    setParams((current) => { const next = new URLSearchParams(current); next.delete('customer'); next.delete('vehicle'); return next; }, { replace: true });
  };
  const openCreatedJob = (orderId, clearMatchingDraft = true) => {
    if (!mounted.current) return;
    committed.current = true;
    try {
      if (clearMatchingDraft && localStorage.getItem(draftKey) === JSON.stringify(form)) localStorage.removeItem(draftKey);
    } catch { /* Preserve an unverified/newer draft; its reference recovers the same job. */ }
    navigate(`/services/${orderId}`);
  };
  const startFreshIntake = () => {
    const fresh = { ...initial, intakeRequestId: crypto.randomUUID() };
    try { localStorage.setItem(draftKey, JSON.stringify(fresh)); }
    catch { setError('This browser could not replace the draft. The saved job and current draft are unchanged.'); setDiscardPrompt(false); return; }
    committed.current = false;
    setForm(fresh); setStep(0); setPickerOpen(false); setRecoveredOrder(null);
    setCheckingRecovery(true); setRecoveryError(''); setError(''); setDiscardPrompt(false);
  };

  useEffect(() => {
    if (user?.role !== ROLES.ADMIN) return;
    listMechanics({ activeOnly: true }).then(setMechanics).catch(() => setMechanics([]));
  }, [user?.role]);

  useEffect(() => {
    if (!form.date || !form.mechanicId) { setSlots([]); return undefined; }
    let active = true;
    setLoadingSlots(true);
    getServiceScheduleSlots({ date: form.date, duration: form.duration, mechanicId: form.mechanicId })
      .then((response) => { if (active) { setSlots(response.slots || []); setHours(response.hours); } })
      .catch((err) => { if (active) { setSlots([]); setError(err.message || 'Unable to load available times.'); } })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [form.date, form.duration, form.mechanicId]);

  const next = async () => {
    if (!canProceed) return;
    setError('');
    if (step === 0 && (!form.customerName.trim() || !form.vehicleModel.trim() || !form.vehiclePlate.trim())) {
      setError('Add the customer name, vehicle model, and plate number to continue.'); return;
    }
    if (step === 0 && form.customerId) {
      setCheckingIdentity(true);
      try {
        const context = await getServiceIntakeContext(form.customerId);
        const vehicle = context.vehicles.find((item) => item.id === form.vehicleId);
        if (!vehicle || !form.identityVersion || vehicle.identityVersion !== form.identityVersion) throw new Error('Saved customer or vehicle details changed. Choose the saved records again before continuing.');
        setForm((current) => ({ ...current, ...savedIntakeFields(context.customer, vehicle) }));
      } catch (err) { setError(err.message); return; }
      finally { setCheckingIdentity(false); }
    }
    if (step === 1 && (!form.description.trim() || !Number.isFinite(Number(form.laborEstimate || 0)) || Number(form.laborEstimate || 0) < 0)) {
      setError('Describe the requested work and enter a valid labor estimate.'); return;
    }
    if (step === 2 && form.mechanicId && (!form.slotStart || !slots.some((slot) => slot.start === form.slotStart && slot.available))) {
      setError('Select an available time for this mechanic, or leave scheduling for later.'); return;
    }
    setStep((value) => Math.min(value + 1, 3));
  };

  const create = async () => {
    if (creating.current || !canProceed) return;
    creating.current = true;
    setSaving(true); setError('');
    try {
      const payload = {
        intakeRequestId: form.intakeRequestId,
        ...(user?.role === ROLES.ADMIN && form.mechanicId ? { mechanicId: form.mechanicId, scheduledStart: form.slotStart, scheduledEnd: form.slotEnd } : {}),
        ...(form.customerId ? { customerId: form.customerId, vehicleId: form.vehicleId, identityVersion: form.identityVersion } : {
          customerName: form.customerName.trim(), customerPhone: form.customerPhone.trim(),
          vehicleMake: form.vehicleMake.trim(), vehicleModel: form.vehicleModel.trim(),
          vehicleYear: Number(form.vehicleYear) || null, vehiclePlate: form.vehiclePlate.trim(),
        }),
        description: form.description.trim(), estimatedCost: total, priority: form.priority, status: 'pending',
        items: [
          ...form.parts,
          ...(labor > 0 ? [{ lineType: 'service', displayName: form.description.trim().slice(0, 120), itemName: form.description.trim().slice(0, 120), itemSku: 'LABOR', quantity: 1, unitPrice: labor, lineTotal: labor }] : []),
        ],
      };
      localStorage.setItem(draftKey, JSON.stringify(form));
      const order = await createServiceOrder(payload);
      if (!mounted.current) return;
      if (!order?.id) throw new Error('The creation response was incomplete. Check the saved submission before retrying.');
      toast.success('Service order created.');
      openCreatedJob(order.id);
    } catch (err) {
      if (!mounted.current) return;
      try {
        const result = await getServiceIntakeResult(form.intakeRequestId);
        if (!mounted.current) return;
        if (result.orderId) { toast.success('Saved service order found.'); openCreatedJob(result.orderId); return; }
      } catch (recoveryFailure) { setRecoveryError(recoveryFailure.message); }
      setError(err.message || 'Unable to create this service order.');
    }
    finally { creating.current = false; setSaving(false); }
  };

  return <div className="mx-auto max-w-5xl space-y-5 pb-24">
    <button type="button" onClick={() => navigate('/services')} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-950"><ArrowLeft className="h-4 w-4" /> Service Orders</button>
    <header className="rounded-2xl border border-primary-200 bg-white p-5 shadow-sm sm:p-7"><p className="text-xs font-bold uppercase tracking-widest text-primary-500">Workshop intake</p><h1 className="mt-1 text-2xl font-bold text-primary-950 sm:text-3xl">New Service Order</h1><p className="mt-2 text-sm text-primary-600">Record the customer's concern first. A mechanic and appointment can be added now or later.</p></header>
    <nav aria-label="Intake steps" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{steps.map((label, index) => <button key={label} type="button" disabled={!canProceed} onClick={() => { if (index < step) setStep(index); }} className={`rounded-xl border px-3 py-3 text-left text-xs font-semibold sm:text-sm ${index === step ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-primary-200 bg-white text-primary-600'}`}><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-xs">{index < step ? <Check className="h-3 w-3" /> : index + 1}</span>{label}</button>)}</nav>
    <main className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm sm:p-7">
      {checkingRecovery && <p role="status" className="mb-4 text-sm text-primary-700">Checking this draft for an already-created job…</p>}
      {recoveryError && <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{recoveryError}<button type="button" className="btn mt-2 border border-amber-500" disabled={checkingRecovery} onClick={() => setRecoveryReload((value) => value + 1)}>Check submission again</button></div>}
      {recoveredOrder && <div role="status" className="mb-4 rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950">This draft reference already has a saved job. Opening it keeps this browser draft, including any later changes.<div className="mt-2 flex flex-wrap gap-2"><button type="button" className="btn border border-blue-800 bg-blue-800 text-white" onClick={() => openCreatedJob(recoveredOrder, false)}>Open created job</button><button type="button" className="btn border border-blue-300" onClick={() => setDiscardPrompt(true)}>Start a fresh intake</button></div></div>}
      {error && <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <fieldset disabled={!canProceed} className="min-w-0">
      {step === 0 && <div className="mb-5 space-y-3">
        {params.get('customer') && form.customerName && <p className="text-sm text-primary-700">Your existing intake draft is unchanged. Use selection below only if you want to replace its customer and vehicle details.</p>}
        <details open={pickerOpen} onToggle={(event) => setPickerOpen(event.currentTarget.open)} className="rounded-xl border border-primary-200 p-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-blue-900">Find a saved customer & vehicle</summary>
          <SavedCustomerIntake suggestedCustomer={params.get('customer') || form.customerId} suggestedVehicle={params.get('vehicle') || form.vehicleId} onSelect={applySavedIdentity} disabled={!canProceed} />
        </details>
        {form.customerId && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">Using saved customer and vehicle records. The fields below are read-only; details are checked again before this job is created.<button type="button" className="btn mt-2 border border-blue-300" onClick={() => setForm((current) => ({ ...current, customerId: '', vehicleId: '', identityVersion: '' }))}>Enter details instead</button></div>}
      </div>}
      {step === 0 && <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-primary-700">Customer name *<input className={fieldClass} value={form.customerName} readOnly={!!form.customerId} onChange={(e) => set('customerName', e.target.value)} /></label>
        <label className="text-sm font-semibold text-primary-700">Phone<input className={fieldClass} inputMode="tel" value={form.customerPhone} readOnly={!!form.customerId} onChange={(e) => set('customerPhone', e.target.value)} /></label>
        <label className="text-sm font-semibold text-primary-700">Vehicle make<input className={fieldClass} value={form.vehicleMake} readOnly={!!form.customerId} onChange={(e) => set('vehicleMake', e.target.value)} /></label>
        <label className="text-sm font-semibold text-primary-700">Vehicle model *<input className={fieldClass} value={form.vehicleModel} readOnly={!!form.customerId} onChange={(e) => set('vehicleModel', e.target.value)} /></label>
        <label className="text-sm font-semibold text-primary-700">Year<input className={fieldClass} type="number" min="1900" max="2100" value={form.vehicleYear} readOnly={!!form.customerId} onChange={(e) => set('vehicleYear', e.target.value)} /></label>
        <label className="text-sm font-semibold text-primary-700">Plate number *<input className={fieldClass} value={form.vehiclePlate} readOnly={!!form.customerId} onChange={(e) => set('vehiclePlate', e.target.value)} /></label>
      </div>}
      {step === 1 && <div className="space-y-5">
        <label className="block text-sm font-semibold text-primary-700">Reported concern and requested work *<textarea className={`${fieldClass} min-h-28`} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What did the customer report?" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-primary-700">Estimated labor (₱)<input className={fieldClass} type="number" min="0" step="0.01" value={form.laborEstimate} onChange={(e) => set('laborEstimate', e.target.value)} /></label><label className="text-sm font-semibold text-primary-700">Priority<select className={fieldClass} value={form.priority} onChange={(e) => set('priority', e.target.value)}>{['low','normal','high','urgent'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
        <div className="rounded-xl border border-primary-200 p-4"><h2 className="mb-3 font-semibold text-primary-950">Estimated parts (optional)</h2><p className="mb-3 text-xs text-primary-600">Estimates do not remove inventory. Record actual parts after the repair.</p><PartSearch onAdd={(part) => set('parts', [...form.parts, { ...part, draftId: crypto.randomUUID() }])} />{form.parts.map((part) => <div key={part.draftId} className="mt-2 flex items-center justify-between gap-2 border-t border-primary-100 pt-2 text-sm"><span className="min-w-0 truncate">{part.itemSku} · {part.itemName} · {part.quantity} × {formatCurrency(part.unitPrice)}</span><button type="button" aria-label={`Remove ${part.itemName}`} onClick={() => set('parts', form.parts.filter((item) => item.draftId !== part.draftId))}><Trash2 className="h-4 w-4 text-red-600" /></button></div>)}</div>
        <p className="text-right text-sm font-bold text-primary-950">Estimated total: {formatCurrency(total)}</p>
      </div>}
      {step === 2 && <div className="space-y-4"><div><h2 className="font-semibold text-primary-950">Optional appointment</h2><p className="text-sm text-primary-600">No appointment is required at intake. You can schedule after the job is assessed.</p></div>{user?.role === ROLES.ADMIN ? <>
        <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold text-primary-700">Mechanic<select className={fieldClass} value={form.mechanicId} onChange={(e) => setForm((current) => ({ ...current, mechanicId: e.target.value, slotStart: '', slotEnd: '' }))}><option value="">Assign later</option>{mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.full_name || mechanic.fullName} · {mechanic.specialization}</option>)}</select></label><label className="text-sm font-semibold text-primary-700">Date<input type="date" min={manilaToday()} className={fieldClass} value={form.date} onChange={(e) => setForm((current) => ({ ...current, date: e.target.value, slotStart: '', slotEnd: '' }))} /></label><label className="text-sm font-semibold text-primary-700">Length<select className={fieldClass} value={form.duration} onChange={(e) => setForm((current) => ({ ...current, duration: Number(e.target.value), slotStart: '', slotEnd: '' }))}>{[30,60,90,120,180,240].map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes === 60 ? '' : 's'}`}</option>)}</select></label></div>
        {form.date && <p className="text-sm text-blue-800">{hours?.closesAt?.startsWith('12') ? 'Sunday half-day: 8:00 AM–12:00 PM.' : 'Workshop hours: 8:00 AM–5:00 PM.'} All times are Philippine time.</p>}
        {loadingSlots && <p className="text-sm text-primary-600">Checking available times…</p>}
        {form.mechanicId && form.date && <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">{slots.map((slot) => <button key={slot.start} type="button" disabled={!slot.available} title={slot.reason || undefined} aria-pressed={form.slotStart === slot.start} onClick={() => setForm((current) => ({ ...current, slotStart: slot.start, slotEnd: slot.end }))} className={`min-h-11 rounded-lg border px-2 text-xs font-semibold ${form.slotStart === slot.start ? 'border-blue-700 bg-blue-700 text-white' : 'border-primary-200 bg-white text-primary-800'} disabled:opacity-40`}>{timeLabel(slot.start)}–{timeLabel(slot.end)}</button>)}</div>}
        {form.mechanicId && form.date && !loadingSlots && !slots.some((slot) => slot.available) && <p className="text-sm text-primary-700">No available schedule remains for this day. Choose another date.</p>}
      </> : <p className="rounded-lg bg-primary-50 p-3 text-sm text-primary-700">An administrator can assign the mechanic after this order is created.</p>}</div>}
      {step === 3 && <div className="space-y-4 text-sm"><h2 className="text-lg font-semibold text-primary-950">Review before creating</h2><div className="grid gap-3 sm:grid-cols-2"><p><span className="text-primary-500">Customer</span><br /><strong>{form.customerName}</strong> · {form.customerPhone || 'No phone'}</p><p><span className="text-primary-500">Vehicle</span><br /><strong>{[form.vehicleYear,form.vehicleMake,form.vehicleModel,form.vehiclePlate].filter(Boolean).join(' ')}</strong></p><p className="sm:col-span-2"><span className="text-primary-500">Requested work</span><br />{form.description}</p><p><span className="text-primary-500">Priority</span><br /><strong className="capitalize">{form.priority}</strong></p><p><span className="text-primary-500">Appointment</span><br /><strong>{form.slotStart ? `${form.date}, ${timeLabel(form.slotStart)}–${timeLabel(form.slotEnd)}` : 'Assign later'}</strong></p></div>{form.parts.length > 0 && <div className="rounded-xl border border-primary-200 p-4"><h3 className="font-semibold text-primary-950">Estimated parts</h3>{form.parts.map((part) => <p key={part.draftId} className="mt-2 text-primary-700"><strong>{part.itemSku}</strong> ({part.itemName}) · {part.quantity} × {formatCurrency(part.unitPrice)}</p>)}</div>}{labor > 0 && <p className="text-primary-700">Estimated labor: <strong>{formatCurrency(labor)}</strong></p>}<div className="rounded-xl bg-primary-950 p-4 text-white"><span>Estimated only — no stock is deducted</span><strong className="float-right">{formatCurrency(total)}</strong></div></div>}
      </fieldset>
    </main>
    <div className="sticky bottom-2 flex justify-between gap-3 rounded-xl border border-primary-200 bg-white/95 p-3 shadow-lg backdrop-blur"><button type="button" className="btn" disabled={saving || checkingIdentity} onClick={() => step ? setStep(step - 1) : navigate('/services')}><ArrowLeft className="h-4 w-4" /> Back</button>{step < 3 ? <button type="button" className="btn bg-blue-700 text-white" disabled={!canProceed} onClick={next}>Continue <ArrowRight className="h-4 w-4" /></button> : <button type="button" className="btn bg-blue-700 text-white" disabled={!canProceed} onClick={create}><Plus className="h-4 w-4" /> {saving ? 'Creating…' : 'Create service order'}</button>}</div>
    <Modal isOpen={discardPrompt} onClose={() => setDiscardPrompt(false)} title="Start a fresh intake?" size="sm"><p className="text-sm text-primary-800">The saved service order stays in the system. This clears the browser draft, including any later changes that are not in that job. Copy any unsaved work before continuing.</p><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className="btn border border-primary-300" onClick={() => setDiscardPrompt(false)}>Keep draft</button><button type="button" className="btn border border-red-700 bg-red-700 text-white" onClick={startFreshIntake}>Discard draft and start fresh</button></div></Modal>
  </div>;
}

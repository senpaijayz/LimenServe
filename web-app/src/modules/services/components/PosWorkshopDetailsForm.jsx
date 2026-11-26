import { useRef, useState } from 'react';
import { finishPosWorkshopIntake, getServiceOrder } from '../../../services/serviceOrdersApi';
import SavedCustomerIntake from './SavedCustomerIntake';

const fields = [
  ['customerName', 'Customer name', true, 200],
  ['customerPhone', 'Philippine mobile number', false, 13],
  ['vehicleMake', 'Vehicle make', true, 100],
  ['vehicleModel', 'Vehicle model', true, 100],
  ['vehiclePlate', 'Plate number', true, 20],
  ['vehicleYear', 'Vehicle year', false, 4],
];

export default function PosWorkshopDetailsForm({ orderId, onSaved }) {
  const [values, setValues] = useState({});
  const [savedIdentity, setSavedIdentity] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const submit = async (event) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const order = await finishPosWorkshopIntake(orderId, savedIdentity
        ? { customerId: savedIdentity.customerId, vehicleId: savedIdentity.vehicleId, identityVersion: savedIdentity.identityVersion }
        : values);
      if (!order?.id) throw new Error('The intake save could not be confirmed.');
      onSaved(order);
    } catch (failure) {
      try {
        const order = await getServiceOrder(orderId);
        if (order?.id && !order.posIntakePending) { onSaved(order); return; }
      } catch { /* Leave these details in place if the result cannot be checked. */ }
      setError(failure.message);
    } finally { lock.current = false; setBusy(false); }
  };
  return <section className="rounded-xl border border-amber-300 bg-white p-4 sm:p-6" aria-label="Complete workshop intake">
    <h2 className="text-lg font-bold text-primary-950">Complete customer and vehicle details</h2>
    <p className="mt-2 text-sm text-primary-800">POS saved the parts and labor below. Nothing has been charged or released. Fill in the missing details before starting the job.</p>
    <details className="mt-4">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-blue-800">Find a saved customer and vehicle</summary>
      <SavedCustomerIntake onSelect={setSavedIdentity} disabled={busy} />
    </details>
    <form className="mt-4 space-y-4" onSubmit={submit}>
      {savedIdentity ? <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950">
        <p>{savedIdentity.customerName} · {savedIdentity.vehicleModel} · {savedIdentity.vehiclePlate}</p>
        <button type="button" disabled={busy} onClick={() => setSavedIdentity(null)} className="min-h-11 font-semibold underline">Enter a new customer and vehicle instead</button>
      </div> : <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([name, label, required, maxLength]) => <label key={name} className="block text-sm font-semibold text-primary-800">
          {label}{required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
          <input className="input mt-1 w-full" required={required} maxLength={maxLength} disabled={busy}
            inputMode={name==='customerPhone' ? 'tel' : name==='vehicleYear' ? 'numeric' : undefined}
            pattern={name==='customerPhone' ? '(09[0-9]{9}|[+]?639[0-9]{9})' : name==='vehicleYear' ? '[0-9]{4}' : undefined}
            value={values[name] || ''} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} />
        </label>)}
      </div>}
      {error && <p role="alert" className="text-sm font-semibold text-red-800">{error}</p>}
      <button type="submit" disabled={busy} className="btn bg-blue-800 text-white">{busy ? 'Saving…' : 'Save intake details'}</button>
    </form>
  </section>;
}

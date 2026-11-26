import { useId, useRef, useState } from 'react';
import { finishPosWorkshopIntake, getServiceOrder } from '../../../services/serviceOrdersApi';
import SavedCustomerIntake from './SavedCustomerIntake';

const fields = [
  ['customerName', 'Customer name', true, 200],
  ['customerPhone', 'Phone Number', true, 9],
  ['vehicleMake', 'Vehicle make', true, 100],
  ['vehicleModel', 'Vehicle model', true, 100],
  ['vehiclePlate', 'Plate number', true, 20],
  ['vehicleYear', 'Vehicle year', false, 4],
];

const currentVehicleYear = () => Number(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()));
const phoneSuffix = (text) => {
  const digits = text.replace(/\D/g, '');
  if (/^09\d{9}$/.test(digits)) return digits.slice(2);
  if (/^639\d{9}$/.test(digits)) return digits.slice(3);
  return digits.slice(0, 9);
};

export default function PosWorkshopDetailsForm({ orderId, onSaved }) {
  const id = useId();
  const [values, setValues] = useState({});
  const [savedIdentity, setSavedIdentity] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const year = currentVehicleYear();
  const set = (name, value) => setValues((current) => ({ ...current, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (lock.current) return;
    if (!savedIdentity && !/^\d{9}$/.test(values.customerPhone || '')) {
      setError('Enter all nine digits after 09.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const order = await finishPosWorkshopIntake(orderId, savedIdentity
        ? { customerId: savedIdentity.customerId, vehicleId: savedIdentity.vehicleId, identityVersion: savedIdentity.identityVersion }
        : { ...values, customerPhone: `09${values.customerPhone}` });
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
        {fields.map(([name, label, required, maxLength]) => {
          const fieldId = `${id}-${name}`;
          return <div key={name} className="min-w-0">
            <label htmlFor={fieldId} className="block text-sm font-semibold text-primary-800">
              {label}{required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
            </label>
            {name === 'customerPhone' ? <>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-semibold text-primary-800" aria-hidden="true">09</span>
                <input id={fieldId} className="input w-full pl-10" type="tel" inputMode="numeric"
                  required maxLength={9} pattern="[0-9]{9}" placeholder="XXXXXXXXX" disabled={busy}
                  aria-describedby={`${fieldId}-hint`} value={values[name] || ''}
                  onChange={(event) => set(name, phoneSuffix(event.target.value))}
                  onPaste={(event) => {
                    event.preventDefault();
                    const digits = event.clipboardData.getData('text').replace(/\D/g, '');
                    if (/^(?:09\d{9}|639\d{9}|\d{9})$/.test(digits)) {
                      set(name, phoneSuffix(digits));
                    } else if (digits.length < 9) {
                      const { value, selectionStart, selectionEnd } = event.currentTarget;
                      set(name, phoneSuffix(value.slice(0, selectionStart) + digits + value.slice(selectionEnd)));
                    }
                  }} />
              </div>
              <p id={`${fieldId}-hint`} className="mt-1 text-xs text-primary-700">Enter the 9 digits after 09.</p>
            </> : name === 'vehicleYear' ? <select id={fieldId} className="input mt-1 w-full" disabled={busy}
              value={values[name] || ''} onChange={(event) => set(name, event.target.value)}>
              <option value="">Select model year (optional)</option>
              {Array.from({ length: year - 1900 + 1 }, (_, index) => year - index).map((modelYear) =>
                <option key={modelYear} value={modelYear}>{modelYear}</option>)}
            </select> : <input id={fieldId} className="input mt-1 w-full" required={required} maxLength={maxLength} disabled={busy}
              value={values[name] || ''} onChange={(event) => set(name, event.target.value)} />}
          </div>;
        })}
      </div>}
      {error && <p role="alert" className="text-sm font-semibold text-red-800">{error}</p>}
      <button type="submit" disabled={busy} className="btn bg-blue-800 text-white">{busy ? 'Saving…' : 'Save intake details'}</button>
    </form>
  </section>;
}

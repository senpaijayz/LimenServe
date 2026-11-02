import {INVOICE_FIELDS} from '../../../../../shared/invoiceDetails';

export default function InvoiceDetailsFields({value,onChange,disabled=false}) {
  const count=Object.values(value).filter(text=>text?.trim()).length;
  return <details className="rounded-xl border border-primary-300 bg-white p-4">
    <summary className="cursor-pointer text-sm font-bold text-primary-950">Additional invoice details <span className="font-normal text-primary-700">(optional{count ? ` · ${count} filled` : ''})</span></summary>
    <p className="mb-3 mt-2 text-sm text-primary-700">Fill in any details you want printed. These stay with this order.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {INVOICE_FIELDS.map(([key,label,maxLength])=><label key={key} className={`block text-sm font-semibold text-primary-900 ${key==='customerAddress'?'sm:col-span-2':''}`}>{label}
        <input value={value[key] || ''} maxLength={maxLength} disabled={disabled} onChange={e=>onChange({...value,[key]:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-primary-300 bg-white px-3 py-2 font-normal text-primary-950" />
      </label>)}
    </div>
  </details>;
}

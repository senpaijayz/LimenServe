import {formatCurrency} from '../../../utils/formatters';

export default function ManualNonCashFields({method,total,amount,onAmount,reference,onReference,disabled=false}){
  return <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-primary-950">
    <p className="font-semibold">Check the {method==='gcash'?'GCash':'bank'} account first.</p>
    <p>A reference number alone is not proof of payment. This screen records a payment you have checked; it does not transfer money.</p>
    <p>Full amount due: <strong>{formatCurrency(total)}</strong></p>
    <label className="block font-semibold">Amount received<input type="number" min="0" max="1000000000" step="0.01" value={amount} disabled={disabled} onChange={event=>onAmount(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-primary-300 bg-white p-3" /></label>
    <label className="block font-semibold">Transaction reference<input value={reference} maxLength={120} disabled={disabled} onChange={event=>onReference(event.target.value)} autoComplete="off" className="mt-1 min-h-11 w-full rounded-lg border border-primary-300 bg-white p-3" /><span className="mt-1 block text-xs font-normal text-primary-800">Use the received payment's reference, not a PIN or password.</span></label>
  </div>;
}

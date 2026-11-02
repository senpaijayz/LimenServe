import {useId,useState} from 'react';
import {Banknote,CheckCircle2,Info,Printer} from 'lucide-react';
import Button from '../../../components/ui/Button';
import {formatCurrency} from '../../../utils/formatters';
import ManualNonCashFields from './ManualNonCashFields';
import PaymentOptions from './PaymentOptions';
import {isNonCash,matchesFullPayment} from '../utils/paymentMethods';

export default function PaymentCollectionPanel({sale,onClose,onPay,onPrint,printControl}) {
  const [amount,setAmount]=useState(''),[verified,setVerified]=useState(false);
  const [method,setMethod]=useState('cash'),[reference,setReference]=useState(''),[paidAmount,setPaidAmount]=useState('');
  const cashInputId=useId();
  const total=Number(sale.totalAmount);
  const unpaid=sale.status==='pending' && sale.paymentMethod==='to_follow';
  const enough=amount.trim()!=='' && Number(amount)>=total && Number.isFinite(Number(amount)) && Number(amount)<=1000000000;
  const canRecord=unpaid && verified && (method==='cash'?enough:matchesFullPayment(paidAmount,total,reference));
  const resetVerification=()=>setVerified(false);
  return <section className="space-y-5 print:hidden" aria-label="Collect outstanding payment">
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-primary-950 p-5 text-white">
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wider text-white/80">{unpaid?'Balance to collect':'Saved order'}</p><p className="mt-2 text-3xl font-bold tabular-nums">{formatCurrency(total)}</p><p className="mt-2 break-words text-sm text-white/90">{sale.customerName || 'Customer order'}</p></div>
      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${unpaid?'border-amber-300 bg-amber-100 text-amber-950':'border-emerald-300 bg-emerald-100 text-emerald-950'}`}>{unpaid?'Awaiting payment':'Payment not required'}</span>
      {sale.transactionNumber && <p className="w-full break-all border-t border-white/20 pt-3 font-mono text-xs text-white/80">{sale.transactionNumber}</p>}
    </div>
    {unpaid ? <>
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><p><strong className="block">Stock was already deducted.</strong><span className="mt-1 block">Record the payment only. This will not deduct stock again.</span></p></div>
      <div className="space-y-5 rounded-2xl border border-primary-200 bg-white p-4 sm:p-5">
        <h3 className="font-bold text-primary-950">Payment details</h3>
        <PaymentOptions value={method} onChange={value=>{setMethod(value);resetVerification();setReference('');setPaidAmount('');}} />
        {method==='cash' ? <div className="space-y-3">
          <div className="text-sm font-semibold text-primary-950"><label htmlFor={cashInputId} className="block">Cash received</label>
            <div className="relative mt-2"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-primary-700" aria-hidden="true">₱</span><input id={cashInputId} type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" placeholder="0.00" value={amount} onChange={event=>{setAmount(event.target.value);resetVerification();}} className="min-h-14 w-full rounded-xl border border-primary-300 bg-white py-3 pl-10 pr-4 text-xl font-bold tabular-nums text-primary-950 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200" /></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={()=>{setAmount(total.toFixed(2));resetVerification();}} className="min-h-10 rounded-lg border border-primary-300 bg-primary-50 px-3 text-sm font-semibold text-primary-950 hover:border-blue-500">Use exact amount</button><p className="text-sm text-primary-800" aria-live="polite">Change <strong className="ml-2 text-primary-950">{formatCurrency(enough?Number(amount)-total:0)}</strong></p></div>
        </div> : <ManualNonCashFields method={method} total={total} amount={paidAmount} onAmount={value=>{setPaidAmount(value);resetVerification();}} reference={reference} onReference={value=>{setReference(value);resetVerification();}} />}
        <label className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm ${verified?'border-emerald-400 bg-emerald-50 text-emerald-950':'border-primary-300 bg-primary-50 text-primary-950'}`}><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-700" /><span><strong className="block">Confirm payment received</strong><span className="mt-1 block leading-relaxed">{method==='check'?'The check has cleared and the full amount reached the shop’s account.':'I have received the full cash payment from the customer.'}</span></span></label>
      </div>
    </> : <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">This order is no longer awaiting payment. Do not collect it again.</p>}
    <div className="space-y-3 border-t border-primary-200 pt-4">
      {unpaid && <p className="text-sm text-primary-700">{canRecord?'Ready to save this payment.':'Enter the full amount and confirm receipt to record payment.'}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{printControl || <Button variant="secondary" fullWidth leftIcon={<Printer className="h-4 w-4" />} onClick={onPrint}>Print order</Button>}{unpaid && <Button variant="success" fullWidth isDisabled={!canRecord} leftIcon={canRecord?<CheckCircle2 className="h-4 w-4" />:<Banknote className="h-4 w-4" />} onClick={()=>onPay({saleId:sale.id,paymentMethod:method,cashReceived:method==='cash'?Number(amount):0,paidAmount:isNonCash(method)?Number(paidAmount):0,paymentReference:isNonCash(method)?reference.trim():'',paymentVerified:verified})}>Record payment</Button>}</div>
      <Button variant="secondary" fullWidth onClick={onClose}>Close</Button>
    </div>
  </section>;
}

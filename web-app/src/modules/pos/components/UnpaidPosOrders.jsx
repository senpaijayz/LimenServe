import {useEffect,useState} from 'react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import {formatCurrency} from '../../../utils/formatters';
import {listUnpaidPosOrders} from '../../../services/posOrdersApi';
import {getPosSaleDetail} from '../../../services/posApi';
import SaleReceiptPreview from './SaleReceiptPreview';
import ManualNonCashFields from './ManualNonCashFields';
import {isNonCash,matchesFullPayment} from '../utils/paymentMethods';

function CollectPayment({id,onClose,onPay}){
  const [result,setResult]=useState(null),[error,setError]=useState(''),[amount,setAmount]=useState(''),[verified,setVerified]=useState(false);
  const [method,setMethod]=useState('cash'),[reference,setReference]=useState(''),[paidAmount,setPaidAmount]=useState('');
  useEffect(()=>{let active=true;getPosSaleDetail(id).then(data=>{if(active)setResult(data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id]);
  const unpaid=result?.sale?.status==='pending' && result.sale.paymentMethod==='to_follow';
  const enough=Number(amount)>=Number(result?.sale?.totalAmount) && Number.isFinite(Number(amount)) && Number(amount)<=1000000000;
  const canRecord=verified&&(method==='cash'?enough:matchesFullPayment(paidAmount,result?.sale?.totalAmount,reference));
  return <Modal isOpen onClose={onClose} title="Payment to follow" size="lg"><div className="space-y-4">
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : !result ? <p role="status">Loading the saved order…</p> : <>
      <SaleReceiptPreview receipt={result.receipt} printId="unpaid-pos-order" />
      <div className="print:hidden">{!unpaid ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">This order is no longer awaiting payment. Do not collect it again.</p> : <>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">The parts were already released and stock deducted. Record the full payment below; stock will not be deducted again.</p>
        <label className="block text-sm font-semibold text-primary-900">Payment method<select value={method} onChange={event=>{setMethod(event.target.value);setVerified(false);setReference('');setPaidAmount('');}} className="mt-1 min-h-11 w-full rounded-lg border border-primary-300 bg-white p-3"><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank_transfer">Bank transfer</option></select></label>
        {method==='cash'?<label className="block text-sm font-semibold text-primary-900">Cash received<input type="number" min="0" max="1000000000" step="0.01" value={amount} onChange={event=>{setAmount(event.target.value);setVerified(false);}} className="mt-1 min-h-11 w-full rounded-lg border border-primary-300 p-3" /></label>:<ManualNonCashFields method={method} total={result.sale.totalAmount} amount={paidAmount} onAmount={value=>{setPaidAmount(value);setVerified(false);}} reference={reference} onReference={value=>{setReference(value);setVerified(false);}} />}
        <label className="flex items-start gap-3 text-sm text-primary-900"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />I checked and confirm the full payment for this order has been received.</label>
        <Button isDisabled={!canRecord} onClick={()=>{onClose();void onPay({saleId:id,paymentMethod:method,cashReceived:method==='cash'?Number(amount):0,paidAmount:isNonCash(method)?Number(paidAmount):0,paymentReference:isNonCash(method)?reference.trim():'',paymentVerified:verified});}}>Record payment</Button>
      </>}<Button variant="secondary" onClick={()=>window.print()}>Print order</Button></div>
    </>}
    <div className="print:hidden"><Button variant="secondary" onClick={onClose}>Close</Button></div>
  </div></Modal>;
}
export default function UnpaidPosOrders({refreshKey,onPay}){
  const [page,setPage]=useState(1),[retry,setRetry]=useState(0),[selected,setSelected]=useState(null),[result,setResult]=useState({key:'',data:null,error:''});
  const key=JSON.stringify([page,retry,refreshKey]),current=result.key===key?result:null;
  useEffect(()=>{const controller=new AbortController();listUnpaidPosOrders(page,controller.signal).then(data=>{
    const p=data?.pagination;
    if(!Array.isArray(data?.orders)||!Number.isSafeInteger(p?.totalCount)||p.totalCount<0||!Number.isSafeInteger(p.page)||p.page<1
      ||p.pageSize!==8||p.totalPages!==Math.max(1,Math.ceil(p.totalCount/8))||p.page>p.totalPages
      ||data.orders.length!==Math.min(8,Math.max(0,p.totalCount-(p.page-1)*8))
      ||!data.orders.every(row=>typeof row.id==='string'&&typeof row.transaction_number==='string'&&typeof row.customer_name_snapshot==='string'&&Number.isFinite(Number(row.total_amount))&&Number(row.total_amount)>0))throw Error('The unpaid order list could not be confirmed.');
    if(controller.signal.aborted)return;if(data.pagination.page!==page){setPage(data.pagination.page);return;}setResult({key,data,error:''});
  }).catch(error=>{if(!controller.signal.aborted)setResult({key,data:null,error:error.message});});return()=>controller.abort();},[page,key]);
  return <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 sm:p-4">
    <details><summary className="min-h-11 cursor-pointer font-semibold text-primary-950">Payments to follow {current?.data && `(${current.data.pagination.totalCount})`}</summary>
      <p className="mt-2 text-sm text-primary-800">Unpaid POS orders with parts already released.</p>
      {!current ? <p role="status" className="py-3 text-sm">Loading unpaid orders…</p> : current.error ? <p role="alert" className="py-3 text-sm text-red-800">{current.error}</p> : !current.data.orders.length ? <p className="py-3 text-sm text-primary-700">No unpaid POS orders.</p> : <ul className="mt-2 divide-y divide-amber-200">{current.data.orders.map(order=><li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0 flex-1 text-sm"><strong className="break-words text-primary-950">{order.customer_name_snapshot}</strong><p className="font-mono text-xs text-primary-700">{order.transaction_number}</p><p className="mt-1 whitespace-pre-wrap break-words text-primary-800">{order.pos_note}</p><p className="font-semibold text-amber-900">Due {formatCurrency(order.total_amount)}</p></div><Button variant="secondary" onClick={()=>setSelected(order.id)}>View / record payment</Button></li>)}</ul>}
      <div className="mt-2 flex flex-wrap items-center gap-2"><Button variant="secondary" isDisabled={!current || !current.data || page<=1} onClick={()=>setPage(v=>v-1)}>Previous</Button><span className="text-xs">{current?.data?`${page} / ${current.data.pagination.totalPages}`:'—'}</span><Button variant="secondary" isDisabled={!current || !current.data || page>=current.data.pagination.totalPages} onClick={()=>setPage(v=>v+1)}>Next</Button><Button variant="secondary" isDisabled={!current} onClick={()=>setRetry(v=>v+1)}>Refresh</Button></div>
    </details>
    {selected && <CollectPayment key={selected} id={selected} onClose={()=>setSelected(null)} onPay={onPay} />}
  </section>;
}

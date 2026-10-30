import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {getQuotePosContext} from '../../../services/posOrdersApi';
import {getPosSaleDetail} from '../../../services/posApi';
import {formatCurrency} from '../../../utils/formatters';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import SaleReceiptPreview from './SaleReceiptPreview';

export default function QuotePosCheckout({estimateId,refreshKey,posting,onLeave}){
  const [retry,setRetry]=useState(0),[result,setResult]=useState({key:'',quote:null,error:''});
  const [method,setMethod]=useState('cash'),[amount,setAmount]=useState(''),[note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [document,setDocument]=useState(null),[documentError,setDocumentError]=useState('');
  const key=JSON.stringify([estimateId,refreshKey,retry]);const current=result.key===key?result:null;
  useEffect(()=>{const controller=new AbortController();getQuotePosContext(estimateId,controller.signal).then(({quote})=>{
    if(quote?.id!==estimateId || !Array.isArray(quote.items)||typeof quote.version!=='string'||typeof quote.ready!=='boolean')throw Error('This quotation could not be confirmed.');
    if(!controller.signal.aborted){setResult({key,quote,error:''});setConfirmed(false);}
  }).catch(error=>{if(!controller.signal.aborted)setResult({key,quote:null,error:error.message});});return()=>controller.abort();},[estimateId,key]);
  const quote=current?.quote,busy=posting.busy || Boolean(posting.pending);
  const canPay=quote?.ready && confirmed && !busy && (method==='cash'?Number.isFinite(Number(amount))&&Number(amount)>=Number(quote.totalAmount):Boolean(note.trim())&&Number(quote.totalAmount)>0);
  return <section className="min-w-0 space-y-4 rounded-2xl border border-blue-200 bg-white p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold text-primary-950">Saved quotation checkout</h1><p className="mt-1 text-sm text-primary-700">This order uses saved quotation prices. Your regular POS cart stays unchanged.</p></div><Button variant="secondary" isDisabled={busy} onClick={onLeave}>Back to regular POS</Button></header>
    {!current?<p role="status">Checking the saved quotation…</p>:current.error?<p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{current.error}</p>:<>
      <div className="rounded-xl border border-primary-200 bg-primary-50 p-4"><p className="font-mono text-sm font-semibold text-primary-950">{quote.number}</p><p className="mt-1 text-primary-900">{quote.customerName}</p><p className="mt-1 text-sm text-primary-700">{quote.status} · Valid until {quote.validUntil?String(quote.validUntil).slice(0,10):'not specified'}</p></div>
      {quote.reason && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{quote.reason}</p>}
      {quote.serviceOrderId&&<Link to={`/services/${encodeURIComponent(quote.serviceOrderId)}`} className="inline-flex min-h-11 items-center rounded-lg border border-primary-300 px-3 text-sm font-semibold text-blue-900">Open existing service order</Link>}
      <ul className="max-h-80 divide-y divide-primary-200 overflow-y-auto rounded-xl border border-primary-200 px-3">{quote.items.map(item=><li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0 flex-1"><strong className="break-all text-primary-950">{item.sku}</strong><p className="break-words text-primary-800">{item.name}</p><p className="text-primary-700">Qty {item.quantity} · {formatCurrency(item.unitPrice)} each</p></div><strong>{formatCurrency(item.lineTotal)}</strong></li>)}</ul>
      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-primary-50 p-4 text-sm"><dt>Saved subtotal</dt><dd className="text-right">{formatCurrency(quote.subtotal)}</dd><dt>Saved discount</dt><dd className="text-right">{formatCurrency(quote.discountTotal)}</dd><dt>Saved VAT</dt><dd className="text-right">{formatCurrency(quote.taxTotal)}</dd><dt className="font-bold">Total due</dt><dd className="text-right text-lg font-bold">{formatCurrency(quote.totalAmount)}</dd></dl>
      {quote.ready && <div className="space-y-4 rounded-xl border border-primary-300 p-4">
        <label className="block text-sm font-semibold">Payment<select value={method} disabled={busy} onChange={e=>{setMethod(e.target.value);setConfirmed(false);}} className="mt-1 min-h-11 w-full rounded-lg border border-primary-300 bg-white p-3"><option value="cash">Cash — pay now</option><option value="to_follow">Payment to follow — release now</option></select></label>
        {method==='cash'&&<label className="block text-sm font-semibold">Cash received<input type="number" min="0" max="1000000000" step="0.01" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-primary-300 p-3" /></label>}
        <label className="block text-sm font-semibold">Order note {method==='to_follow'?'(required)':'(optional)'}<textarea value={note} maxLength={1000} disabled={busy} onChange={e=>setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-primary-300 p-3" /></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />{method==='cash'?'I confirm the cash has been received and these saved quotation terms are approved.':'I confirm this unpaid order is being released now. Part stock will be deducted immediately.'}</label>
        <Button isDisabled={!canPay} onClick={()=>posting.submit('quote_checkout',{estimateId,version:quote.version,paymentMethod:method,cashReceived:method==='cash'?Number(amount):0,note:note.trim(),paymentVerified:method==='cash'&&confirmed,releaseConfirmed:method==='to_follow'&&confirmed})}>{method==='cash'?'Record payment · release order':'Release order · payment to follow'}</Button>
      </div>}
      {quote.saleId&&<Button variant="secondary" onClick={async()=>{try{setDocumentError('');setDocument(await getPosSaleDetail(quote.saleId));}catch(error){setDocumentError(error.message);}}}>View existing POS order</Button>}
    </>}
    {posting.error&&!posting.pending&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{posting.error}</p>}
    {documentError&&<p role="alert" className="text-sm text-red-800">{documentError}</p>}
    <Button variant="secondary" isDisabled={busy||!current} onClick={()=>setRetry(v=>v+1)}>Reload saved quotation</Button>
    {document&&<Modal isOpen onClose={()=>setDocument(null)} title="Saved POS order" size="lg"><SaleReceiptPreview receipt={document.receipt} /><div className="mt-3 flex gap-2 print:hidden"><Button variant="secondary" onClick={()=>setDocument(null)}>Close</Button><Button onClick={()=>window.print()}>Print order</Button></div></Modal>}
  </section>;
}

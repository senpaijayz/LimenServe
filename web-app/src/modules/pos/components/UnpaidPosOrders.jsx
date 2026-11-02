import {useEffect,useState} from 'react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import {formatCurrency} from '../../../utils/formatters';
import {listUnpaidPosOrders} from '../../../services/posOrdersApi';
import {getPosSaleDetail} from '../../../services/posApi';
import SaleReceiptPreview from './SaleReceiptPreview';
import InvoicePrintButton from './InvoicePrintButton';
import PaymentCollectionPanel from './PaymentCollectionPanel';

function CollectPayment({id,onClose,onPay}){
  const [result,setResult]=useState(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;getPosSaleDetail(id).then(data=>{if(active)setResult(data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id]);
  return <Modal isOpen onClose={onClose} title="Collect payment" size="lg"><div className="space-y-6">
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : !result ? <p role="status">Loading the saved order…</p> : <>
      <PaymentCollectionPanel sale={{...result.sale,id}} onClose={onClose} printControl={<InvoicePrintButton receipt={result.receipt} variant="secondary" fullWidth />} onPay={payload=>{onClose();void onPay(payload);}} />
      <div>
        <p className="mb-3 border-t border-primary-200 pt-5 text-sm font-semibold text-primary-800 print:hidden">Order document</p>
        <SaleReceiptPreview receipt={result.receipt} printId="unpaid-pos-order" />
      </div>
    </>}
    {(!result || error) && <div className="print:hidden"><Button variant="secondary" fullWidth onClick={onClose}>Close</Button></div>}
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
  return <section className="rounded-xl border border-primary-200 bg-white px-4 py-2">
    <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-primary-800">Payments to follow {current?.data && <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">{current.data.pagination.totalCount}</span>}</summary>
      <p className="mt-2 text-sm text-primary-800">Unpaid POS orders with parts already released.</p>
      {!current ? <p role="status" className="py-3 text-sm">Loading unpaid orders…</p> : current.error ? <p role="alert" className="py-3 text-sm text-red-800">{current.error}</p> : !current.data.orders.length ? <p className="py-3 text-sm text-primary-700">No unpaid POS orders.</p> : <ul className="mt-2 divide-y divide-amber-200">{current.data.orders.map(order=><li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0 flex-1 text-sm"><strong className="break-words text-primary-950">{order.customer_name_snapshot}</strong><p className="font-mono text-xs text-primary-700">{order.transaction_number}</p><p className="mt-1 whitespace-pre-wrap break-words text-primary-800">{order.pos_note}</p><p className="font-semibold text-amber-900">Due {formatCurrency(order.total_amount)}</p></div><Button variant="secondary" onClick={()=>setSelected(order.id)}>View / record payment</Button></li>)}</ul>}
      <div className="mt-2 flex flex-wrap items-center gap-2"><Button variant="secondary" isDisabled={!current || !current.data || page<=1} onClick={()=>setPage(v=>v-1)}>Previous</Button><span className="text-xs">{current?.data?`${page} / ${current.data.pagination.totalPages}`:'—'}</span><Button variant="secondary" isDisabled={!current || !current.data || page>=current.data.pagination.totalPages} onClick={()=>setPage(v=>v+1)}>Next</Button><Button variant="secondary" isDisabled={!current} onClick={()=>setRetry(v=>v+1)}>Refresh</Button></div>
    </details>
    {selected && <CollectPayment key={selected} id={selected} onClose={()=>setSelected(null)} onPay={onPay} />}
  </section>;
}

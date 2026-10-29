import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getServiceOrder } from '../../../services/serviceOrdersApi';
import { formatCurrency } from '../../../utils/formatters';
import { getServiceOperationalStage } from '../utils/serviceOrderDisplay';
import ServiceStageBadge from '../components/ServiceStageBadge';
import { PriorityBadge } from '../components/ServiceOrderModals';
import ServiceWorkPanel from '../components/ServiceWorkPanel';
import ServiceAssignmentPanel from '../components/ServiceAssignmentPanel';

const sections = [['overview','Overview'],['schedule','Mechanic & schedule'],['work','Work progress'],['charges','Parts & labor'],['billing','Billing & receipt'],['history','History']];
const dateLabel = (value) => value ? new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'}) : 'Not scheduled';
const panel = 'rounded-xl border border-primary-200 bg-white p-4 sm:p-6';

export default function ServiceOrderDetails() {
  const { orderId } = useParams();
  return <JobWorkspace key={orderId} orderId={orderId} />;
}

function JobWorkspace({ orderId }) {
  const [order,setOrder] = useState(null);
  const [work,setWork] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [retry,setRetry] = useState(0);
  const [section,setSection] = useState('overview');
  const [assignmentVersion,setAssignmentVersion] = useState(0);
  const workChanged = useCallback((value) => setWork(value),[]);
  const assignmentChanged = useCallback((value) => {setOrder(value);setAssignmentVersion((version)=>version+1);},[]);
  useEffect(() => {
    let active = true;
    getServiceOrder(orderId).then((value) => { if(active) {setOrder(value); if(!value) setError('This service order was not found. Return to the service queue.');} })
      .catch((err) => {if(active) setError(err.message || 'The job could not load. Retry or return to the service queue.');})
      .finally(() => {if(active) setLoading(false);});
    return () => { active = false; };
  },[orderId,retry]);
  const stage = getServiceOperationalStage(order,work);
  const nextSection = order?.status === 'completed' || order?.status === 'cancelled' ? 'history'
    : (work?.state?.stage ?? order?.workStage) === 'work_completed' ? 'billing'
    : !order?.assignedMechanic ? 'schedule' : 'work';
  const nextLabel = {billing:'Review final bill',schedule:'Review mechanic assignment',history:'View job history',work:'Open work progress'}[nextSection];
  return <div className="mx-auto max-w-6xl space-y-4 pb-12">
    <Link to="/services" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-800">← Service Orders</Link>
    {loading && <p role="status" className={panel}>Loading service order…</p>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{error}<button type="button" onClick={()=>{setLoading(true);setError('');setRetry((value)=>value+1);}} className="ml-3 min-h-11 font-bold underline">Retry</button></div>}
    {!loading && order && <>
      <header className={panel}>
        {order.customerId && <Link to={`/customers/${order.customerId}${order.vehicleId ? `?vehicle=${order.vehicleId}` : ''}`} className="mb-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-800 underline">Customer & vehicle history →</Link>}
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="break-all font-mono text-xs font-semibold text-primary-700">{order.orderNumber || order.id}</p><h1 className="mt-2 break-words text-2xl font-bold text-primary-950">{order.customerName || 'Customer service order'}</h1><p className="mt-1 text-sm text-primary-800">{[order.vehicle?.year,order.vehicle?.make,order.vehicle?.model].filter(Boolean).join(' ')} · {order.vehicle?.plate || 'Plate not recorded'}</p></div><div className="flex flex-wrap gap-2"><ServiceStageBadge order={order} work={work} /><PriorityBadge priority={order.priority} /></div></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4"><p className="text-sm text-primary-700">{stage.nextAction}</p><button type="button" onClick={()=>setSection(nextSection)} className="min-h-11 rounded-xl bg-blue-800 px-4 text-sm font-semibold text-white hover:bg-blue-900">{nextLabel}</button></div>
      </header>
      <nav aria-label="Job workspace sections" className="rounded-xl border border-primary-200 bg-white p-2">
        <label htmlFor="job-section" className="sr-only">Job section</label><select id="job-section" className="input w-full sm:hidden" value={section} onChange={(event)=>setSection(event.target.value)}>{sections.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
        <div className="hidden flex-wrap gap-1 sm:flex">{sections.map(([id,label])=><button key={id} type="button" aria-pressed={section===id} onClick={()=>setSection(id)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${section===id?'bg-primary-950 text-white':'text-primary-800 hover:bg-primary-100'}`}>{label}</button>)}</div>
      </nav>
      <section hidden={section!=='overview'} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><div className={panel}><h2 className="font-bold text-primary-950">Customer & vehicle</h2><p className="mt-2 text-sm text-primary-800">{order.customerPhone || 'No contact number recorded'}</p><p className="mt-2 text-sm text-primary-800">Mechanic: {order.assignedMechanic?.name || 'Not assigned'}</p><p className="mt-2 text-sm text-primary-800">Appointment: {dateLabel(order.scheduledStart)}{order.scheduledEnd ? ` – ${dateLabel(order.scheduledEnd)}` : ''}</p><p className="mt-2 text-xs text-primary-700">Appointment times are Philippine time.</p></div><div className={panel}><h2 className="font-bold text-primary-950">Recorded order amount</h2><p className="mt-2 text-2xl font-bold text-primary-950">{formatCurrency(order.estimatedCost ?? order.totalAmount ?? order.total_amount ?? 0)}</p><p className="mt-2 text-sm text-primary-700">This amount is not proof of payment. Review actual charges and the posted receipt in their own sections.</p></div></div>
        <div className={panel}><h2 className="font-bold text-primary-950">Requested work</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-primary-800">{order.description || order.note || 'No requested work recorded.'}</p></div>
        <div className={panel}><h2 className="font-bold text-primary-950">Estimated parts & labor at intake</h2><p className="mt-1 text-sm text-primary-700">Estimates do not deduct stock. Record what was actually used under Parts & labor.</p>{!(order.items || []).length && <p className="mt-3 text-sm text-primary-700">No itemized intake estimate was recorded.</p>}<ul className="mt-3 divide-y divide-primary-100">{(order.items || []).map((item,index)=><li key={item.id || index} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><div className="min-w-0"><strong className="break-words text-primary-950">{item.itemSku || item.sku || (item.lineType==='service'?'Labor':'Part')}</strong><p className="break-words text-primary-800">{item.displayName || item.itemName}</p></div><span className="text-primary-800">{item.quantity} × {formatCurrency(item.unitPrice)} · {formatCurrency(item.lineTotal)}</span></li>)}</ul></div>
      </section>
      <div hidden={section!=='schedule'}><ServiceAssignmentPanel key={order.id} order={order} onOrderUpdated={assignmentChanged} /></div>
      <ServiceWorkPanel key={order.id} order={order} onOrderUpdated={setOrder} onWorkChanged={workChanged} activeSection={section} assignmentVersion={assignmentVersion} />
    </>}
  </div>;
}

import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {useAuth} from '../../../context/useAuth';
import {getServiceAttentionPage,SERVICE_ATTENTION_KINDS} from '../../../services/serviceAttentionApi';

const control='min-h-11 rounded-lg border border-primary-300 bg-white px-3 text-sm font-semibold text-primary-900 disabled:opacity-40';
const actions={
  awaiting_payment:'Check the final charges and confirm payment before releasing the vehicle.',
  overdue:'Check the job and update its work or appointment.',
  awaiting_assignment:'Ask an administrator to assign a mechanic and appointment.',
  release_review:'Open the saved payment and check whether the vehicle can be released.',
  payment_review:'Check the existing payment record. Do not collect or mark paid without confirming what happened.',
};
export default function ServiceAttentionList({refreshKey=0,managed=false,snapshot=null,snapshotLoading=false,snapshotError='',onSnapshotRetry}){
  const {user}=useAuth();
  const [page,setPage]=useState(1),[kind,setKind]=useState('all'),[retry,setRetry]=useState(0);
  const [result,setResult]=useState({key:'',data:null,error:''});
  const allowed=['admin','cashier'].includes(user?.role);
  const fromParent=managed&&page===1&&kind==='all'&&retry===0;
  const key=JSON.stringify([user?.id,user?.role,page,kind,retry,refreshKey]);
  const current=fromParent?(snapshotLoading?null:{data:snapshot,error:snapshotError||(!snapshot?'The job list could not be confirmed.':'')}):(result.key===key?result:null);
  const data=current?.data,loading=!current;
  useEffect(()=>{
    if(!allowed||fromParent)return;
    const controller=new AbortController();
    getServiceAttentionPage({page,kind},controller.signal).then(data=>{
      if(controller.signal.aborted)return;
      if(data.pagination.page!==page){setPage(data.pagination.page);setRetry(value=>value+1);return;}
      setResult({key,data,error:''});
    }).catch(error=>{if(!controller.signal.aborted)setResult({key,data:null,error:error.message||'Jobs needing attention could not load.'});});
    return()=>controller.abort();
  },[allowed,fromParent,page,kind,key]);
  if(!allowed)return null;
  const refresh=()=>fromParent&&onSnapshotRetry?onSnapshotRetry():setRetry(value=>value+1);
  return <section className="min-w-0 rounded-xl border border-primary-200 bg-white p-4 sm:p-5" aria-label="Jobs needing attention">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-primary-950">Jobs needing attention {data&&<span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-sm text-amber-950">{data.pagination.totalCount}</span>}</h2><p className="mt-1 text-sm text-primary-700">Open a job to see what needs doing.</p></div><button type="button" className={control} disabled={loading} onClick={refresh}>Refresh jobs</button></header>
    {loading&&<p role="status" className="mt-3 text-sm text-primary-700">Checking saved jobs…</p>}
    {current?.error&&<p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{current.error}</p>}
    <details className="mt-3 rounded-lg border border-primary-200">
      <summary className="min-h-11 cursor-pointer rounded-lg px-3 py-3 text-sm font-semibold text-primary-950">Review jobs</summary>
      <div className="space-y-3 border-t border-primary-200 p-3">
        <label className="block text-sm font-semibold text-primary-900">Show<select value={kind} onChange={event=>{setKind(event.target.value);setPage(1);setRetry(value=>value+1);}} className={control+' mt-1 w-full'}>{Object.entries(SERVICE_ATTENTION_KINDS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        {data&&<><p className="text-xs text-primary-700">{data.pagination.totalCount===0?'No jobs match this check.':'Showing '+((page-1)*6+1)+'–'+Math.min(page*6,data.pagination.totalCount)+' of '+data.pagination.totalCount+' jobs.'} A job appears once in each list.</p>
          <ul className="divide-y divide-primary-200">{data.items.map(order=><li key={order.id}><Link to={'/services/'+encodeURIComponent(order.id)} className="block min-h-11 rounded-lg py-3 text-sm hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"><strong className="block break-words font-mono text-primary-950">{order.number}</strong><span className="mt-1 block break-words font-semibold text-primary-900">{order.customerName||'Customer not recorded'}</span><span className="mt-1 block font-semibold text-amber-900">{SERVICE_ATTENTION_KINDS[order.kind]}</span><span className="mt-1 block text-primary-700">{order.kind==='awaiting_assignment'&&user.role==='admin'?'Assign a mechanic and appointment.':actions[order.kind]}</span></Link></li>)}</ul>
        </>}
        {!data&&<p className="text-sm text-primary-700">{loading?'Loading this job page…':'Refresh the list to check saved jobs.'}</p>}
        <nav aria-label="Job attention pages" className="flex items-center justify-between gap-2"><button type="button" className={control} disabled={loading||!data||page<=1} onClick={()=>{setPage(value=>value-1);setRetry(value=>value+1);}}>Previous</button><span className="text-xs text-primary-700">{data?page+' / '+data.pagination.totalPages:'—'}</span><button type="button" className={control} disabled={loading||!data||page>=data.pagination.totalPages} onClick={()=>{setPage(value=>value+1);setRetry(value=>value+1);}}>Next</button></nav>
      </div>
    </details>
    {data&&<p className="mt-3 text-xs text-primary-700">Checked {new Date(data.checkedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</p>}
    <Link to="/services" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-blue-800 underline">Open service queue</Link>
  </section>;
}

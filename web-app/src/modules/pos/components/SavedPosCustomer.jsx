import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {findCustomers} from '../../../services/customerHistoryApi';

const control='min-h-11 rounded-lg border border-primary-300 bg-white px-3 text-sm font-semibold text-primary-900 disabled:opacity-40';
export default function SavedPosCustomer({owner,selected,onSelect,onClear,disabled}){
  const [query,setQuery]=useState(''),[page,setPage]=useState(1),[retry,setRetry]=useState(0),[result,setResult]=useState({key:'',data:null,error:''});
  const q=query.trim(),key=JSON.stringify([owner,q,page,retry]),current=result.key===key?result:null;
  useEffect(()=>{
    if(selected||q.length<2)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{findCustomers({q,page},controller.signal).then(data=>{
      if(controller.signal.aborted)return;
      if(!Array.isArray(data?.items)||!Number.isSafeInteger(data.total)||data.total<0||data.items.length>24
        ||data.items.some(item=>!item||typeof item.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
          ||(item.name!==null&&typeof item.name!=='string')||(item.phone!==null&&typeof item.phone!=='string'))
        ||new Set(data.items.map(item=>item.id)).size!==data.items.length)throw Error('The customer results could not be confirmed.');
      const last=Math.max(1,Math.ceil(data.total/24));
      if(page>last){setPage(last);return;}
      if(data.items.length!==Math.min(24,Math.max(0,data.total-(page-1)*24)))throw Error('The customer page is incomplete. Please retry.');
      setResult({key,data,error:''});
    }).catch(error=>{if(!controller.signal.aborted)setResult({key,data:null,error:error.message});});},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[selected,q,page,key]);
  if(selected)return <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-primary-900"><p className="font-semibold">Linked to saved customer</p><p className="break-words">{selected.name}</p>{selected.phone&&<p>{selected.phone}</p>}<p className="mt-1 break-all font-mono text-xs">{selected.id}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={disabled} className={control} onClick={onClear}>Change customer</button>{!disabled&&<Link className={control+' inline-flex items-center'} to={`/customers/${encodeURIComponent(selected.id)}`}>View history</Link>}</div></div>;
  return <details className="mt-2 rounded-lg border border-primary-200">
    <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-blue-900">Use a saved customer</summary>
    <fieldset disabled={disabled} className="space-y-3 border-t border-primary-200 p-3"><p className="text-xs text-primary-800">Choose the correct record to keep this order in the customer's history. Similar names stay separate.</p><label className="block text-sm font-semibold text-primary-900">Search name, phone or plate<input value={query} maxLength={120} onChange={event=>{setQuery(event.target.value);setPage(1);}} className="mt-1 min-h-11 w-full rounded-lg border border-primary-300 bg-white px-3" /></label>
      {q.length>=2&&(!current?<p role="status" className="text-sm">Finding saved customers…</p>:current.error?<p role="alert" className="text-sm text-red-800">{current.error}<button type="button" className={control+' mt-2'} onClick={()=>setRetry(value=>value+1)}>Retry search</button></p>:<><p className="text-xs text-primary-700">{current.data.total} matching records</p><ul className="max-h-52 space-y-2 overflow-y-auto">{current.data.items.map(customer=><li key={customer.id}><button type="button" className={control+' w-full p-3 text-left'} disabled={!customer.name?.trim()} onClick={()=>{onSelect({id:customer.id,name:customer.name,phone:customer.phone});setQuery('');setPage(1);setResult({key:'',data:null,error:''});}}><strong className="block break-words">{customer.name||'Name not recorded'}</strong><span className="block font-normal">{customer.phone||'Phone not recorded'}</span><span className="mt-1 block break-all font-mono text-xs font-normal">{customer.id}</span></button></li>)}</ul>{!current.data.total&&<p className="text-sm">No saved customer found. You can still enter a walk-in name.</p>}<nav aria-label="Saved customer pages" className="flex items-center justify-between gap-2"><button type="button" className={control} disabled={page<=1} onClick={()=>setPage(value=>value-1)}>Previous</button><span className="text-xs">{page} / {Math.max(1,Math.ceil(current.data.total/24))}</span><button type="button" className={control} disabled={page>=Math.max(1,Math.ceil(current.data.total/24))} onClick={()=>setPage(value=>value+1)}>Next</button></nav></>)}
    </fieldset>
  </details>;
}

import {useEffect,useRef,useState} from 'react';
import {recoverPosOrder,settlePosOrder,submitPosOrder,submitQuotePosOrder} from '../../../services/posOrdersApi';

const storageKey=owner=>`limen-pos-request:v1:${owner}`;
const ownerKey='limen-pos-request-owner:v1';
const read=owner=>{
  try{const holder=sessionStorage.getItem(ownerKey);if(holder && holder!==owner && sessionStorage.getItem(storageKey(holder)))return {blocked:true};
    const text=sessionStorage.getItem(storageKey(owner));if(!text)return null;const op=JSON.parse(text);
    return op.owner===owner && op.id && ['checkout','settlement','quote_checkout'].includes(op.kind) && op.payload ? op : {blocked:true};
  }catch{return {blocked:true};}
};
export default function usePosPosting(owner,onSaved,onRejected){
  const [pending,setPending]=useState(()=>read(owner)),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false),active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const finish=(result,op)=>{
    if(!result?.saleId || !['pending','completed'].includes(result.status))throw new Error('The saved POS result could not be confirmed. Check it before trying another transaction.');
    if(!active.current)return;
    try{if(onSaved(result,op)===false){setPending(op);setError(`Order ${result.transactionNumber || result.saleId} is saved, but its cart could not be cleared. Keep this reference and check the saved result before another checkout.`);return;}}
    catch{setPending(op);setError(`Order ${result.transactionNumber || result.saleId} was saved. Check its result before another checkout.`);return;}
    try{if(read(owner)?.id===op.id)sessionStorage.removeItem(storageKey(owner));if(sessionStorage.getItem(ownerKey)===owner)sessionStorage.removeItem(ownerKey);}
    catch{setPending(op);setError(`Order ${result.transactionNumber || result.saleId} was saved, but this tab could not clear its recovery reference. Do not start another checkout; check the saved result.`);return;}
    setPending(null);setError('');
  };
  const send=async op=>{
    if(lock.current || !op || op.blocked)return;
    lock.current=true;setBusy(true);setError('');
    try{
      sessionStorage.setItem(ownerKey,owner);
      const result=await (op.kind==='checkout'?submitPosOrder:op.kind==='quote_checkout'?submitQuotePosOrder:settlePosOrder)({...op.payload,requestId:op.id});
      finish(result,op);
    }catch(error){
      if(!active.current)return;
      if(error.definitive){
        try{if(read(owner)?.id===op.id)sessionStorage.removeItem(storageKey(owner));if(sessionStorage.getItem(ownerKey)===owner)sessionStorage.removeItem(ownerKey);setPending(null);onRejected?.(op,error);}catch{/* Retain the original request if local cleanup fails. */}
      }
      setError(error.message || 'The result is not confirmed. Check the saved result or retry this same request.');
    }finally{lock.current=false;if(active.current)setBusy(false);}
  };
  return {pending,busy,error,async submit(kind,payload){
    if(lock.current)return;
    const retained=read(owner);
    if(retained){setPending(retained);setError('Resolve the previous POS request before starting another one.');return;}
    const op={id:crypto.randomUUID(),owner,kind,payload};
    try{sessionStorage.setItem(storageKey(owner),JSON.stringify(op));sessionStorage.setItem(ownerKey,owner);}catch{setPending(read(owner));setError('Allow this tab to save its checkout reference before releasing stock or recording payment.');return;}
    setPending(op);await send(op);
  },retry:()=>send(pending),async check(){
    if(lock.current || !pending || pending.blocked)return;
    lock.current=true;setBusy(true);setError('');
    try{const {result}=await recoverPosOrder(pending.id);if(result)finish(result,pending);else setError('No saved result was found yet. Retry this same request; do not create a new checkout.');}
    catch(error){if(active.current)setError(error.message || 'The saved result could not be checked.');}
    finally{lock.current=false;if(active.current)setBusy(false);}
  }};
}

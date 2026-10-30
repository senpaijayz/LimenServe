import { useEffect, useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { getPackageDraftReview } from '../../../services/packageDraftReviewsApi';
import SavedPackagePreview from './SavedPackagePreview';

export default function LinkedDraftPreview({packageId,owner,onClose}) {
  const [retry,setRetry]=useState(0);
  const [result,setResult]=useState({key:'',data:null,error:''});
  const key=JSON.stringify([packageId,owner,retry]);
  const current=result.key===key ? result : null;
  useEffect(()=>{
    const controller=new AbortController();
    getPackageDraftReview(packageId,controller.signal).then(pkg=>{
      if(!controller.signal.aborted)setResult({key,data:{id:pkg.id,expectedRevision:pkg.expectedRevision,source:'draft',owner},error:''});
    }).catch(error=>{
      if(!controller.signal.aborted)setResult({key,data:null,error:error.message || 'The saved draft could not load.'});
    });
    return ()=>controller.abort();
  },[packageId,owner,key]);
  if(current?.data)return <SavedPackagePreview target={current.data} onClose={onClose} />;
  return <Modal isOpen onClose={onClose} title="Review saved draft" size="lg" footer={<Button variant="cancel" onClick={onClose}>Close preview</Button>}>
    {!current ? <p role="status" className="text-sm text-primary-800">Checking the saved draft…</p> : <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p>{current.error}</p><p className="mt-2">Your editor and recovery copy have not changed.</p><button type="button" onClick={()=>setRetry(v=>v+1)} className="mt-3 min-h-11 font-semibold underline">Try again</button></div>}
  </Modal>;
}

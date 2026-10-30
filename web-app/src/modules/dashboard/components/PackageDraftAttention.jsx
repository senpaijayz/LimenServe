import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../../context/useAuth';
import { getPackageDraftReviews } from '../../../services/packageDraftReviewsApi';
import { PACKAGE_DRAFTS_HREF, packageDraftReviewHref } from '../../cms/packages/packageReviewLinks';

const control='min-h-11 rounded-lg border border-primary-300 bg-white px-3 text-sm font-semibold text-primary-800 disabled:opacity-40';
export default function PackageDraftAttention({refreshKey=0}) {
  const {user}=useAuth();
  const [page,setPage]=useState(1),[retry,setRetry]=useState(0);
  const [result,setResult]=useState({key:'',data:null,error:''});
  const key=JSON.stringify([user?.id,user?.role,page,retry,refreshKey]);
  const current=result.key===key ? result : null;
  const data=current?.data,loading=!current;
  useEffect(()=>{
    if(user?.role!=='admin')return;
    const controller=new AbortController();
    getPackageDraftReviews({page,pageSize:4},controller.signal).then(data=>{
      if(controller.signal.aborted)return;
      if(data.pagination.page!==page){setPage(data.pagination.page);return;}
      setResult({key,data,error:''});
    }).catch(error=>{
      if(!controller.signal.aborted)setResult({key,data:null,error:error.message || 'Package drafts could not load.'});
    });
    return ()=>controller.abort();
  },[user?.role,page,key]);
  if(user?.role!=='admin')return null;
  return <section aria-label="Package drafts to review" className="min-w-0 rounded-xl border border-primary-200 bg-white p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold text-primary-950">Package drafts {data && <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-sm text-blue-900">{data.pagination.totalCount}</span>}</h2><p className="mt-1 text-sm text-primary-700">Saved drafts that are not published. Review them when you are ready.</p></div>
      <button type="button" className={control} disabled={loading} onClick={()=>setRetry(v=>v+1)}>Refresh drafts</button>
    </header>
    {loading && <p role="status" className="mt-3 text-sm text-primary-700">Loading saved drafts…</p>}
    {current?.error && <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{current.error}<button type="button" className="ml-2 min-h-11 font-semibold underline" onClick={()=>setRetry(v=>v+1)}>Try again</button></div>}
    <details className="mt-3 rounded-lg border border-primary-200">
      <summary className="min-h-11 cursor-pointer rounded-lg px-3 py-3 text-sm font-semibold text-primary-900">Review saved drafts</summary>
      <div className="space-y-3 border-t border-primary-200 p-3">
        {data?.packages.length ? <>
          <p className="text-xs text-primary-700">Showing {(page-1)*data.pagination.pageSize+1}–{Math.min(page*data.pagination.pageSize,data.pagination.totalCount)} of {data.pagination.totalCount} drafts. Opening one does not publish it.</p>
          <ul className="divide-y divide-primary-200">{data.packages.map(pkg=><li key={pkg.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-primary-950">{pkg.name}</p><p className="mt-1 text-xs text-primary-700">Not published · saved revision {pkg.expectedRevision}</p></div><Link to={packageDraftReviewHref(pkg.id)} aria-label={`Review saved draft ${pkg.name}`} className="inline-flex min-h-11 items-center rounded-lg border border-blue-300 bg-blue-50 px-3 text-sm font-semibold text-blue-900 hover:bg-blue-100">Review draft</Link></li>)}</ul>
        </> : <p className="text-sm text-primary-700">{loading ? 'Loading this draft page…' : current.error ? 'Refresh the list to check saved drafts.' : 'There are no saved drafts to review.'}</p>}
        <nav aria-label="Package draft pages" className="flex items-center justify-between gap-2"><button type="button" className={control} disabled={loading || !data || page<=1} onClick={()=>setPage(v=>v-1)}>Previous</button><span className="text-xs text-primary-700">{data ? `${page} / ${data.pagination.totalPages}` : '—'}</span><button type="button" className={control} disabled={loading || !data || page>=data.pagination.totalPages} onClick={()=>setPage(v=>v+1)}>Next</button></nav>
      </div>
    </details>
    <Link to={PACKAGE_DRAFTS_HREF} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-blue-800 underline">Open drafts in Content CMS</Link>
  </section>;
}

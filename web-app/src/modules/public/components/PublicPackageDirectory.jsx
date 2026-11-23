import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { getPublicPackageDirectory, getPublicPackageInterest } from '../../../services/publishedPackagesApi';
import { eligibilityLabel } from '../utils/packageEligibilityLabel';

const types = [['','All package types'],['parts','Parts bundles'],['service','Service packages'],['vehicle','Vehicle packages'],['combination','Parts & labor'],['promotion','Promotions'],['maintenance','Maintenance'],['custom','Other packages']];
const field = 'mt-1 min-h-11 w-full rounded-lg border border-primary-300 bg-slate-50 px-3 py-2 text-sm text-primary-950 shadow-sm focus:border-blue-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200';
const button = 'min-h-11 rounded-lg border border-primary-300 bg-slate-100 px-3 text-sm font-semibold text-primary-800 transition hover:bg-slate-200 disabled:opacity-40';

export function PackageInterestNotice({ packageId, variantId, phase, onClear }) {
    const [retry,setRetry] = useState(0);
    const [result,setResult] = useState({key:'',data:null,error:''});
    const key = JSON.stringify([packageId,retry]);
    const current = result.key === key ? result : null;
    useEffect(()=>{
        if (!packageId) return;
        const controller = new AbortController();
        getPublicPackageInterest(packageId,controller.signal).then(data=>{
            if (!controller.signal.aborted) setResult({key,data,error:''});
        }).catch(error=>{
            if (!controller.signal.aborted) setResult({key,data:null,error:error.message || 'This package could not load.'});
        });
        return ()=>controller.abort();
    },[packageId,key]);
    if (!packageId) return null;
    return <aside className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-primary-800" aria-label="Package you are interested in">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
                {!current ? <p role="status">Checking the package you chose…</p> : current.error ? <p role="alert">{current.error}<button type="button" className="ml-2 min-h-11 font-semibold underline" onClick={()=>setRetry(v=>v+1)}>Try again</button></p> : <>
                    <p className="break-words font-semibold text-primary-950">Interested in {current.data.name}</p>
                    <p className="mt-1">{phase==='details' ? 'First enter your vehicle details. Then select the required items below to check this offer.' : 'Select the required items, then look for this offer under Packages for your quote. Only matching options can be added.'}</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 break-words">{current.data.requirements.map((item,index)=><li key={index}>{item}</li>)}</ul>
                    <p className="mt-2 text-xs">Vehicle rules: {[...new Set((current.data.variants.some(v=>v.id===variantId) ? current.data.variants.filter(v=>v.id===variantId) : current.data.variants).flatMap(v=>v.eligibility.map(eligibilityLabel)))].join(' · ') || 'Confirm with the shop'}</p>
                    <p className="mt-2 text-xs">This is a reminder only. No package, part or service has been added, and no price is held.</p>
                </>}
            </div>
            <button type="button" onClick={onClear} className={button}>Clear package reminder</button>
        </div>
    </aside>;
}

export default function PublicPackageDirectory({ buildQuoteHref }) {
    const contentId = useId();
    const [open,setOpen] = useState(false),[search,setSearch] = useState(''),[type,setType] = useState('');
    const [page,setPage] = useState(1),[retry,setRetry] = useState(0),[chosenId,setChosenId] = useState('');
    const [variantChoice,setVariantChoice] = useState({packageId:'',id:''});
    const [result,setResult] = useState({key:'',data:null,error:''});
    const key = JSON.stringify([search,type,page,retry]);
    const current = result.key===key ? result : null;
    const data = current?.data, loading = !current;
    useEffect(()=>{
        if (!open) return;
        const controller = new AbortController();
        const timer = setTimeout(()=>getPublicPackageDirectory({search,type,page,pageSize:4},controller.signal).then(data=>{
            if (controller.signal.aborted) return;
            if (data.pagination.page!==page) {setPage(data.pagination.page);return;}
            setResult({key,data,error:''});
        }).catch(error=>{
            if (!controller.signal.aborted) setResult({key,data:null,error:error.message || 'Packages could not load.'});
        }),250);
        return ()=>{clearTimeout(timer);controller.abort();};
    },[open,search,type,page,key]);
    const chosen = data?.packages.find(p=>p.id===chosenId) || data?.packages[0];
    const variant = chosen?.variants.find(v=>variantChoice.packageId===chosen.id && v.id===variantChoice.id) || chosen?.variants[0];
    return <section className="overflow-hidden rounded-2xl border border-primary-300 bg-slate-100 shadow-sm" aria-label="Published package browser">
        <button type="button" aria-expanded={open} aria-controls={contentId} onClick={()=>{if (!open) setRetry(v=>v+1);setOpen(v=>!v);}}
            className="flex min-h-[84px] w-full items-center justify-between gap-4 bg-gradient-to-r from-blue-50 via-slate-50 to-white px-4 py-4 text-left transition hover:from-blue-100 hover:via-slate-100 sm:px-5">
            <span className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-950 text-lg font-bold text-white shadow-sm">{open?'✓':'+'}</span>
                <span className="min-w-0"><span className="block text-base font-bold text-primary-950">Browse service packages & bundles</span><span className="mt-1 block text-sm font-normal leading-snug text-primary-700">{open?'Compare included items and choose an offer below.':'View published offers, included parts or services, and vehicle requirements.'}</span></span>
            </span>
            <span className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-blue-800 px-3 text-sm font-bold text-white shadow-sm">{open?'Hide packages':'View packages'}<span aria-hidden="true" className="text-base">{open?'−':'→'}</span></span>
        </button>
        <div id={contentId} hidden={!open} className="space-y-4 p-4 sm:p-5" aria-busy={open && loading}>
            <div className="rounded-xl border border-primary-200 bg-white p-3 sm:p-4">
                <p className="mb-3 text-sm font-semibold text-primary-950">1. Find an offer</p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="min-w-0 text-sm font-semibold text-primary-800">Package name or service<input type="search" maxLength={100} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} className={field} placeholder="Search packages" /></label>
                    <label className="min-w-0 text-sm font-semibold text-primary-800">Filter by type<select value={type} onChange={e=>{setType(e.target.value);setPage(1);}} className={field}>{types.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3"><p role="status" className="text-sm font-medium text-primary-800">{loading?'Loading packages…':current.error?'Package list unavailable':`${data.pagination.totalCount} ${data.pagination.totalCount===1?'offer':'offers'} found`}</p><button type="button" className={button} disabled={loading} onClick={()=>setRetry(v=>v+1)}>Refresh list</button></div>
            </div>
            {loading ? <p className="rounded-xl border border-primary-200 bg-white p-4 text-sm text-primary-700">Loading package details…</p> : current.error ? <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{current.error}<button type="button" className="ml-2 min-h-11 font-semibold underline" onClick={()=>setRetry(v=>v+1)}>Try again</button></p> : !chosen ? <p className="rounded-xl border border-primary-200 bg-white p-4 text-sm text-primary-700">No published packages match these filters. You can still request individual parts and services.</p> : <>
                <div className="rounded-xl border border-blue-300 bg-blue-50 p-3 sm:p-4">
                    <label className="block text-sm font-bold text-primary-950">2. Choose an offer<select value={chosen.id} onChange={e=>setChosenId(e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border-2 border-blue-400 bg-white px-3 text-base font-semibold text-primary-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200">{data.packages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                </div>
                <article className="min-w-0 overflow-hidden rounded-xl border border-primary-300 bg-white shadow-sm">
                    <div className="border-b border-primary-800 bg-primary-900 px-4 py-3 text-white"><p className="text-xs font-bold uppercase tracking-wider text-blue-100">Selected offer</p><h3 className="mt-1 break-words text-lg font-bold">{chosen.name}</h3></div>
                    <div className="space-y-3 p-4 sm:p-5">
                    {chosen.description && <p className="whitespace-pre-line break-words text-sm leading-relaxed text-primary-800">{chosen.description}</p>}
                    {chosen.variants.length>1 && <label className="mt-3 block text-sm font-semibold text-primary-800">Package option<select value={variant?.id || ''} onChange={e=>setVariantChoice({packageId:chosen.id,id:e.target.value})} className={field}>{chosen.variants.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label>}
                    {variant && <>
                        <h4 className="text-sm font-bold text-primary-950">Included in {variant.label}</h4>
                        <ul className="max-h-64 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm">{variant.items.map((item,index)=><li key={index} className="py-2"><strong className="break-all text-primary-950">{item.sku || (item.kind==='service'?'Labor':'Part')}</strong><span className="mt-0.5 block break-words text-primary-800">{item.name} · Qty {item.quantity}</span></li>)}</ul>
                        <h4 className="text-sm font-bold text-primary-950">Vehicle requirements</h4>
                        <ul className="mt-1 space-y-1 text-sm text-primary-800">{variant.eligibility.map((rule,index)=><li key={index}>{eligibilityLabel(rule)}</li>)}</ul>
                    </>}
                    {chosen.requirements.length>0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">Before this offer can be confirmed</p><ul className="mt-1 list-inside list-disc space-y-1 break-words">{chosen.requirements.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
                    <p className="rounded-lg bg-slate-100 p-3 text-sm text-primary-700">Price and availability are confirmed in your quotation. Browsing does not reserve stock.</p>
                    <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold text-primary-800">Ready to check fit and price?</p><Link to={buildQuoteHref(chosen.id,variant?.id)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-800 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2">Start quotation <span aria-hidden="true">→</span></Link></div>
                    </div>
                </article>
            </>}
            <nav aria-label="Published package directory pages" className="flex items-center justify-between gap-2 border-t border-primary-200 pt-3">
                <button type="button" className={button} disabled={loading || !data || page<=1} onClick={()=>setPage(v=>v-1)}>Previous</button>
                <span className="text-xs text-primary-700">{data?`${page} / ${data.pagination.totalPages}`:'—'}</span>
                <button type="button" className={button} disabled={loading || !data || page>=data.pagination.totalPages} onClick={()=>setPage(v=>v+1)}>Next</button>
            </nav>
        </div>
    </section>;
}

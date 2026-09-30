import { useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { getProductPriceHistory } from '../../../services/catalogApi';
import { formatCurrency, formatDate, formatDateTime } from '../../../utils/formatters';

const labels = { new_part: 'First listed', increase: 'Price increased', decrease: 'Price decreased', unchanged: 'Unchanged', not_listed: 'Not listed' };
const money = (value) => value == null ? '—' : formatCurrency(value);

export default function ProductPriceHistory({ productId }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    let active = true;
    getProductPriceHistory(productId, controller.signal).then((data) => {
      if (active) { setResult({ productId, data }); setError(''); }
    }).catch((failure) => {
      if (active) setError(failure.message || 'Unable to load price history.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [productId, refresh]);
  const data = result?.productId === productId ? result.data : null;
  const pending = loading || (!data && !error);
  const retry = () => { setLoading(true); setError(''); setRefresh((value) => value + 1); };
  return (
    <section className="rounded-xl border border-primary-200 bg-white p-4" aria-label="Product price history">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-primary-950"><History className="h-4 w-4" />Price history</h3>
        <button type="button" aria-label="Refresh price history" onClick={retry} disabled={pending} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-primary-50 disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} /></button>
      </div>
      {pending ? <p role="status" className="py-5 text-sm text-primary-500">Loading price history…</p> : error ? (
        <div role="alert" className="py-3 text-sm text-red-700">{error}<button type="button" className="ml-3 underline" onClick={retry}>Retry</button></div>
      ) : data && <>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
          <div><p className="text-primary-500">Current selling price</p><p className="text-xl font-semibold text-primary-950">{money(data.currentPrice)}</p><p className="text-xs text-primary-500">{data.currentPriceChangedAt ? `Recorded ${formatDateTime(data.currentPriceChangedAt)}` : 'No current price — set a selling price before POS'}</p>{data.sellingPrices?.find((entry) => entry.isCurrent)?.previousPrice != null && <p className="mt-1 text-xs text-primary-600">Previous selling price: {money(data.sellingPrices.find((entry) => entry.isCurrent).previousPrice)}</p>}</div>
          <div><p className="text-primary-500">Active pricelist</p><p className="font-semibold">{data.activeList ? `${data.activeList.year} · revision ${data.activeList.revision}` : 'No active list'}</p><p className={`text-xs ${data.activeList?.listed === false ? 'text-amber-700' : 'text-primary-500'}`}>{data.activeList ? (data.activeList.listed ? `Listed at ${money(data.activeList.price)}` : 'Omitted from this list; do not assume the old price is current') : 'Manually priced product'}</p></div>
          <div><p className="text-primary-500">Product added</p><p className="font-semibold">{data.addedAt ? formatDate(data.addedAt) : 'Not recorded'}</p><p className="text-xs text-primary-500">{data.firstListedYear ? `First listed in ${data.firstListedYear}` : 'Not in a saved pricelist'}</p></div>
        </div>
        <p className="mt-4 text-xs text-primary-500">Historical and draft prices are for comparison only. POS uses the current selling price.</p>
        {data.versions?.length ? <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="border-y border-primary-200 text-xs text-primary-500"><tr>{['Pricelist / dates','Previous price','List price','Change','Status'].map((label) => <th key={label} className="px-2 py-3 font-semibold">{label}</th>)}</tr></thead>
            <tbody>{data.versions.map((entry) => <tr key={entry.id} className="border-b border-primary-100 align-top">
              <td className="px-2 py-3"><p className="font-semibold">{entry.year} · revision {entry.revision}</p><p className="text-xs text-primary-500">Effective {formatDate(entry.effectiveFrom)}</p><p className="text-xs text-primary-500">Uploaded {formatDateTime(entry.uploadedAt)}</p>{entry.activatedAt && <p className="text-xs text-primary-500">Last activated {formatDateTime(entry.activatedAt)}</p>}<p className="max-w-60 break-words text-xs text-primary-400">{entry.sourceFilename}</p></td>
              <td className="px-2 py-3 whitespace-nowrap">{money(entry.previousPrice)}</td><td className="px-2 py-3 whitespace-nowrap font-semibold">{entry.listed ? money(entry.price) : 'Not listed'}</td>
              <td className={`px-2 py-3 ${entry.difference > 0 ? 'text-red-700' : entry.difference < 0 ? 'text-emerald-700' : 'text-primary-500'}`}><p>{entry.difference > 0 ? '+' : ''}{money(entry.difference)}</p><p className="text-xs">{labels[entry.change]}</p></td>
              <td className="px-2 py-3 capitalize">{entry.isActive ? 'Active' : entry.status === 'draft' ? 'Draft · not used in POS' : 'Previous list'}</td>
            </tr>)}</tbody>
          </table>
          {data.totalVersions > data.versions.length && <p className="mt-2 text-xs text-primary-500">Showing the latest {data.versions.length} of {data.totalVersions} saved versions.</p>}
        </div> : <p className="mt-3 text-sm text-primary-500">No saved yearly pricelist entries yet. Earlier imports were not retained as yearly snapshots. Upload dated lists to compare years; available retail-price records are shown below.</p>}
        {data.sellingPrices?.length > 0 && <details className="mt-4 border-t border-primary-100 pt-3"><summary className="cursor-pointer text-sm font-semibold">Selling-price records</summary><p className="mt-2 text-xs text-primary-500">Actual retail price records, including manual prices and activations. Older same-day manual edits may not have been retained.</p><ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm">{data.sellingPrices.map((entry) => <li key={entry.id} className="flex justify-between gap-3 border-b border-primary-100 py-2"><div>{money(entry.previousPrice)} → <strong>{money(entry.price)}</strong>{entry.isCurrent && <span className="ml-2 text-xs text-emerald-700">Current</span>}</div><div className="text-right text-xs text-primary-500">{formatDateTime(entry.changedAt)}<br />Effective {formatDate(entry.effectiveFrom)}</div></li>)}</ul></details>}
      </>}
    </section>
  );
}

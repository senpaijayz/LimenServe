import {useState} from 'react';
import {Grid2X2,List,ScanLine,History} from 'lucide-react';
import BarcodeDisplay from '../../../components/ui/BarcodeDisplay';
import {buildProductBarcodeValue} from '../../../utils/barcode';
import {hasPositivePartPrice} from '../../../utils/catalogPrice';
import {formatCurrency} from '../../../utils/formatters';
import './PosProductBrowser.css';

const key='limen-pos-display:v1';
const defaults={view:'grid',size:'comfortable'};
const readPreferences=()=>{try{const saved=JSON.parse(localStorage.getItem(key));return {view:saved?.view==='list'?'list':'grid',size:saved?.size==='compact'?'compact':'comfortable'};}catch{return defaults;}};
export default function PosProductBrowser({products,onSelect,onBarcode,onPriceHistory}){
  const [display,setDisplay]=useState(readPreferences);
  const change=patch=>{const next={...display,...patch};setDisplay(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Display controls remain usable when storage is unavailable. */}};
  const compact=display.size==='compact';
  return <section className="min-w-0" aria-label="Product browsing">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-semibold text-primary-800">Parts <span className="font-normal text-primary-700">· {products.length} shown</span></p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-primary-800">Size<select aria-label="Product display size" value={display.size} onChange={e=>change({size:e.target.value})} className="min-h-11 rounded-xl border border-primary-300 bg-white px-3 py-2 text-sm text-primary-950"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
        <div role="group" aria-label="Product view" className="inline-flex rounded-xl border border-primary-200 bg-primary-50 p-1">
          {[['grid','Grid view'],['list','List view']].map(([view,label])=><button key={view} type="button" title={label} aria-label={label} aria-pressed={display.view===view} onClick={()=>change({view})} className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${display.view===view?'border-primary-300 bg-white text-blue-800 shadow-sm':'border-transparent text-primary-700 hover:bg-white'}`}>{view==='grid'?<Grid2X2 className="h-4 w-4" aria-hidden="true" />:<List className="h-4 w-4" aria-hidden="true" />}</button>)}
        </div>
      </div>
    </div>
    {!products.length && <p role="status" className="rounded-xl border border-dashed border-primary-300 bg-white px-4 py-10 text-center text-sm text-primary-700">No matching parts. Try another part number or change the stock filter.</p>}
    <div className={`pos-products-display pos-products-${display.view} pos-products-${display.size}`}>
      {products.map(product=><article key={product.id} className="pos-product-result">
        <button type="button" onClick={()=>onSelect(product)} disabled={!hasPositivePartPrice(product.price)} title={hasPositivePartPrice(product.price)?'Add '+product.sku+' to current sale':'Confirm a positive selling price in Products first.'} className="pos-result-select">
          {display.view==='grid' && <div className="pos-result-barcode"><BarcodeDisplay value={buildProductBarcodeValue(product.sku || 'UNKNOWN') || product.sku || 'UNKNOWN'} size="small" height={compact?30:46} fontSize={0} margin={8} /></div>}
          <span className="pos-result-identity"><strong className="pos-result-sku">{product.sku}</strong><span className="pos-result-name">{product.name}</span><span className={`pos-result-stock ${product.maxQuantity>0?'text-primary-700':'text-red-700'}`}>{product.maxQuantity>0?`${product.maxQuantity} available`:'Out of stock'}</span></span>
          <strong className="pos-result-price">{hasPositivePartPrice(product.price)?formatCurrency(product.price):'Price needs review'}</strong>
        </button>
        <div className="pos-result-actions">
          <button type="button" onClick={()=>onBarcode(product)} aria-label={'Large barcode for '+product.sku} title="Large barcode"><ScanLine className="h-4 w-4 shrink-0" aria-hidden="true" /><span>Barcode</span></button>
          <button type="button" onClick={()=>onPriceHistory(product)} aria-label={'Price history for '+product.sku} title="Price history"><History className="h-4 w-4 shrink-0" aria-hidden="true" /><span>History</span></button>
        </div>
      </article>)}
    </div>
  </section>;
}

import {useState} from 'react';
import {Grid2X2,List,ScanLine,History} from 'lucide-react';
import BarcodeDisplay from '../../../components/ui/BarcodeDisplay';
import {buildProductBarcodeValue} from '../../../utils/barcode';
import {hasPositivePartPrice} from '../../../utils/catalogPrice';
import {formatCurrency} from '../../../utils/formatters';
import './PosProductBrowser.css';

const key='limen-pos-display:v1';
const readViewPreference=()=>{try{const saved=JSON.parse(localStorage.getItem(key));return saved?.view==='list'?'list':'grid';}catch{return 'grid';}};
export default function PosProductBrowser({products,onSelect,onBarcode,onPriceHistory}){
  const [view,setView]=useState(readViewPreference);
  const changeView=nextView=>{setView(nextView);try{localStorage.setItem(key,JSON.stringify({view:nextView}));}catch{/* Display controls remain usable when storage is unavailable. */}};
  return <section className="min-w-0" aria-label="Product browsing">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-semibold text-primary-800">Parts <span className="font-normal text-primary-700">· {products.length} shown</span></p>
      <div role="group" aria-label="Product view" className="inline-flex rounded-xl border border-primary-200 bg-primary-50 p-1">
        {[['grid','Grid view'],['list','List view']].map(([nextView,label])=><button key={nextView} type="button" title={label} aria-label={label} aria-pressed={view===nextView} onClick={()=>changeView(nextView)} className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${view===nextView?'border-primary-300 bg-white text-blue-800 shadow-sm':'border-transparent text-primary-700 hover:bg-white'}`}>{nextView==='grid'?<Grid2X2 className="h-4 w-4" aria-hidden="true" />:<List className="h-4 w-4" aria-hidden="true" />}</button>)}
      </div>
    </div>
    {!products.length && <p role="status" className="rounded-xl border border-dashed border-primary-300 bg-white px-4 py-10 text-center text-sm text-primary-700">No matching parts. Try another part number or change the stock filter.</p>}
    <div className={`pos-products-display pos-products-${view} pos-products-compact`}>
      {products.map(product=><article key={product.id} className="pos-product-result">
        <button type="button" onClick={()=>onSelect(product)} disabled={!hasPositivePartPrice(product.price)} title={hasPositivePartPrice(product.price)?'Add '+product.sku+' to current sale':'Confirm a positive selling price in Products first.'} className="pos-result-select">
          {view==='grid' && <div className="pos-result-barcode"><BarcodeDisplay value={buildProductBarcodeValue(product.sku || 'UNKNOWN') || product.sku || 'UNKNOWN'} size="small" height={30} fontSize={0} margin={8} /></div>}
          <span className="pos-result-identity"><strong className="pos-result-sku">{product.sku}</strong><span className="pos-result-name">{product.name}</span><span className={`pos-result-stock ${product.maxQuantity>0?'pos-result-stock-available':'text-red-700'}`}>{product.maxQuantity>0?`${product.maxQuantity} available`:'Out of stock'}</span></span>
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

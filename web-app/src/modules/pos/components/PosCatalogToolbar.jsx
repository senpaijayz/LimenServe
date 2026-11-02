import {useId,useState} from 'react';
import {Search,Camera,Wrench,SlidersHorizontal,X} from 'lucide-react';
import './PosWorkspace.css';

export default function PosCatalogToolbar({search,onSearch,sort,onSort,stock,onStock,onScan,onService}){
  const [filtersOpen,setFiltersOpen]=useState(false),id=useId();
  const filtered=stock!=='all' || sort!=='available-stock-desc';
  return <section className="pos-catalog-toolbar" aria-label="Find parts">
    <div className="pos-catalog-heading"><div><h2>Find a part</h2><p>Prices include VAT.</p></div><button type="button" className="pos-filter-toggle" aria-expanded={filtersOpen} aria-controls={id} onClick={()=>setFiltersOpen(value=>!value)}><SlidersHorizontal size={16} aria-hidden="true" />Filters{filtered && <span className="pos-filter-dot"><span className="sr-only">Active filters</span></span>}</button></div>
    <div className="pos-catalog-search">
      <div className="pos-search-input"><label htmlFor={id+'-search'} className="sr-only">Search parts or scan a barcode</label><Search size={19} aria-hidden="true" /><input id={id+'-search'} value={search} onChange={e=>onSearch(e.target.value)} placeholder="Part number, name or barcode" autoComplete="off" />{search && <button type="button" aria-label="Clear part search" onClick={()=>onSearch('')}><X size={16} aria-hidden="true" /></button>}</div>
      <button type="button" className="pos-toolbar-action" onClick={onScan}><Camera size={17} aria-hidden="true" />Scan</button>
      <button type="button" className="pos-toolbar-action pos-toolbar-service" onClick={onService}><Wrench size={17} aria-hidden="true" />Add service</button>
    </div>
    <div id={id} className={`pos-catalog-filters ${filtersOpen?'is-open':''}`}>
      <label>Sort by<select value={sort} onChange={e=>onSort(e.target.value)}>
        <option value="available-stock-desc">Available first</option><option value="unavailable-stock-desc">Unavailable first</option><option value="name-asc">Name: A to Z</option><option value="name-desc">Name: Z to A</option><option value="stock-desc">Stock: High to Low</option><option value="stock-asc">Stock: Low to High</option><option value="price-asc">Price: Low to High</option><option value="price-desc">Price: High to Low</option>
      </select></label>
      <label>Stock<select value={stock} onChange={e=>onStock(e.target.value)}><option value="all">All products</option><option value="available">Available stock only</option><option value="out">Out of stock only</option></select></label>
    </div>
  </section>;
}

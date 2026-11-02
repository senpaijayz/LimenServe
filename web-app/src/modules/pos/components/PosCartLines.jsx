import {Minus,Plus,Trash2,ShoppingBag} from 'lucide-react';
import {formatCurrency} from '../../../utils/formatters';
import './PosWorkspace.css';

export default function PosCartLines({items,onQuantity,onRemove,locked=false}){
  if(!items.length)return <div className="pos-cart-empty"><ShoppingBag size={30} aria-hidden="true" /><strong>Your sale starts here</strong><p>Select a part or add a service.</p></div>;
  return <ul className="pos-cart-lines" aria-label="Items in current sale">{items.map(item=><li key={item.id} className="pos-cart-line">
    <div className="pos-cart-line-heading"><div className="pos-cart-line-identity">{item.sku && <strong>{item.sku}</strong>}<p>{item.name}</p><span>{formatCurrency(item.price)} each</span></div><strong className="pos-cart-line-total">{formatCurrency(item.price*item.quantity)}</strong></div>
    <div className="pos-cart-line-controls"><div className="pos-cart-stepper"><button type="button" disabled={locked} aria-label={`Decrease ${item.name} quantity`} onClick={()=>onQuantity(item.id,item.quantity-1)}><Minus size={15} aria-hidden="true" /></button><span aria-label={`Quantity: ${item.quantity}`}>{item.quantity}</span><button type="button" disabled={locked || (item.lineType!=='service' && item.quantity>=item.maxQuantity)} aria-label={`Increase ${item.name} quantity`} onClick={()=>onQuantity(item.id,item.quantity+1)}><Plus size={15} aria-hidden="true" /></button></div><button type="button" className="pos-cart-remove" disabled={locked} onClick={()=>onRemove(item.id)} aria-label={`Remove ${item.name}`}><Trash2 size={16} aria-hidden="true" /><span>Remove</span></button></div>
  </li>)}</ul>;
}

import {useId} from 'react';
import {CreditCard} from 'lucide-react';
import Button from '../../../components/ui/Button';
import {formatCurrency} from '../../../utils/formatters';
import './PosWorkspace.css';

export default function PosSaleSummary({totals,discount,onDiscount,onPayment,disabled=false,locked=false,checking=false}){
  const id=useId();
  return <div className="pos-sale-summary">
    <div className="pos-discount-control"><label htmlFor={id}>Discount <span>(%)</span></label><input id={id} aria-label="Discount percentage" type="number" min="0" max="100" step="0.01" value={discount} disabled={locked} onChange={e=>onDiscount(Math.min(100,Math.max(0,Math.round((parseFloat(e.target.value) || 0)*100)/100)))} /></div>
    <dl className="pos-sale-breakdown"><div><dt>Sales (VAT included)</dt><dd>{formatCurrency(totals.rawSubtotal)}</dd></div>{discount>0 && <div className="pos-sale-discount"><dt>Discount ({discount}%)</dt><dd>-{formatCurrency(totals.discountAmount)}</dd></div>}<div><dt>VAT included (12%)</dt><dd>{formatCurrency(totals.tax)}</dd></div></dl>
    <div className="pos-sale-total"><span>Total due</span><strong>{formatCurrency(totals.total)}</strong></div>
    <Button variant="primary" size="lg" fullWidth className="hidden lg:inline-flex" disabled={disabled} isLoading={checking} loadingLabel="Checking stock…" onClick={onPayment} leftIcon={<CreditCard className="h-4 w-4" />}>Review payment</Button>
  </div>;
}

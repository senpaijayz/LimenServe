import {useEffect,useState} from 'react';
import {formatCurrency,formatDateTime} from '../../../utils/formatters';
import {getPublicCmsSite} from '../../../services/cmsApi';
import './SaleReceiptPreview.css';

const Field=({label,value=''})=><div className="invoice-field"><span>{label}</span><span className="invoice-field-value">{value || '\u00a0'}</span></div>;
const Total=({label,value,strong=false})=><div className={strong?'invoice-total-row invoice-total-strong':'invoice-total-row'}><span>{label}</span><span>{value}</span></div>;
export default function SaleReceiptPreview({receipt,printId='pos-receipt'}){
  const [business,setBusiness]=useState({});
  useEffect(()=>{let active=true;getPublicCmsSite().then(site=>{if(active)setBusiness(site.settings ?? {});}).catch(()=>{});return()=>{active=false;};},[]);
  if(!receipt)return null;
  const items=receipt.items ?? [];
  const unpaid=receipt.status==='pending' && receipt.paymentMethod==='to_follow';
  const method=({cash:'Cash',gcash:'GCash',bank_transfer:'Bank transfer',to_follow:'Payment to follow'})[receipt.paymentMethod] || receipt.paymentMethod || '';
  return <div className="invoice-preview-scroll"><div id={printId} className="receipt-preview paper-invoice">
    <header className="invoice-business">
      <h2>{business.company_name || 'LIMEN AUTO PARTS CENTER'}</h2>
      {business.address && <p>{business.address}</p>}
      {(business.primary_phone || business.landline) && <p>{[business.primary_phone,business.landline].filter(Boolean).join(' · ')}</p>}
      <p>VAT Reg. TIN: {business.tin || '________________________'}</p>
    </header>
    <div className="invoice-heading"><h3>{unpaid?'UNPAID ORDER':'SALES INVOICE'}</h3><div>No. <strong>{receipt.transactionNumber}</strong></div></div>
    {receipt.quotationNumber && <p className="mb-3 text-xs">Quotation: <strong>{receipt.quotationNumber}</strong></p>}
    {unpaid && <p className="invoice-unpaid">UNPAID — Parts released and stock deducted. This is not proof of payment.</p>}
    <div className="invoice-fields">
      <div><Field label="Sold to:" value={receipt.customerName || 'Walk-in Customer'} /><Field label="Address:" value={receipt.customerAddress} /><Field label="TIN:" value={receipt.customerTin} /><Field label="Business style:" value={receipt.businessStyle} /></div>
      <div><Field label="Date:" value={formatDateTime(receipt.issuedAt || receipt.createdAt || receipt.businessDate)} /><Field label="Terms:" value={method} /><Field label="P.O. No.:" value={receipt.poNumber} /><Field label="OSCA/PWD ID No.:" value={receipt.oscaPwdId} /><Field label="Cardholder sig.:" /></div>
    </div>
    <table className="invoice-items"><colgroup><col className="invoice-qty" /><col className="invoice-unit" /><col className="invoice-item" /><col className="invoice-price" /><col className="invoice-amount" /></colgroup>
      <thead><tr>{['QTY','UNIT','ITEM','PRICE','TOTAL'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{items.map((item,index)=><tr key={item.id || index}><td>{item.quantity}</td><td>{item.unit || item.uom || ''}</td><td>{item.itemSku && <strong className="invoice-part-number">{item.itemSku}</strong>}<span className="invoice-item-name">{item.itemName}</span></td><td>{formatCurrency(item.unitPrice)}</td><td>{formatCurrency(item.lineTotal)}</td></tr>)}
        {Array.from({length:Math.max(0,8-items.length)},(_,index)=><tr className="invoice-empty-row" key={'blank-'+index}><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>)}
      </tbody>
    </table>
    <div className="invoice-bottom">
      <div className="invoice-tax-box"><Total label="Subtotal" value={formatCurrency(receipt.subtotal)} /><Total label="Discount" value={formatCurrency(receipt.discountTotal ?? 0)} /><Total label="VAT amount" value={formatCurrency(receipt.taxTotal)} /><div className="invoice-cashier">Prepared by: {receipt.cashierName || ''}</div></div>
      <div className="invoice-totals"><Total label="Subtotal" value={formatCurrency(receipt.subtotal)} /><Total label="Less: Discount" value={formatCurrency(receipt.discountTotal ?? 0)} /><Total label="Add: VAT" value={formatCurrency(receipt.taxTotal)} /><Total label="TOTAL AMOUNT DUE" value={formatCurrency(receipt.totalAmount)} strong />
        {unpaid ? <Total label="BALANCE DUE — UNPAID" value={formatCurrency(receipt.totalAmount)} strong /> : <><Total label="Cash received" value={receipt.cashReceived==null?'—':formatCurrency(receipt.cashReceived)} /><Total label="Change" value={formatCurrency(receipt.changeDue ?? 0)} /></>}
      </div>
    </div>
    {receipt.note && <div className="invoice-note"><strong>Order note: </strong>{receipt.note}</div>}
    {receipt.paidAt && <p className="invoice-paid-date">Payment recorded: {formatDateTime(receipt.paidAt)}</p>}
    <footer className="invoice-signature"><p>Received the above items in good order and condition.</p><div>Signature over printed name / date</div></footer>
  </div></div>;
}

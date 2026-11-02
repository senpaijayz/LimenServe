import {jsPDF} from 'jspdf';
import {documentIncludesVat} from '../../../../../shared/vatPricing.js';

const money=value=>'PHP '+Number(value || 0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=value=>value && !Number.isNaN(new Date(value).getTime())?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'';
const text=value=>String(value ?? '').replace(/[\u2013\u2014]/g,'-').replace(/₱/g,'PHP ');

// Vector text and row-aware pagination: never slice a screenshot across pages.
export function createInvoicePdf(receipt,business={},logo=null) {
  if(!receipt || !Array.isArray(receipt.items))throw Error('Reload the saved invoice before printing.');
  const doc=new jsPDF({unit:'mm',format:'a4'}),margin=12,width=186,bottom=285;
  const details=receipt.invoiceDetails || {},included=documentIncludesVat(receipt);
  const unpaid=receipt.status==='pending' && receipt.paymentMethod==='to_follow';
  const method=({cash:'Cash',check:'Check',to_follow:'Payment to follow',gcash:'GCash',bank_transfer:'Bank transfer'})[receipt.paymentMethod] || receipt.paymentMethod || '';
  let y=margin;
  doc.setProperties({title:text(receipt.transactionNumber || 'Limen invoice'),author:'Limen Auto Parts Center'});
  const font=(size=8,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(17,17,17);};
  const lines=(value,maxWidth,size=8,bold=false)=>{font(size,bold);return doc.splitTextToSize(text(value),maxWidth);};
  const nextPage=()=>{doc.addPage();y=margin;font(8,true);doc.text('LIMEN AUTO PARTS CENTER - CONTINUED',margin,y+3);font(7);doc.text(text(receipt.transactionNumber),198,y+3,{align:'right'});y+=9;};
  const ensure=height=>{if(y+height>bottom)nextPage();};
  const center=(value,size=8,bold=false)=>{const rows=lines(value,width,size,bold);doc.text(rows,105,y+size*.35,{align:'center'});y+=rows.length*size*.4+1;};
  if(logo){doc.addImage(logo.data,logo.format || 'PNG',81,y,48,17);y+=19;}
  center(business.company_name || 'LIMEN AUTO PARTS CENTER',14,true);
  center('Unit 5-B Edsa Extension Brgy. 76 1300 Pasay City');
  center('NCR Fourth District Philippines');
  center('Wilson A. Limen - Prop.');
  center('VAT Reg TIN: 213-000-580-00000');
  center([business.primary_phone || '(0915) 522 5629',business.landline || '02 8551 3518'].join(' | '));
  center(business.business_hours || 'Mon-Sat 8:00 AM-5:00 PM | Sun 8:00 AM-12:00 PM',7);
  y+=4;font(12,true);doc.text(unpaid?'UNPAID ORDER':'SALES INVOICE',margin,y);font(8,true);doc.text(text('No. '+receipt.transactionNumber),198,y,{align:'right'});y+=5;
  const paragraph=(value,bold=false)=>{const rows=lines(value,width-4,8,bold);for(const row of rows){ensure(5);font(8,bold);doc.text(row,margin+2,y+3.4);y+=4.5;}y+=2;};
  if(receipt.quotationNumber)paragraph('Quotation: '+receipt.quotationNumber);
  if(unpaid)paragraph('UNPAID - Parts released and stock deducted. This is not proof of payment.',true);
  const left=[['Sold to',receipt.customerName || 'Walk-in Customer'],['Address',details.customerAddress || receipt.customerAddress],['TIN',details.customerTin || receipt.customerTin],['Business style',details.businessStyle || receipt.businessStyle]];
  const right=[['Date',date(receipt.issuedAt || receipt.createdAt || receipt.businessDate)],['Terms',details.terms || method],['P.O. No.',details.poNumber || receipt.poNumber],['OSCA/PWD ID',details.oscaPwdId || receipt.oscaPwdId],['Contact',details.customerContact]];
  for(let index=0;index<5;index++){
    const cells=[left[index],right[index]],wrapped=cells.map(cell=>cell?lines(cell[0]+': '+(cell[1] || ''),88):[]);
    const h=Math.max(5,...wrapped.map(row=>row.length*3.5+1.5));ensure(h);
    wrapped.forEach((row,col)=>{if(!row.length)return;font(8);const x=margin+col*96;doc.text(row,x,y+3);doc.setDrawColor(130);doc.line(x,y+h-1,x+90,y+h-1);});y+=h;
  }
  y+=4;
  const widths=[13,14,87,36,36],xs=[12,25,39,126,162];
  const tableHeader=()=>{ensure(8);font(8,true);['QTY','UNIT','ITEM','PRICE','TOTAL'].forEach((label,col)=>{doc.setDrawColor(45);doc.rect(xs[col],y,widths[col],7);doc.text(label,xs[col]+widths[col]/2,y+4.6,{align:'center'});});y+=7;};
  tableHeader();
  for(const item of receipt.items){
    const description=[...(item.itemSku?lines(item.itemSku,83,8,true):[]),...lines(item.itemName,83)];
    // Split only exceptionally long descriptions; ordinary item rows stay intact.
    let offset=0;
    do{
      const available=Math.floor((bottom-y-3)/3.5);
      if(available<2 || (description.length-offset<=70 && (description.length-offset)*3.5+3>bottom-y)){nextPage();tableHeader();}
      const capacity=Math.max(1,Math.floor((bottom-y-3)/3.5));
      const chunk=description.slice(offset,offset+capacity),h=Math.max(8,chunk.length*3.5+3),first=offset===0;
      widths.forEach((w,col)=>{doc.setDrawColor(80);doc.rect(xs[col],y,w,h);});
      font(8);
      if(first){doc.text(text(item.quantity),18.5,y+4.5,{align:'center'});doc.text(text(item.unit || item.uom || ''),32,y+4.5,{align:'center'});doc.text(money(item.unitPrice),160,y+4.5,{align:'right'});doc.text(money(item.lineTotal),196,y+4.5,{align:'right'});}
      chunk.forEach((row,index)=>{font(8,first && index===0 && Boolean(item.itemSku));doc.text(row,41,y+4.5+index*3.5);});
      y+=h;offset+=Math.max(1,chunk.length);
    }while(offset<description.length);
  }
  y+=3;
  const totals=[
    [included?'Total sales (VAT inclusive)':'Subtotal',receipt.subtotal],
    ['Less: Discount',receipt.discountTotal],
    [included?'VAT included (12%)':'Add: VAT',receipt.taxTotal],
    ['TOTAL AMOUNT DUE',receipt.totalAmount,true],
    ...(unpaid?[['BALANCE DUE - UNPAID',receipt.totalAmount,true]]:receipt.paymentMethod==='cash'?[['Cash received',receipt.cashReceived],['Change',receipt.changeDue]]:[]),
  ];
  const noteBlocks=[!unpaid && receipt.paymentMethod!=='cash' && 'Payment method: '+method,receipt.note && 'Order note: '+receipt.note,receipt.paymentReference && (receipt.paymentMethod==='check'?'Check number: ':'Payment reference: ')+receipt.paymentReference,receipt.paidAt && 'Payment recorded: '+date(receipt.paidAt)].filter(Boolean);
  const noteHeight=noteBlocks.reduce((sum,n)=>sum+lines(n,width-4).length*4.5+2,0);
  const closingHeight=totals.length*5.5+noteHeight+24;
  // Keep totals, short notes and acknowledgement together when they fit a page.
  ensure(Math.min(closingHeight,90));
  const start=y;
  [['VATable sales',included?Number(receipt.totalAmount)-Number(receipt.taxTotal || 0):receipt.subtotal],['Discount',receipt.discountTotal],['VAT amount',receipt.taxTotal]].forEach(([label,value],i)=>{font(8);doc.text(label,margin,start+4+i*5.5);doc.text(money(value),85,start+4+i*5.5,{align:'right'});});
  font(7);doc.text(lines('Prepared by: '+(receipt.cashierName || ''),73,7),margin,start+22);
  totals.forEach(([label,value,bold])=>{ensure(5.5);font(8,bold);doc.setDrawColor(130);doc.rect(89,y,109,5.5);doc.text(label,91,y+3.7);doc.text(value==null && label==='Cash received'?'Not recorded':money(value),196,y+3.7,{align:'right'});y+=5.5;});
  y=Math.max(y,start+26)+3;
  noteBlocks.forEach(note=>paragraph(note));
  const recipient=details.receivedBy?lines(details.receivedBy,92,8,true):[];
  ensure(20+recipient.length*3.5);y+=5;font(7);doc.text('Received the above items in good order and condition.',198,y,{align:'right'});y+=9;
  if(recipient.length){font(8,true);doc.text(recipient,150,y-1,{align:'center'});y+=Math.max(0,recipient.length-1)*3.5;}
  doc.setDrawColor(60);doc.line(102,y,198,y);font(7);doc.text('RECEIVED BY / SIGNATURE / DATE',150,y+4,{align:'center'});
  return doc;
}

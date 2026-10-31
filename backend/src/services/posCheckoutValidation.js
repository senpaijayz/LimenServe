const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid=message=>Object.assign(new Error(message),{statusCode:400});
export function posRequestId(value){if(typeof value!=='string'||!UUID.test(value))throw invalid('A valid saved checkout reference is required.');return value;}
export function posPaymentEvidence(body={}){
  body=body&&typeof body==='object'?body:{};
  const fields={};
  if(Object.hasOwn(body,'paymentVerified'))fields.paymentVerified=body.paymentVerified===true;
  if(Object.hasOwn(body,'paymentReference'))fields.paymentReference=typeof body.paymentReference==='string'?body.paymentReference.trim():'';
  if(Object.hasOwn(body,'paidAmount'))fields.paidAmount=Number(body.paidAmount);
  return fields;
}
export function validatePosCheckout(payload,requestId){
  posRequestId(requestId);
  if(payload.customerId!==undefined&&(typeof payload.customerId!=='string'||!UUID.test(payload.customerId)))throw invalid('Choose a valid saved customer or use a walk-in name.');
  if(!['cash','check','to_follow'].includes(payload.paymentMethod))throw invalid('Choose a supported payment method.');
  if(payload.paymentReference!==undefined && payload.paymentReference.length>120)throw invalid('Keep the transaction reference within 120 characters.');
  if(payload.paidAmount!==undefined && (!Number.isFinite(payload.paidAmount)||payload.paidAmount<0||payload.paidAmount>1000000000))throw invalid('Enter a valid received amount.');
  if(payload.note.length>1000 || payload.customerName.length>200)throw invalid('Keep the note within 1000 characters and customer name within 200.');
  if(!Object.values(payload.totals).every(value=>Number.isFinite(value)&&value>=0&&value<=1000000000)
      || payload.discountPercent<0 || payload.discountPercent>100)throw invalid('Review the sale amounts and discount.');
  if(payload.paymentMethod==='cash' && (!Number.isFinite(payload.cashReceived)||payload.cashReceived<0||payload.cashReceived>1000000000
      ||Math.abs(payload.changeDue-Math.max(0,payload.cashReceived-payload.totals.total))>0.01))throw invalid('Review the cash received and change due.');
  if(payload.paymentMethod==='check' && (payload.paymentVerified!==true || !payload.paymentReference?.trim() || !Number.isFinite(payload.paidAmount)
      || Math.round((payload.paidAmount+Number.EPSILON)*100)!==Math.round((payload.totals.total+Number.EPSILON)*100) || payload.paidAmount<=0 || payload.cashReceived!==0 || payload.changeDue!==0)){
    throw invalid('Confirm the check has cleared, then enter its number and the full cleared amount.');
  }
  if(payload.paymentMethod==='to_follow' && (!payload.customerName || !payload.note || !payload.releaseConfirmed || payload.totals.total<=0)){
    throw invalid('Enter the customer and a note, then confirm the parts are being released now.');
  }
}

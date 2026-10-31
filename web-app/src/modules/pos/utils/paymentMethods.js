export const isNonCash=method=>method==='check';
export function matchesFullPayment(amount,total,reference){
  const value=Number(amount),due=Number(total),cents=value=>Math.round((value+Number.EPSILON)*100);
  return String(amount).trim()!==''&&Number.isFinite(value)&&Number.isFinite(due)&&value>0&&value<=1000000000
    &&cents(due)>0&&cents(value)===cents(due)&&Boolean(reference.trim())&&reference.trim().length<=120;
}

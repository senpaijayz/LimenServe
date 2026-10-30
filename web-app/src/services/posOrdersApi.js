import apiClient, {extractApiError} from './apiClient';
async function request(method,path,payload,signal){
  try{return (await apiClient.request({method,url:`/pos${path}`,...(method==='get'?{params:payload}:{data:payload}),signal})).data;}
  catch(error){
    try{extractApiError(error,'The POS request could not be confirmed.');}catch(friendly){
      const message=String(error.response?.data?.error || '');
      friendly.definitive=[400,409,422].includes(error.response?.status) && !/reference already belongs/.test(message);
      throw friendly;
    }
  }
}
export const submitPosOrder=(payload)=>request('post','/sales',payload);
export const settlePosOrder=({saleId,...payload})=>request('post',`/sales/${encodeURIComponent(saleId)}/settle`,payload);
export const recoverPosOrder=(id)=>request('get',`/requests/${encodeURIComponent(id)}`);
export const listUnpaidPosOrders=(page,signal)=>request('get','/unpaid',{page},signal);
export const getPaidSalesDayTotals=date=>request('get','/paid-day-totals',{date});
export const getQuotePosContext=(id,signal)=>request('get',`/quotation/${encodeURIComponent(id)}`,undefined,signal);
export const submitQuotePosOrder=({estimateId,...payload})=>request('post',`/quotation/${encodeURIComponent(estimateId)}/checkout`,payload);

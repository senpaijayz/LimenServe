import apiClient, {extractApiError} from './apiClient';

export const SERVICE_ATTENTION_KINDS = Object.freeze({
  all:'All checks',
  awaiting_payment:'Repair finished · payment next',
  overdue:'Past scheduled finish',
  awaiting_assignment:'Mechanic needed',
  release_review:'Payment marked paid · check release',
  payment_review:'Completed job · payment review',
});
const integer=value=>Number.isSafeInteger(value)&&value>=0;
export function parseServiceAttentionPage(data,kind='all'){
  const p=data?.pagination,s=data?.summary;
  if(!Array.isArray(data?.items)||!p||p.pageSize!==6||!integer(p.totalCount)||!integer(p.page)||p.page<1
    ||!integer(p.totalPages)||p.totalPages!==Math.max(1,Math.ceil(p.totalCount/6))||p.page>p.totalPages
    ||data.items.length!==Math.min(6,Math.max(0,p.totalCount-(p.page-1)*6))
    ||!s||!integer(s.active)||Object.keys(SERVICE_ATTENTION_KINDS).filter(k=>k!=='all').some(k=>!integer(s[k]))
    ||data.items.some(item=>!item||typeof item.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)||typeof item.number!=='string'
      ||!Object.hasOwn(item,'customerName')||(item.customerName!==null&&typeof item.customerName!=='string')
      ||!SERVICE_ATTENTION_KINDS[item.kind]||item.kind==='all'||(kind!=='all'&&item.kind!==kind))
    ||new Set(data.items.map(item=>item.id)).size!==data.items.length||typeof data.checkedAt!=='string'||!Number.isFinite(Date.parse(data.checkedAt))){
    throw Error('The job list is incomplete. Refresh it before using the counts.');
  }
  const issueCounts=Object.keys(SERVICE_ATTENTION_KINDS).filter(k=>k!=='all').map(k=>s[k]);
  if(kind==='all'?(p.totalCount<Math.max(...issueCounts)||p.totalCount>issueCounts.reduce((sum,value)=>sum+value,0)):p.totalCount!==s[kind]){
    throw Error('The job counts do not match this list. Refresh it before continuing.');
  }
  return data;
}
export async function getServiceAttentionPage({page=1,kind='all'}={},signal){
  let data;
  try{({data}=await apiClient.get('/service-orders/attention',{params:{page,kind},signal}));}
  catch(error){extractApiError(error,'Jobs needing attention could not load.');}
  return parseServiceAttentionPage(data,kind);
}
export async function getActiveEstimateCount(){
  let data;
  try{({data}=await apiClient.get('/estimates/active-count'));}
  catch(error){extractApiError(error,'The active quotation count could not load.');}
  if(!integer(data?.activeCount))throw Error('The quotation count could not be confirmed.');
  return data;
}

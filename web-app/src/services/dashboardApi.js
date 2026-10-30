import {getPaidSalesDayTotals} from './posOrdersApi';
import {getCatalogSummary} from './catalogApi';
import {getServiceAttentionPage,getActiveEstimateCount} from './serviceAttentionApi';

export function dashboardBusinessDate(date=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(part=>[part.type,part.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
const settledValue=result=>result.status==='fulfilled'?result.value:null;
const errorMessage=(result,label)=>result.status==='fulfilled'?null:label+': '+(result.reason?.message||'temporarily unavailable');

// Independent authoritative sources: one unavailable read must not hide others.
export async function getDashboardOperationsSnapshot(){
  const date=dashboardBusinessDate();
  const [salesResult,catalogResult,serviceResult,estimateResult]=await Promise.allSettled([
    getPaidSalesDayTotals(date),getCatalogSummary(),getServiceAttentionPage(),getActiveEstimateCount(),
  ]);
  return {
    range:{startDate:date,endDate:date},
    sales:settledValue(salesResult),catalog:settledValue(catalogResult),
    serviceAttention:settledValue(serviceResult),quoteSummary:settledValue(estimateResult),
    serviceError:errorMessage(serviceResult,'Service orders'),
    errors:[errorMessage(salesResult,'Sales'),errorMessage(catalogResult,'Inventory'),errorMessage(serviceResult,'Service orders'),errorMessage(estimateResult,'Quotations')].filter(Boolean),
    loadedAt:new Date().toISOString(),
  };
}
const numberOrNull=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;

// Never turn a failed read into zero or infer a global total from a loaded page.
export function summarizeDashboardOperations(snapshot={}){
  return {
    todaySalesTotal:numberOrNull(snapshot.sales?.totalAmount),
    todaySalesCount:numberOrNull(snapshot.sales?.transactionCount),
    inventoryValue:numberOrNull(snapshot.catalog?.inventoryValue),
    catalogProductCount:numberOrNull(snapshot.catalog?.totalProducts),
    openServiceOrderCount:numberOrNull(snapshot.serviceAttention?.summary?.active),
    activeEstimateCount:numberOrNull(snapshot.quoteSummary?.activeCount),
    errors:snapshot.errors??[],loadedAt:snapshot.loadedAt??null,
  };
}

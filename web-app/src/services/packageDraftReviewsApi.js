import apiClient, { extractApiError } from './apiClient';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validRow=row=>row && UUID.test(row.id) && row.status==='draft' && typeof row.name==='string'
  && Number.isSafeInteger(row.expectedRevision) && row.expectedRevision>=0;
export async function getPackageDraftReviews(params,signal) {
  try {
    const {data}=await apiClient.get('/cms/packages/review-drafts',{params,signal});
    const p=data?.pagination;
    if (!Array.isArray(data?.packages) || !Number.isSafeInteger(p?.totalCount) || p.totalCount<0
        || !Number.isSafeInteger(p.page) || p.page<1 || !Number.isSafeInteger(p.pageSize) || p.pageSize<1 || p.pageSize>8
        || p.totalPages!==Math.max(1,Math.ceil(p.totalCount/p.pageSize)) || p.page>p.totalPages
        || data.packages.length!==Math.min(p.pageSize,Math.max(0,p.totalCount-(p.page-1)*p.pageSize)) || !data.packages.every(validRow)) {
      throw new Error('The saved draft list could not be confirmed.');
    }
    return data;
  } catch(error) {extractApiError(error,'Package drafts could not load. Open the CMS or try again.');}
}
export async function getPackageDraftReview(id,signal) {
  try {
    if (!UUID.test(id)) throw new Error('This saved draft link is not valid. Close it and choose a package from the list.');
    const {data}=await apiClient.get(`/cms/packages/review-drafts/${encodeURIComponent(id)}`,{signal});
    if (!validRow(data?.package) || data.package.id!==id.toLowerCase()) throw new Error('This saved draft could not be confirmed.');
    return data.package;
  } catch(error) {extractApiError(error,'The saved draft could not load. Your editor and recovery copy have not changed.');}
}

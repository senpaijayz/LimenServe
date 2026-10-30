import { packageError } from './managedPackageDomain.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = () => packageError('The saved draft list could not be confirmed. Refresh and try again.', 503);
export function draftReviewPage(query = {}) {
  const integer = (value, fallback, maximum) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value)<1 || Number(value)>maximum) {
      throw packageError('Choose a valid draft review page.');
    }
    return Number(value);
  };
  return {page:integer(query.page,1,10000),pageSize:integer(query.pageSize,4,8)};
}
function summary(row) {
  if (!row || !UUID.test(row.id) || row.publication_status!=='draft' || typeof row.name!=='string'
      || !Number.isSafeInteger(row.expectedRevision) || row.expectedRevision<0) throw unavailable();
  return {id:row.id,name:row.name,type:row.type,status:'draft',expectedRevision:row.expectedRevision,updatedAt:row.updated_at};
}
export function createPackageDraftReviewReader({ loadPage, loadRoot }) {
  return {
    async list(query = {}) {
      let {page,pageSize}=draftReviewPage(query);
      let result=await loadPage({p_search:'',p_type:null,p_status:'draft',p_page:page,p_page_size:pageSize});
      const count=result?.pagination?.totalCount;
      if (!Number.isSafeInteger(count) || count<0) throw unavailable();
      const last=Math.max(1,Math.ceil(count/pageSize));
      if (page>last) {
        page=last;
        result=await loadPage({p_search:'',p_type:null,p_status:'draft',p_page:page,p_page_size:pageSize});
      }
      const p=result?.pagination, total=p?.totalCount;
      if (!Array.isArray(result?.packages) || p?.page!==page || p.pageSize!==pageSize || !Number.isSafeInteger(total) || total<0
          || page>Math.max(1,Math.ceil(total/pageSize))
          || result.packages.length!==Math.min(pageSize,Math.max(0,total-(page-1)*pageSize))) throw unavailable();
      return {packages:result.packages.map(summary),pagination:{page,pageSize,totalCount:total,totalPages:Math.max(1,Math.ceil(total/pageSize))}};
    },
    async detail(id) {
      if (typeof id!=='string' || !UUID.test(id)) throw packageError('Choose a valid saved draft.');
      const row=await loadRoot(id);
      if (!row || row.publication_status!=='draft') {
        throw packageError('This package is no longer a draft. Refresh the package list to check its current status.',404);
      }
      return summary({id:row.id,name:row.package_name,type:row.package_type,publication_status:row.publication_status,expectedRevision:row.draft_revision,updated_at:row.updated_at});
    },
  };
}

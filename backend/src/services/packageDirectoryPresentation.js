import { PACKAGE_TYPES, packageError } from './managedPackageDomain.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parsePackageDirectoryQuery(query = {}, packageId = null) {
  const text = (value, fallback) => value === undefined ? fallback : typeof value === 'string' ? value : null;
  const search = text(query.search, '')?.trim(), type = text(query.type, '');
  const page = text(query.page, '1'), pageSize = text(query.pageSize, '4');
  if (search == null || [...search].length > 100 || type == null || (type && !PACKAGE_TYPES.includes(type))
      || !/^\d+$/.test(page ?? '') || Number(page)<1 || Number(page)>10000
      || !/^\d+$/.test(pageSize ?? '') || Number(pageSize)<1 || Number(pageSize)>12
      || (packageId !== null && (typeof packageId !== 'string' || !UUID.test(packageId)))) {
    throw packageError('Choose valid package search and page details.');
  }
  return {p_search:search,p_type:type,p_page:Number(page),p_page_size:Number(pageSize),p_package_id:packageId};
}

const rule = (value) => ({ mode:value.mode, verified:value.verified===true, model:value.model, family:value.family,
  engine:value.engine, make:value.make, variant:value.variant, yearFrom:value.yearFrom, yearTo:value.yearTo });
const identity = (row, fallback) => row ? [row.sku || row.code, row.name].filter(Boolean).join(' — ') : fallback;
export function presentPackageDirectoryEntry(publication, references) {
  const d = publication.definition;
  const requirements = [];
  if (d.triggerServiceId) requirements.push(`Select the service: ${identity(references.services.get(d.triggerServiceId),'service details need confirmation')}.`);
  if (d.anchorProductId) requirements.push(`Select at least ${d.minAnchorQuantity || 1} of the required part: ${identity(references.products.get(d.anchorProductId),'part details need confirmation')}.`);
  if (d.anchorCategory) requirements.push(`Select a part from ${d.anchorCategory}.`);
  return {
    id:publication.id,revisionId:publication.revisionId,revisionNumber:publication.revisionNumber,
    name:d.name,description:d.description,type:d.type,imageUrl:d.imageUrl,requirements,
    variants:d.variants.filter((v)=>v.active).map((v)=>({
      id:v.id,label:v.label,description:v.description,
      eligibility:(v.eligibility.length ? v.eligibility : d.eligibility).map(rule),
      items:v.items.filter((item)=>item.active).map((item)=>{
        const source=(item.kind==='product'?references.products:references.services).get(item.productId || item.serviceId);
        return {kind:item.kind,sku:source?.sku || source?.code || '',name:source?.name || 'Item details need confirmation',quantity:item.quantity};
      }),
    })),
  };
}

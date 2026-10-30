import { callRpc } from './supabaseRpc.js';
import { supabaseAdmin } from '../config/supabase.js';
import { selectByInChunks } from '../utils/supabaseBatchSelect.js';
import { packageError } from './managedPackageDomain.js';
import { parsePackageDirectoryQuery, presentPackageDirectoryEntry } from './packageDirectoryPresentation.js';

async function directoryReferences(publications) {
  const definitions=publications.map(p=>p.definition);
  const items=definitions.flatMap(d=>d.variants.filter(v=>v.active).flatMap(v=>v.items.filter(item=>item.active)));
  const products=[...new Set([...items.filter(i=>i.kind==='product').map(i=>i.productId),...definitions.map(d=>d.anchorProductId)].filter(Boolean))];
  const services=[...new Set([...items.filter(i=>i.kind==='service').map(i=>i.serviceId),...definitions.map(d=>d.triggerServiceId)].filter(Boolean))];
  const read=async(schema,table,select,values)=>{
    const {data,error}=await selectByInChunks({client:supabaseAdmin,schema,table,select,column:'id',values,chunkSize:75});
    if(error)throw error;return new Map((data || []).map(row=>[row.id,row]));
  };
  const [productRows,serviceRows]=await Promise.all([
    read('catalog','products','id,sku,name',products),read('operations','services','id,code,name',services),
  ]);
  return {products:productRows,services:serviceRows};
}

export async function browsePublicPackageDirectory(query = {}, packageId = null) {
  const result = await callRpc('browse_published_package_directory', parsePackageDirectoryQuery(query,packageId));
  const publications = result?.publications || [];
  if (packageId && !publications.length) throw packageError('This package is no longer published. You can still choose individual parts and services.',404);
  const references = publications.length ? await directoryReferences(publications) : {products:new Map(),services:new Map()};
  return {packages:publications.map((p)=>presentPackageDirectoryEntry(p,references)),pagination:result.pagination};
}

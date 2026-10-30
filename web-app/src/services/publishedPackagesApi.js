import apiClient, { extractApiError } from "./apiClient";

const DIRECTORY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const directoryEntryValid = (entry) => DIRECTORY_ID.test(entry?.id) && DIRECTORY_ID.test(entry?.revisionId)
  && typeof entry.name === 'string' && Array.isArray(entry.requirements) && entry.requirements.every(value=>typeof value==='string')
  && Array.isArray(entry.variants) && entry.variants.length>0 && entry.variants.every(variant=>DIRECTORY_ID.test(variant.id)
    && typeof variant.label==='string' && Array.isArray(variant.eligibility)
    && variant.eligibility.every(rule=>rule && typeof rule.mode==='string' && typeof rule.verified==='boolean') && Array.isArray(variant.items)
    && variant.items.every(item=>typeof item.name==='string' && Number.isSafeInteger(item.quantity) && item.quantity>0));

export async function getPackageVehicleConfigurations(model, year, signal) {
  try {
    return (await apiClient.get('/catalog/package-vehicle-configurations', { params: { model, year }, signal })).data.configurations || [];
  } catch (error) {
    extractApiError(error, 'Engine options could not be loaded. Engine-specific packages remain hidden.');
  }
}

export async function getPublishedPackages(params, signal) {
  try {
    return (await apiClient.get("/catalog/packages", { params, signal })).data;
  } catch (error) {
    extractApiError(
      error,
      "Packages could not be loaded. Your quote has not changed.",
    );
  }
}
export async function getPublishedPackage(id, params, signal) {
  try {
    return (
      await apiClient.get(`/catalog/packages/${encodeURIComponent(id)}`, {
        params,
        signal,
      })
    ).data.package;
  } catch (error) {
    extractApiError(
      error,
      "The current package is unavailable. Your saved price has not changed.",
    );
  }
}
export async function getPublicPackageDirectory(params = {}, signal) {
  try {
    const { data } = await apiClient.get('/catalog/package-directory', {params,signal});
    const p = data?.pagination;
    if (!Array.isArray(data?.packages) || !Number.isSafeInteger(p?.totalCount) || p.totalCount<0
        || !Number.isSafeInteger(p.page) || p.page<1 || !Number.isSafeInteger(p.pageSize) || p.pageSize<1
        || p.totalPages!==Math.max(1,Math.ceil(p.totalCount/p.pageSize)) || p.page>p.totalPages
        || data.packages.length!==Math.min(p.pageSize,Math.max(0,p.totalCount-(p.page-1)*p.pageSize))
        || !data.packages.every(directoryEntryValid)) throw new Error('The package list could not be confirmed.');
    return data;
  } catch(error) {extractApiError(error,'Packages could not load. Please try again.');}
}

export async function getPublicPackageInterest(id, signal) {
  try {
    const normalizedId = id.toLowerCase();
    const { data } = await apiClient.get(`/catalog/package-directory/${encodeURIComponent(normalizedId)}`, {signal});
    const entry = data?.packages?.[0];
    if (entry?.id !== normalizedId || !directoryEntryValid(entry)) throw new Error('This package could not be confirmed.');
    return entry;
  } catch(error) {extractApiError(error,'This package could not load. You can still build a quotation with individual items.');}
}

import apiClient, { clearApiClientCache, extractApiError } from "./apiClient";

const ROOT = "/cms/packages";
async function request(method, path = "", payload, options = {}) {
  try {
    const { data } = await apiClient.request({
      method,
      url: `${ROOT}${path}`,
      ...(method === "get" ? { params: payload } : { data: payload }),
      ...options,
    });
    return data;
  } catch (error) {
    extractApiError(
      error,
      "The package request could not be completed. Your draft has not been discarded.",
    );
  }
}
function invalidate() {
  clearApiClientCache(
    (key) =>
      key.startsWith("/catalog/packages") ||
      key.includes("/recommendations") ||
      key.startsWith("/catalog/vehicle-packages"),
  );
}
export const listManagedPackages = (params, signal) =>
  request("get", "", params, { signal });
export const getManagedPackage = async (id) =>
  (await request("get", `/${encodeURIComponent(id)}`)).package;
export const saveManagedPackage = async (draft) =>
  (await request("post", "", draft)).package;
export const previewManagedPackage = (draft, signal) =>
  request("post", "/preview", draft, { signal });
export const searchPackageProducts = (params, signal) =>
  request("get", "/products", params, { signal });
export const searchPackageServices = (params, signal) =>
  request("get", "/services", params, { signal });
export const searchPackageVehicles = (params, signal) =>
  request("get", "/vehicles", params, { signal });
export const createPackageService = async (service) => {
  const saved = (await request("post", "/services", service)).service;
  clearApiClientCache((key) => key.startsWith("/catalog/services"));
  return saved;
};
export const duplicateManagedPackage = async (id) =>
  (await request("post", `/${encodeURIComponent(id)}/duplicate`, {})).package;
export const getManagedPackageHistory = (id, params, signal) =>
  request("get", `/${encodeURIComponent(id)}/history`, params, { signal });
export async function publishManagedPackage(id, expectedRevision) {
  const result = await request("post", `/${encodeURIComponent(id)}/publish`, {
    expectedRevision,
  });
  invalidate();
  return result;
}
export async function transitionManagedPackage(id, expectedRevision, action) {
  if (!["unpublish", "archive", "restore"].includes(action))
    throw new Error("Choose a supported package action.");
  const result = await request("post", `/${encodeURIComponent(id)}/${action}`, {
    expectedRevision,
  });
  invalidate();
  return result;
}
export const previewPackageInitialization = (signal) =>
  request("get", "/initialization", undefined, { signal });
export const initializeManagedPackages = (
  candidateKeys,
  promotionPolicies = {},
) => request("post", "/initialization", { candidateKeys, promotionPolicies });

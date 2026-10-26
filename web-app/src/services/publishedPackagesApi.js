import apiClient, { extractApiError } from "./apiClient";

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

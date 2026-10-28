import apiClient, { extractApiError } from "./apiClient";
export async function getReplenishment(params, signal) {
  try {
    return (await apiClient.get("/catalog/replenishment", { params, signal }))
      .data;
  } catch (error) {
    extractApiError(
      error,
      "Replenishment could not load. Retry without changing inventory.",
    );
  }
}
export async function saveReorderSettings(items) {
  try {
    return (await apiClient.put("/catalog/replenishment", { items })).data;
  } catch (error) {
    extractApiError(
      error,
      "Settings could not be confirmed. Reload before retrying; stock quantities were not changed by this action.",
    );
  }
}

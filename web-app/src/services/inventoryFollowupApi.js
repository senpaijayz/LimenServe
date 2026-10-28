import apiClient, { extractApiError } from "./apiClient";
export async function getInventoryFollowups(params, signal) {
  try {
    return (
      await apiClient.get("/catalog/inventory-followups", { params, signal })
    ).data;
  } catch (error) {
    extractApiError(
      error,
      "Stock follow-ups could not load. Retry to check the current records.",
    );
  }
}
export async function getInventoryFollowupSummary(signal) {
  try {
    return (
      await apiClient.get("/catalog/inventory-followups/summary", { signal })
    ).data;
  } catch (error) {
    extractApiError(
      error,
      "Stock follow-ups could not load. Open Inventory to review the records.",
    );
  }
}

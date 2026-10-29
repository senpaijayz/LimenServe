import apiClient, { extractApiError } from "./apiClient";
export async function findCustomers(params, signal) {
  try {
    return (await apiClient.get("/customers", { params, signal })).data;
  } catch (error) {
    extractApiError(
      error,
      "Customer records could not load. Retry your search.",
    );
  }
}
export async function getCustomerHistory(id, params, signal) {
  try {
    return (
      await apiClient.get(`/customers/${encodeURIComponent(id)}`, {
        params,
        signal,
      })
    ).data;
  } catch (error) {
    extractApiError(
      error,
      "Customer history could not load. Retry or return to customer search.",
    );
  }
}

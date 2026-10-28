import apiClient, { extractApiError, clearApiClientCache } from "./apiClient";

async function request(run, message) {
  try {
    return (await run()).data;
  } catch (error) {
    try {
      extractApiError(error, message);
    } catch (friendly) {
      friendly.receiptRejected =
        error?.response?.data?.receiptRejected === true;
      friendly.requestRejected =
        error?.response?.data?.requestRejected === true;
      throw friendly;
    }
  }
}
export const getSupplierOrders = (params, signal) =>
  request(
    () => apiClient.get("/catalog/supplier-orders", { params, signal }),
    "Supplier orders could not load.",
  );
export const getSupplierOrder = (id, page = 1, signal) =>
  request(
    () =>
      apiClient.get(`/catalog/supplier-orders/${id}`, {
        params: { page },
        signal,
      }),
    "This supplier order could not load.",
  );
export const saveSupplierOrder = (payload) =>
  request(
    () => apiClient.post("/catalog/supplier-orders", payload),
    "The draft result could not be confirmed. Keep its request reference and retry the same draft.",
  );
export const changeSupplierOrder = (id, payload) =>
  request(
    () => apiClient.post(`/catalog/supplier-orders/${id}/actions`, payload),
    "The order action could not be confirmed. Reload the order before trying again.",
  );
export const getSupplierOrderReceipt = (id, key) =>
  request(
    () => apiClient.get(`/catalog/supplier-orders/${id}/receipts/${key}`),
    "This receipt could not load. Do not receive the same delivery again.",
  );
export async function receiveSupplierOrder(id, payload) {
  const receipt = await request(
    () =>
      apiClient.post(`/catalog/supplier-orders/${id}/receive`, payload, {
        timeout: 25000,
      }),
    "The delivery result could not be confirmed. Keep this receipt locked and retry it with the same reference.",
  );
  try {
    clearApiClientCache();
  } catch {
    /* A cache failure cannot undo an acknowledged receipt. */
  }
  return receipt;
}

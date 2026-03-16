import apiClient, { extractApiError } from './apiClient';

export async function createEstimate(payload) {
  try {
    const { data } = await apiClient.post('/estimates', payload);
    return data.estimateId;
  } catch (error) {
    extractApiError(error, 'Failed to create estimate.');
  }
}

export async function convertEstimateToSale(estimateId, paymentMethod = 'cash') {
  try {
    const { data } = await apiClient.post(`/estimates/${estimateId}/convert-sale`, {
      paymentMethod,
    });
    return data.saleId;
  } catch (error) {
    extractApiError(error, 'Failed to convert estimate to sale.');
  }
}

export async function convertEstimateToServiceOrder(estimateId, assignedTo = null) {
  try {
    const { data } = await apiClient.post(`/estimates/${estimateId}/convert-service-order`, {
      assignedTo,
    });
    return data.serviceOrderId;
  } catch (error) {
    extractApiError(error, 'Failed to convert estimate to service order.');
  }
}

export async function recordUpsellAction({
  contextType,
  contextId,
  productId,
  recommendedProductId = null,
  recommendedServiceId = null,
  action = 'shown',
  ruleId = null,
  reasonLabel = null,
}) {
  try {
    const { data } = await apiClient.post('/estimates/upsell-actions', {
      contextType,
      contextId,
      productId,
      recommendedProductId,
      recommendedServiceId,
      action,
      ruleId,
      reasonLabel,
    });
    return data.eventId;
  } catch (error) {
    extractApiError(error, 'Failed to record upsell action.');
  }
}

import apiClient, { extractApiError } from './apiClient';

export async function createEstimate(payload) {
  try {
    const { data } = await apiClient.post('/estimates', payload);
    return data.estimateId;
  } catch (error) {
    extractApiError(error, 'Failed to create estimate.');
  }
}

export async function listEstimates(search = '', limit = 20) {
  try {
    const { data } = await apiClient.get('/estimates', {
      params: { search, limit },
    });
    return data.estimates ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load quotations.');
  }
}

export async function getEstimateDetail(estimateId) {
  try {
    const { data } = await apiClient.get(`/estimates/${estimateId}`);
    return data.estimate ?? null;
  } catch (error) {
    extractApiError(error, 'Failed to load quotation details.');
  }
}

export async function updateEstimate(estimateId, payload, changeNote = null) {
  try {
    const { data } = await apiClient.patch(`/estimates/${estimateId}`, {
      ...payload,
      changeNote,
    });
    return data.revisionId;
  } catch (error) {
    extractApiError(error, 'Failed to update quotation.');
  }
}

export async function reviseEstimate(estimateId, payload, changeNote = null) {
  try {
    const { data } = await apiClient.post(`/estimates/${estimateId}/revise`, {
      ...payload,
      changeNote,
    });
    return data.revisionId;
  } catch (error) {
    extractApiError(error, 'Failed to save quotation revision.');
  }
}

export async function getEstimateRevisions(estimateId) {
  try {
    const { data } = await apiClient.get(`/estimates/${estimateId}/revisions`);
    return data.revisions ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load quotation revisions.');
  }
}

export async function lookupPublicEstimate(estimateNumber, phone) {
  try {
    const { data } = await apiClient.post('/estimates/public/lookup', {
      estimateNumber,
      phone,
    });
    return data.estimate ?? null;
  } catch (error) {
    extractApiError(error, 'Failed to retrieve quotation.');
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

import apiClient, { extractApiError } from './apiClient';

export async function createPosSale(payload) {
    try {
        const { data } = await apiClient.post('/pos/sales', payload);
        return data;
    } catch (error) {
        extractApiError(error, 'Failed to save the sale.');
    }
}

export async function listPosSales(params = {}) {
    try {
        const { data } = await apiClient.get('/pos/sales', {
            params,
        });

        return {
            sales: data.sales ?? [],
            pagination: data.pagination ?? null,
        };
    } catch (error) {
        extractApiError(error, 'Failed to load sales history.');
    }
}

export async function getPosSaleDetail(saleId) {
    try {
        const { data } = await apiClient.get(`/pos/sales/${saleId}`);
        return data;
    } catch (error) {
        extractApiError(error, 'Failed to load the receipt.');
    }
}

export async function createHistoricalPosSale(payload) {
    try {
        const { data } = await apiClient.post('/pos/sales/historical', payload);
        return data;
    } catch (error) {
        extractApiError(error, 'Failed to encode the historical sale.');
    }
}

export async function updateHistoricalPosSale(saleId, payload) {
    try {
        const { data } = await apiClient.put(`/pos/sales/${saleId}/historical`, payload);
        return data;
    } catch (error) {
        extractApiError(error, 'Failed to update the historical sale.');
    }
}

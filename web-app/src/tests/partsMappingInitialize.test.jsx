import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../services/apiClient';
import { getPartsMappingLayouts } from '../services/partsMappingApi';

vi.mock('../services/apiClient', () => ({
    default: {
        get: vi.fn(),
    },
    STOCKROOM_API_TIMEOUT_MS: 30_000,
    extractApiError: vi.fn((error) => {
        throw error;
    }),
}));

describe('parts mapping layout loading', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('surfaces a layout endpoint error after one request', async () => {
        const error = new Error('layout endpoint down');
        vi.mocked(apiClient.get).mockRejectedValue(error);

        await expect(getPartsMappingLayouts()).rejects.toThrow('layout endpoint down');
        expect(apiClient.get).toHaveBeenCalledTimes(1);
        expect(apiClient.get).toHaveBeenCalledWith('/parts-mapping/layouts', {
            timeout: 30_000,
        });
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../services/apiClient';
import { lookupPublicEstimate } from '../services/estimatesApi';

vi.mock('../services/apiClient', () => ({
    default: {
        post: vi.fn(),
    },
    extractApiError: vi.fn(),
}));

describe('lookupPublicEstimate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends both trimmed lookup factors and returns the approved response', async () => {
        const estimate = { estimate: { estimate_number: 'EST-2026-100' } };
        apiClient.post.mockResolvedValue({ data: { estimate } });

        const result = await lookupPublicEstimate('  EST-2026-100  ', '  +63 917 123 4567  ');

        expect(apiClient.post).toHaveBeenCalledWith('/estimates/public/lookup', {
            estimateNumber: 'EST-2026-100',
            phone: '+63 917 123 4567',
        });
        expect(result).toEqual(estimate);
    });
});

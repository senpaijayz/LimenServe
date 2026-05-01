import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import PartsMapping from '../modules/parts-mapping/PartsMapping';
import { getPartsMappingLayouts } from '../services/partsMappingApi';

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }) => <div data-testid="stockroom-canvas">{children}</div>,
}));

vi.mock('../modules/parts-mapping/Scene3D', () => ({
    default: () => <div data-testid="mock-scene" />,
}));

vi.mock('../services/partsMappingApi', () => ({
    getPartsMappingLayouts: vi.fn(),
    createPartsMappingLayout: vi.fn(),
    updatePartsMappingLayout: vi.fn(),
    deletePartsMappingLayout: vi.fn(),
    setPriorityPartsMappingLayout: vi.fn(),
}));

describe('PartsMapping initialization', () => {
    beforeEach(() => {
        localStorage.clear();
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: true,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
        vi.mocked(getPartsMappingLayouts).mockRejectedValue(new Error('layout endpoint down'));
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('settles into a safe stockroom shell instead of retrying forever', async () => {
        render(
            <ToastProvider>
                <PartsMapping />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(document.body.textContent).toContain('layout endpoint down');
        });

        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });

        expect(getPartsMappingLayouts).toHaveBeenCalledTimes(1);
        expect(document.body.textContent).not.toContain('Loading Warehouse Digital Twin...');
    });
});

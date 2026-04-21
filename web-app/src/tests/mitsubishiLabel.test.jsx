import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MitsubishiGenuinePartsLabel from '../modules/inventory/components/MitsubishiGenuinePartsLabel';
import { printProductLabelNode } from '../modules/inventory/utils/printProductLabel';

const product = {
    name: 'Riken CP38 (Sandpaper)',
    sku: 'DP010374',
};

describe('Mitsubishi genuine parts label', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('renders the Mitsubishi sticker header with the official logo asset and sample-like defaults', () => {
        render(<MitsubishiGenuinePartsLabel product={product} quantity={1} />);

        expect(screen.getByAltText('Mitsubishi Motors')).toBeTruthy();
        expect(screen.getByText('GENUINE PARTS')).toBeTruthy();
        expect(screen.getByText('R')).toBeTruthy();
        expect(screen.getByText('MA')).toBeTruthy();
        expect(screen.getByText('MADE IN JAPAN')).toBeTruthy();
    });

    it('writes print output with sticker-specific sizing and print color fidelity', () => {
        vi.useFakeTimers();

        const written = [];
        const fakeWindow = {
            document: {
                open: vi.fn(),
                write: vi.fn((html) => written.push(html)),
                close: vi.fn(),
            },
            focus: vi.fn(),
            print: vi.fn(),
            close: vi.fn(),
        };

        vi.spyOn(window, 'open').mockReturnValue(fakeWindow);

        const node = document.createElement('div');
        node.setAttribute('data-product-label-root', 'true');
        node.innerHTML = '<span>DP010374</span>';

        const result = printProductLabelNode(node, 'DP010374 label');

        expect(result).toBe(true);
        vi.runAllTimers();

        const html = written.join('\n');

        expect(html).toContain('print-color-adjust: exact');
        expect(html).toContain('92mm');
        expect(html).toContain('data-product-label-root="true"');
        expect(fakeWindow.print).toHaveBeenCalledTimes(1);
    });
});

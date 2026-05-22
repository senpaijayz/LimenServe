import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../components/ui/BarcodeDisplay', () => ({
    default: ({ value, size }) => (
        <div data-testid="barcode-display" data-value={value} data-size={size} />
    ),
}));

import LargeBarcodeModal from '../components/ui/LargeBarcodeModal';

describe('LargeBarcodeModal', () => {
    it('shows a large scannable barcode with operator instructions', () => {
        render(
            <LargeBarcodeModal
                isOpen
                onClose={vi.fn()}
                barcodeValue="DP010374 0001"
                title="Digital barcode"
            />
        );

        expect(screen.getByText('Digital barcode')).toBeTruthy();
        expect(screen.getByText(/point your camera here to scan/i)).toBeTruthy();
        expect(screen.getByTestId('barcode-display').getAttribute('data-size')).toBe('large');
        expect(screen.getByTestId('barcode-display').getAttribute('data-value')).toBe('DP010374 0001');
    });

    it('copies the barcode value when clipboard access is available', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: { writeText },
        });

        render(
            <LargeBarcodeModal
                isOpen
                onClose={vi.fn()}
                barcodeValue="DP010374 0001"
            />
        );

        fireEvent.click(screen.getByText(/copy barcode value/i));

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledWith('DP010374 0001');
        });
        expect(screen.getByText('Copied')).toBeTruthy();
    });
});

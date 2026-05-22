import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { barcodeSpy } = vi.hoisted(() => ({
    barcodeSpy: vi.fn(() => <svg data-testid="mock-barcode" />),
}));

vi.mock('react-barcode', () => ({
    default: barcodeSpy,
}));

import BarcodeDisplay from '../components/ui/BarcodeDisplay';

describe('BarcodeDisplay', () => {
    it('renders CODE128 by default with scanning-friendly normal settings', () => {
        render(<BarcodeDisplay value="DP010374" />);

        expect(screen.getByTestId('mock-barcode')).toBeTruthy();
        expect(barcodeSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                value: 'DP010374',
                format: 'CODE128',
                displayValue: false,
                background: '#ffffff',
                lineColor: '#050505',
                margin: 24,
                width: 1.35,
                height: 72,
            }),
            undefined
        );
    });

    it('uses larger bars and quiet zone for the large scan view', () => {
        render(<BarcodeDisplay value="DP010374" size="large" displayValue />);

        expect(barcodeSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                format: 'CODE128',
                displayValue: true,
                margin: 40,
                width: 2.1,
                height: 132,
                fontSize: 18,
            }),
            undefined
        );
    });
});

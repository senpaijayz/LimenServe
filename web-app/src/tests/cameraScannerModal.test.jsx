import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { constructorSpy, MockHtml5QrcodeScanner } = vi.hoisted(() => {
    const hoistedClearSpy = vi.fn().mockResolvedValue(undefined);
    const hoistedConstructorSpy = vi.fn();

    class HoistedMockHtml5QrcodeScanner {
        constructor(...args) {
            hoistedConstructorSpy(...args);
        }

        render() {}

        clear = hoistedClearSpy
    }

    return {
        constructorSpy: hoistedConstructorSpy,
        MockHtml5QrcodeScanner: HoistedMockHtml5QrcodeScanner,
    };
});

vi.mock('html5-qrcode', () => ({
    Html5QrcodeScanner: MockHtml5QrcodeScanner,
    Html5QrcodeSupportedFormats: {
        CODE_39: 'CODE_39',
        CODE_128: 'CODE_128',
    },
}));

import CameraScannerModal from '../components/ui/CameraScannerModal';

describe('CameraScannerModal', () => {
    it('configures the scanner to support code 39 product barcodes', async () => {
        render(
            <CameraScannerModal
                isOpen
                onClose={vi.fn()}
                onScan={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(constructorSpy).toHaveBeenCalledTimes(1);
        });

        expect(constructorSpy).toHaveBeenCalledWith(
            'reader',
            expect.objectContaining({
                formatsToSupport: ['CODE_39', 'CODE_128'],
            }),
            false
        );
    });
});

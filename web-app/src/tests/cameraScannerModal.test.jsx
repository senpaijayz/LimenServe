import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { constructorSpy, renderSpy, MockHtml5QrcodeScanner } = vi.hoisted(() => {
    const hoistedClearSpy = vi.fn().mockResolvedValue(undefined);
    const hoistedConstructorSpy = vi.fn();
    const hoistedRenderSpy = vi.fn();

    class HoistedMockHtml5QrcodeScanner {
        constructor(...args) {
            hoistedConstructorSpy(...args);
        }

        render(...args) {
            hoistedRenderSpy(...args);
        }

        clear = hoistedClearSpy
    }

    return {
        constructorSpy: hoistedConstructorSpy,
        renderSpy: hoistedRenderSpy,
        MockHtml5QrcodeScanner: HoistedMockHtml5QrcodeScanner,
    };
});

vi.mock('html5-qrcode', () => ({
    Html5QrcodeScanner: MockHtml5QrcodeScanner,
    Html5QrcodeSupportedFormats: {
        CODE_39: 'CODE_39',
        CODE_128: 'CODE_128',
        EAN_13: 'EAN_13',
        UPC_A: 'UPC_A',
    },
    Html5QrcodeScanType: {
        SCAN_TYPE_CAMERA: 'SCAN_TYPE_CAMERA',
    },
}));

import CameraScannerModal from '../components/ui/CameraScannerModal';

describe('CameraScannerModal', () => {
    afterEach(() => {
        cleanup();
        constructorSpy.mockClear();
        renderSpy.mockClear();
    });

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
                fps: 18,
                aspectRatio: 1.777778,
                disableFlip: true,
                qrbox: expect.any(Function),
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: true,
                showZoomSliderIfSupported: false,
                formatsToSupport: ['CODE_39', 'CODE_128', 'EAN_13', 'UPC_A'],
                supportedScanTypes: ['SCAN_TYPE_CAMERA'],
            }),
            false
        );

        const [, scannerConfig] = constructorSpy.mock.calls[0];
        expect(scannerConfig.qrbox(390, 640)).toEqual({ width: 358, height: 217 });
    });

    it('ignores empty scan callbacks instead of closing with an invalid code', async () => {
        const onClose = vi.fn();
        const onScan = vi.fn();

        render(
            <CameraScannerModal
                isOpen
                onClose={onClose}
                onScan={onScan}
            />
        );

        await waitFor(() => {
            expect(renderSpy).toHaveBeenCalledTimes(1);
        });

        const [handleSuccess] = renderSpy.mock.calls[0];
        handleSuccess(undefined);
        handleSuccess('   ');

        expect(onScan).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('normalizes valid barcode text before handing it to the parent flow', async () => {
        const onClose = vi.fn();
        const onScan = vi.fn();

        render(
            <CameraScannerModal
                isOpen
                onClose={onClose}
                onScan={onScan}
            />
        );

        await waitFor(() => {
            expect(renderSpy).toHaveBeenCalledTimes(1);
        });

        const [handleSuccess] = renderSpy.mock.calls[0];
        handleSuccess('* 4013A310 0001 *');

        expect(onScan).toHaveBeenCalledWith('4013A3100001');
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { constructorSpy, renderSpy, fileScannerConstructorSpy, scanFileSpy, MockHtml5QrcodeScanner, MockHtml5Qrcode } = vi.hoisted(() => {
    const hoistedClearSpy = vi.fn().mockResolvedValue(undefined);
    const hoistedConstructorSpy = vi.fn();
    const hoistedRenderSpy = vi.fn();
    const hoistedFileScannerConstructorSpy = vi.fn();
    const hoistedScanFileSpy = vi.fn();

    class HoistedMockHtml5QrcodeScanner {
        constructor(...args) {
            hoistedConstructorSpy(...args);
        }

        render(...args) {
            hoistedRenderSpy(...args);
        }

        clear = hoistedClearSpy
    }

    class HoistedMockHtml5Qrcode {
        constructor(...args) {
            hoistedFileScannerConstructorSpy(...args);
        }

        scanFile = hoistedScanFileSpy
    }

    return {
        constructorSpy: hoistedConstructorSpy,
        renderSpy: hoistedRenderSpy,
        fileScannerConstructorSpy: hoistedFileScannerConstructorSpy,
        scanFileSpy: hoistedScanFileSpy,
        MockHtml5QrcodeScanner: HoistedMockHtml5QrcodeScanner,
        MockHtml5Qrcode: HoistedMockHtml5Qrcode,
    };
});

vi.mock('html5-qrcode', () => ({
    Html5Qrcode: MockHtml5Qrcode,
    Html5QrcodeScanner: MockHtml5QrcodeScanner,
    Html5QrcodeSupportedFormats: {
        QR_CODE: 'QR_CODE',
        AZTEC: 'AZTEC',
        CODABAR: 'CODABAR',
        CODE_39: 'CODE_39',
        CODE_93: 'CODE_93',
        CODE_128: 'CODE_128',
        DATA_MATRIX: 'DATA_MATRIX',
        MAXICODE: 'MAXICODE',
        ITF: 'ITF',
        EAN_13: 'EAN_13',
        EAN_8: 'EAN_8',
        PDF_417: 'PDF_417',
        RSS_14: 'RSS_14',
        RSS_EXPANDED: 'RSS_EXPANDED',
        UPC_A: 'UPC_A',
        UPC_E: 'UPC_E',
        UPC_EAN_EXTENSION: 'UPC_EAN_EXTENSION',
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
        fileScannerConstructorSpy.mockClear();
        scanFileSpy.mockReset();
    });

    it('configures the scanner to prefer the back camera and support code 128 product barcodes', async () => {
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
                useBarCodeDetectorIfSupported: true,
                showTorchButtonIfSupported: true,
                showZoomSliderIfSupported: false,
                preferredCamera: 'environment',
                videoConstraints: {
                    facingMode: { ideal: 'environment' },
                },
                formatsToSupport: [
                    'QR_CODE',
                    'AZTEC',
                    'CODABAR',
                    'CODE_39',
                    'CODE_93',
                    'CODE_128',
                    'DATA_MATRIX',
                    'MAXICODE',
                    'ITF',
                    'EAN_13',
                    'EAN_8',
                    'PDF_417',
                    'RSS_14',
                    'RSS_EXPANDED',
                    'UPC_A',
                    'UPC_E',
                    'UPC_EAN_EXTENSION',
                ],
                supportedScanTypes: ['SCAN_TYPE_CAMERA'],
            }),
            false
        );

        const [, scannerConfig] = constructorSpy.mock.calls[0];
        expect(scannerConfig.qrbox(390, 640)).toEqual({ width: 374, height: 442 });
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

    it('normalizes valid barcode text to the primary part number before handing it to the parent flow', async () => {
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

        expect(onScan).toHaveBeenCalledWith('4013A310');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('accepts Mitsubishi physical barcodes that encode the fixed quantity suffix', async () => {
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
        handleSuccess('1810A4270001');

        expect(onScan).toHaveBeenCalledWith('1810A427');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('scans an uploaded barcode image as a fallback when camera scanning is unreliable', async () => {
        const onClose = vi.fn();
        const onScan = vi.fn();
        scanFileSpy.mockResolvedValue('* DP010374 0001 *');

        render(
            <CameraScannerModal
                isOpen
                onClose={onClose}
                onScan={onScan}
            />
        );

        const file = new File(['barcode'], 'barcode.png', { type: 'image/png' });
        fireEvent.change(screen.getByLabelText(/upload barcode image/i), {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(scanFileSpy).toHaveBeenCalledWith(file, true);
        });
        expect(fileScannerConstructorSpy).toHaveBeenCalledWith('reader-file-scanner', expect.objectContaining({
            useBarCodeDetectorIfSupported: true,
            formatsToSupport: expect.arrayContaining(['QR_CODE', 'DATA_MATRIX', 'PDF_417', 'CODE_128']),
        }));
        expect(onScan).toHaveBeenCalledWith('DP010374');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('retries uploaded barcode images with a generated quiet zone when the raw crop is too tight', async () => {
        const onClose = vi.fn();
        const onScan = vi.fn();
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        const OriginalImage = globalThis.Image;
        const originalCreateElement = document.createElement.bind(document);
        const createElementSpy = vi.spyOn(document, 'createElement');

        URL.createObjectURL = vi.fn(() => 'blob:barcode');
        URL.revokeObjectURL = vi.fn();
        globalThis.Image = class {
            naturalWidth = 210
            naturalHeight = 88
            onload = null
            onerror = null

            set src(_value) {
                queueMicrotask(() => this.onload?.());
            }
        };
        createElementSpy.mockImplementation((tagName, options) => {
            if (tagName === 'canvas') {
                return {
                    width: 0,
                    height: 0,
                    getContext: () => ({
                        fillStyle: '',
                        fillRect: vi.fn(),
                        drawImage: vi.fn(),
                    }),
                    toBlob: (callback) => callback(new Blob(['padded'], { type: 'image/png' })),
                };
            }

            return originalCreateElement(tagName, options);
        });

        scanFileSpy
            .mockRejectedValueOnce(new Error('too tight'))
            .mockResolvedValueOnce('* DP010374 0001 *');

        render(
            <CameraScannerModal
                isOpen
                onClose={onClose}
                onScan={onScan}
            />
        );

        const file = new File(['barcode'], 'cropped-barcode.png', { type: 'image/png' });
        fireEvent.change(screen.getByLabelText(/upload barcode image/i), {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(scanFileSpy).toHaveBeenCalledTimes(2);
        });

        expect(scanFileSpy.mock.calls[0]).toEqual([file, true]);
        expect(scanFileSpy.mock.calls[1][0]).toBeInstanceOf(File);
        expect(scanFileSpy.mock.calls[1][0].name).toBe('quiet-zone-cropped-barcode.png');
        expect(onScan).toHaveBeenCalledWith('DP010374');
        expect(onClose).toHaveBeenCalledTimes(1);

        createElementSpy.mockRestore();
        URL.createObjectURL = originalCreateObjectUrl;
        URL.revokeObjectURL = originalRevokeObjectUrl;
        globalThis.Image = OriginalImage;
    });

    it('lets staff submit the printed part number when a damaged label will not decode', async () => {
        const onClose = vi.fn();
        const onScan = vi.fn();

        render(
            <CameraScannerModal
                isOpen
                onClose={onClose}
                onScan={onScan}
            />
        );

        fireEvent.change(screen.getByLabelText(/enter the printed part number/i), {
            target: { value: '21305W010P 0001' },
        });
        fireEvent.click(screen.getByText('Use Part Number'));

        expect(onScan).toHaveBeenCalledWith('21305W010P');
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

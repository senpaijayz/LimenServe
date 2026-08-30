import { useCallback, useEffect, useState } from 'react';
import {
    Html5Qrcode,
    Html5QrcodeScanner,
    Html5QrcodeSupportedFormats,
    Html5QrcodeScanType,
} from 'html5-qrcode';
import { Camera, ImageUp, Zap, ScanLine } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import { normalizeBarcodeToken, stripProductBarcodeSuffix } from '../../utils/barcode';

// This scanner is used for physical product labels, so keep the decoder on
// one-dimensional formats. Asking ZXing to try every 2D format on every frame
// makes dense Code 39 labels noticeably harder to acquire on mobile devices.
const PRODUCT_BARCODE_FORMATS = [
    Html5QrcodeSupportedFormats.CODABAR,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
].filter((format) => format !== undefined);

const getBarcodeScanBox = (viewfinderWidth, viewfinderHeight) => {
    const safeWidth = Math.max(1, Math.floor(Number(viewfinderWidth) || 0));
    const safeHeight = Math.max(1, Math.floor(Number(viewfinderHeight) || 0));
    const width = Math.min(
        safeWidth,
        680,
        Math.max(50, Math.floor(safeWidth * 0.92)),
    );
    const desiredHeight = Math.max(96, Math.round(width * 0.32));
    const verticalBudget = Math.min(
        safeHeight,
        Math.max(50, Math.floor(safeHeight * 0.58)),
    );
    const height = Math.min(220, desiredHeight, verticalBudget);

    return { width, height };
};

const normalizeScannedBarcode = (value) => (
    stripProductBarcodeSuffix(normalizeBarcodeToken(value))
);

const BARCODE_PHOTO_CROP_PRESETS = [
    { startY: 0.18, height: 0.32, insetX: 0.06, enhance: false },
    { startY: 0.34, height: 0.32, insetX: 0.06, enhance: false },
    { startY: 0.48, height: 0.32, insetX: 0.06, enhance: false },
    { startY: 0.50, height: 0.24, insetX: 0.14, enhance: true },
    { startY: 0.58, height: 0.20, insetX: 0.16, enhance: true },
];

const createBarcodePhotoVariants = async (file) => {
    if (typeof document === 'undefined' || !file?.type?.startsWith('image/')) {
        return [];
    }

    const imageUrl = URL.createObjectURL(file);

    try {
        const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = imageUrl;
        });
        const variants = [];

        for (const [index, preset] of BARCODE_PHOTO_CROP_PRESETS.entries()) {
            const insetX = Math.round(image.naturalWidth * preset.insetX);
            const cropWidth = image.naturalWidth - insetX * 2;
            const cropHeight = Math.round(image.naturalHeight * preset.height);
            const cropY = Math.min(
                Math.round(image.naturalHeight * preset.startY),
                image.naturalHeight - cropHeight,
            );
            const quietZone = Math.max(48, Math.round(cropWidth * 0.06));
            const canvas = document.createElement('canvas');
            canvas.width = cropWidth + quietZone * 2;
            canvas.height = cropHeight + quietZone * 2;

            const context = canvas.getContext('2d');
            if (!context) {
                continue;
            }

            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            if (preset.enhance) {
                context.filter = 'grayscale(1) contrast(2) brightness(1.08)';
            }
            context.drawImage(
                image,
                insetX,
                cropY,
                cropWidth,
                cropHeight,
                quietZone,
                quietZone,
                cropWidth,
                cropHeight,
            );

            const blob = await new Promise((resolve) => {
                canvas.toBlob(resolve, 'image/png', 1);
            });

            if (blob) {
                variants.push(new File(
                    [blob],
                    `barcode-crop-${index + 1}-${file.name || 'photo.png'}`,
                    {
                        type: 'image/png',
                        lastModified: Date.now(),
                    },
                ));
            }
        }

        return variants;
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
};

/**
 * Camera Scanner Modal Component
 * Displays a live camera feed for scanning barcodes using html5-qrcode.
 */
const CameraScannerModal = ({ isOpen, onClose, onScan }) => {
    const [manualCode, setManualCode] = useState('');
    const [fileScanStatus, setFileScanStatus] = useState('');

    const completeScan = useCallback((decodedText) => {
        const normalizedCode = normalizeScannedBarcode(decodedText);

        if (!normalizedCode) {
            return false;
        }

        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(80);
        }

        onScan(normalizedCode);
        setManualCode('');
        setFileScanStatus('');
        onClose();
        return true;
    }, [onClose, onScan]);

    useEffect(() => {
        let scanner = null;

        if (isOpen) {
            // Initialize scanner
            scanner = new Html5QrcodeScanner(
                "reader",
                {
                    fps: 12,
                    qrbox: getBarcodeScanBox,
                    aspectRatio: 1.777778,
                    disableFlip: true,
                    rememberLastUsedCamera: true,
                    // BarcodeDetector integration in html5-qrcode is experimental
                    // and can fail when Safari exposes only part of the requested
                    // format set. ZXing is slower but consistent across iOS/Android.
                    useBarCodeDetectorIfSupported: false,
                    videoConstraints: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
                    showTorchButtonIfSupported: true,
                    // html5-qrcode assumes zoom capability.step is always a
                    // number. Safari on iPhone can expose zoom without that
                    // field, which crashes the scanner while the camera is live.
                    showZoomSliderIfSupported: false,
                    formatsToSupport: PRODUCT_BARCODE_FORMATS,
                },
                /* verbose= */ false
            );

            scanner.render(
                (decodedText) => {
                    if (!completeScan(decodedText)) {
                        return;
                    }

                    scanner.clear().catch(error => {
                        console.error("Failed to clear html5QrcodeScanner. ", error);
                    });
                },
                () => {
                    // Failure callback - usually constantly firing as it fails to find a barcode every frame.
                    // We only want to show actual initialization errors, not frame scan failures.
                    // console.warn(`Code scan error = ${error}`);
                }
            );
        }

        // Cleanup function
        return () => {
            if (scanner && isOpen) {
                scanner.clear().catch(error => {
                    console.error("Failed to clear html5QrcodeScanner. ", error);
                });
            }
        };
    }, [completeScan, isOpen]);

    if (!isOpen) return null;

    const submitManualCode = () => {
        completeScan(manualCode);
    };

    const scanUploadedFile = async (event) => {
        const [file] = Array.from(event.target.files || []);
        event.target.value = '';

        if (!file) {
            return;
        }

        setFileScanStatus('Scanning image...');

        let imageScanner = null;

        try {
            imageScanner = new Html5Qrcode('reader-file-scanner', {
                formatsToSupport: PRODUCT_BARCODE_FORMATS,
                useBarCodeDetectorIfSupported: false,
            });
            let decodedText;

            try {
                decodedText = await imageScanner.scanFile(file, true);
            } catch (scanError) {
                const photoVariants = await createBarcodePhotoVariants(file);

                if (photoVariants.length === 0) {
                    throw scanError;
                }

                for (const [index, photoVariant] of photoVariants.entries()) {
                    setFileScanStatus(`Enhancing barcode photo (${index + 1}/${photoVariants.length})...`);
                    try {
                        decodedText = await imageScanner.scanFile(photoVariant, true);
                        break;
                    } catch {
                        // Try the next horizontal band. Product labels are often
                        // only a small part of a full portrait phone photo.
                    }
                }

                if (!decodedText) {
                    throw scanError;
                }
            }

            if (!completeScan(decodedText)) {
                setFileScanStatus('No barcode found in that image.');
            }
        } catch {
            setFileScanStatus('No barcode found. Try a sharper photo with the full barcode visible.');
        } finally {
            try {
                imageScanner?.clear?.();
            } catch {
                // The file decoder is already disposable; cleanup must not hide
                // a successful scan on browsers where clear() is synchronous.
            }
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Camera Barcode Scanner"
            size="md"
        >
            <div className="space-y-3">
                <div className="rounded-2xl border border-primary-200 bg-primary-50/80 p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-accent-blue shadow-sm sm:flex">
                            <ScanLine className="h-5 w-5" />
                        </div>
                        <div className="space-y-1 text-sm text-primary-600 sm:space-y-2">
                            <p className="font-semibold text-primary-900">Keep the barcode horizontal and fill most of the guide.</p>
                            <p className="text-xs sm:text-sm">Hold the phone 12–20 cm away and tilt glossy boxes slightly to remove glare.</p>
                            <div className="hidden flex-wrap gap-2 text-xs uppercase tracking-wide text-primary-500 sm:flex">
                                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1">
                                    <Camera className="h-3.5 w-3.5" /> Back camera first
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1">
                                    <Zap className="h-3.5 w-3.5" /> Torch when supported
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1">
                                    <ScanLine className="h-3.5 w-3.5" /> Hold steady to focus
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative flex min-h-[180px] items-center justify-center overflow-hidden rounded-xl border border-primary-200 bg-primary-950 sm:min-h-[240px]">
                    {/* The div where html5-qrcode will render the video element */}
                    <div id="reader" className="w-full" />

                </div>
                <div id="reader-file-scanner" className="hidden" />

                <details className="group rounded-xl border border-primary-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-primary-800 marker:content-none">
                        <span className="inline-flex items-center gap-2">
                            <ImageUp className="h-4 w-4 text-accent-blue" />
                            Other scan options
                        </span>
                        <span className="text-xs font-medium text-primary-400 group-open:hidden">Photo or part number</span>
                        <span className="hidden text-xs font-medium text-primary-400 group-open:inline">Hide</span>
                    </summary>
                    <div className="grid gap-3 border-t border-primary-100 p-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-primary-50 p-3">
                            <label className="block text-xs font-semibold text-primary-600" htmlFor="barcode-image-upload">
                                Take or choose a barcode photo
                            </label>
                            <input
                                id="barcode-image-upload"
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="mt-2 block w-full text-xs text-primary-600 file:mr-2 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
                                onChange={scanUploadedFile}
                            />
                            {fileScanStatus && (
                                <p className="mt-2 text-xs font-medium text-primary-500">{fileScanStatus}</p>
                            )}
                        </div>

                        <div className="rounded-xl bg-primary-50 p-3">
                            <label className="block text-xs font-semibold text-primary-600" htmlFor="manual-barcode-entry">
                                Enter printed part number
                            </label>
                            <div className="mt-2 flex gap-2">
                                <input
                                    id="manual-barcode-entry"
                                    className="input min-w-0 flex-1 font-mono text-sm uppercase"
                                    value={manualCode}
                                    onChange={(event) => setManualCode(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            submitManualCode();
                                        }
                                    }}
                                    placeholder="21305W010P"
                                />
                                <Button variant="secondary" onClick={submitManualCode} disabled={!manualCode.trim()}>
                                    Use Part Number
                                </Button>
                            </div>
                        </div>
                    </div>
                </details>

                {/* CSS Override for html5-qrcode default styling to make it look decent */}
                <style>{`
                    #reader__dashboard_section_csr span {
                        font-family: inherit;
                        color: #0f172a;
                    }
                    #reader__dashboard_section_csr button {
                        background-color: #3b82f6;
                        color: white;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 6px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }
                    #reader__dashboard_section_csr button:hover {
                        background-color: #2563eb;
                    }
                    #reader__dashboard_section_swaplink {
                        color: #3b82f6;
                        text-decoration: underline;
                    }
                    #reader__dashboard_section {
                        padding: 12px;
                    }
                    #reader__camera_selection {
                        margin-bottom: 12px;
                        padding: 8px;
                        border-radius: 6px;
                        border: 1px solid #e2e8f0;
                        width: 100%;
                        max-width: 300px;
                    }
                    #reader__dashboard_section_csr input[type="range"] {
                        width: min(100%, 280px);
                        accent-color: #2563eb;
                    }
                    #reader {
                        border: 0 !important;
                    }
                    #reader video {
                        width: 100% !important;
                        height: auto !important;
                        max-height: min(38svh, 320px);
                        aspect-ratio: 16 / 9;
                        object-fit: cover;
                    }
                    #reader__scan_region {
                        background: #020617;
                        overflow: hidden;
                    }
                    #reader__scan_region img {
                        max-width: 92%;
                    }
                    #reader__scan_region > div {
                        box-shadow: 0 0 0 9999px rgba(2, 6, 23, 0.34);
                    }
                `}</style>

                <div className="flex justify-end">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default CameraScannerModal;

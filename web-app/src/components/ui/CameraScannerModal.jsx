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

const ALL_SUPPORTED_BARCODE_FORMATS = [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.AZTEC,
    Html5QrcodeSupportedFormats.CODABAR,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.DATA_MATRIX,
    Html5QrcodeSupportedFormats.MAXICODE,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.PDF_417,
    Html5QrcodeSupportedFormats.RSS_14,
    Html5QrcodeSupportedFormats.RSS_EXPANDED,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
].filter((format) => format !== undefined);

const getBarcodeScanBox = (viewfinderWidth, viewfinderHeight) => {
    const width = Math.max(300, Math.min(Math.floor(viewfinderWidth * 0.96), 680));
    const height = Math.max(280, Math.min(Math.round(viewfinderHeight * 0.69), 500));

    return { width, height };
};

const normalizeScannedBarcode = (value) => (
    stripProductBarcodeSuffix(normalizeBarcodeToken(value))
);

const createBarcodeImageWithQuietZone = async (file) => {
    if (typeof document === 'undefined' || !file?.type?.startsWith('image/')) {
        return null;
    }

    const imageUrl = URL.createObjectURL(file);

    try {
        const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = imageUrl;
        });

        const quietZone = Math.max(48, Math.round(Math.min(image.naturalWidth, image.naturalHeight) * 0.24));
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth + quietZone * 2;
        canvas.height = image.naturalHeight + quietZone * 2;

        const context = canvas.getContext('2d');
        if (!context) {
            return null;
        }

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, quietZone, quietZone);

        const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, file.type || 'image/png', 1);
        });

        if (!blob) {
            return null;
        }

        return new File([blob], `quiet-zone-${file.name || 'barcode.png'}`, {
            type: blob.type || file.type || 'image/png',
            lastModified: Date.now(),
        });
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
                    fps: 18,
                    qrbox: getBarcodeScanBox,
                    aspectRatio: 1.777778,
                    disableFlip: true,
                    rememberLastUsedCamera: true,
                    useBarCodeDetectorIfSupported: true,
                    preferredCamera: 'environment',
                    videoConstraints: {
                        facingMode: { ideal: 'environment' },
                    },
                    supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
                    showTorchButtonIfSupported: true,
                    showZoomSliderIfSupported: false,
                    formatsToSupport: ALL_SUPPORTED_BARCODE_FORMATS,
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
                formatsToSupport: ALL_SUPPORTED_BARCODE_FORMATS,
                useBarCodeDetectorIfSupported: true,
            });
            let decodedText;

            try {
                decodedText = await imageScanner.scanFile(file, true);
            } catch (scanError) {
                const paddedFile = await createBarcodeImageWithQuietZone(file);

                if (!paddedFile) {
                    throw scanError;
                }

                setFileScanStatus('Retrying with scanner-friendly padding...');
                decodedText = await imageScanner.scanFile(paddedFile, true);
            }

            if (!completeScan(decodedText)) {
                setFileScanStatus('No barcode found in that image.');
            }
        } catch {
            setFileScanStatus('No barcode found. Try a sharper photo with the full barcode visible.');
        } finally {
            imageScanner?.clear?.().catch(() => {});
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Camera Barcode Scanner"
            size="md"
        >
            <div className="space-y-4">
                <div className="rounded-2xl border border-primary-200 bg-primary-50/80 p-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-accent-blue shadow-sm">
                            <ScanLine className="h-5 w-5" />
                        </div>
                        <div className="space-y-2 text-sm text-primary-600">
                            <p className="font-semibold text-primary-900">Keep the part number and barcode bars inside the guide.</p>
                            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-wide text-primary-500">
                                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1">
                                    <Camera className="h-3.5 w-3.5" /> Back camera first
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1">
                                    <Zap className="h-3.5 w-3.5" /> Torch when supported
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-primary-50 border border-primary-200 rounded-xl overflow-hidden relative min-h-[360px] flex items-center justify-center">
                    {/* The div where html5-qrcode will render the video element */}
                    <div id="reader" className="w-full" />

                </div>
                <div id="reader-file-scanner" className="hidden" />

                <div className="rounded-xl border border-primary-200 bg-white p-3">
                    <label className="block text-xs font-semibold text-primary-500" htmlFor="barcode-image-upload">
                        Upload barcode image
                    </label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                            id="barcode-image-upload"
                            type="file"
                            accept="image/*"
                            className="block w-full text-sm text-primary-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-200"
                            onChange={scanUploadedFile}
                        />
                        <span className="inline-flex items-center gap-1 text-xs text-primary-500">
                            <ImageUp className="h-3.5 w-3.5" />
                            Use when camera access fails
                        </span>
                    </div>
                    {fileScanStatus && (
                        <p className="mt-2 text-xs font-medium text-primary-500">{fileScanStatus}</p>
                    )}
                </div>

                <div className="rounded-xl border border-primary-200 bg-white p-3">
                    <label className="block text-xs font-semibold text-primary-500" htmlFor="manual-barcode-entry">
                        If the sticker is scratched or glossy, enter the printed part number
                    </label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                            id="manual-barcode-entry"
                            className="input flex-1 font-mono text-sm uppercase"
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
                        object-fit: cover;
                    }
                    #reader__scan_region {
                        background: #020617;
                    }
                    #reader__scan_region img {
                        max-width: 92%;
                    }
                    #reader__scan_region > div {
                        box-shadow: 0 0 0 9999px rgba(2, 6, 23, 0.34);
                    }
                `}</style>

                <div className="flex justify-end pt-2">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default CameraScannerModal;

import { useEffect } from 'react';
import {
    Html5QrcodeScanner,
    Html5QrcodeSupportedFormats,
    Html5QrcodeScanType,
} from 'html5-qrcode';
import { Camera, Zap, ScanLine } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import { normalizeBarcodeToken } from '../../utils/barcode';

const getBarcodeScanBox = (viewfinderWidth, viewfinderHeight) => {
    const width = Math.max(260, Math.min(Math.floor(viewfinderWidth * 0.92), 520));
    const height = Math.max(120, Math.min(Math.floor(viewfinderHeight * 0.34), 220));

    return { width, height };
};

/**
 * Camera Scanner Modal Component
 * Displays a live camera feed for scanning barcodes using html5-qrcode.
 */
const CameraScannerModal = ({ isOpen, onClose, onScan }) => {
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
                    supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
                    showTorchButtonIfSupported: true,
                    showZoomSliderIfSupported: false,
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.UPC_A,
                    ],
                },
                /* verbose= */ false
            );

            scanner.render(
                (decodedText) => {
                    const normalizedCode = normalizeBarcodeToken(decodedText);

                    if (!normalizedCode) {
                        return;
                    }

                    onScan(normalizedCode);
                    scanner.clear().catch(error => {
                        console.error("Failed to clear html5QrcodeScanner. ", error);
                    });
                    onClose();
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
    }, [isOpen, onClose, onScan]);

    if (!isOpen) return null;

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
                            <p className="font-semibold text-primary-900">Center the barcode inside the guide and keep the label steady.</p>
                            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-wide text-primary-500">
                                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1">
                                    <Camera className="h-3.5 w-3.5" /> Code 39
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

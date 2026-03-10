import { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

/**
 * Camera Scanner Modal Component
 * Displays a live camera feed for scanning barcodes using html5-qrcode.
 */
const CameraScannerModal = ({ isOpen, onClose, onScan }) => {
    const [scannerError, setScannerError] = useState(null);

    useEffect(() => {
        let scanner = null;

        if (isOpen) {
            // Reset error state on open
            setScannerError(null);

            // Initialize scanner
            scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.777778 },
                /* verbose= */ false
            );

            scanner.render(
                (decodedText) => {
                    // Success callback
                    onScan(decodedText);
                    scanner.clear(); // Stop scanning after successful read
                    onClose();
                },
                (error) => {
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
                <div className="text-center mb-4">
                    <p className="text-sm text-primary-500">
                        Point your camera at a barcode to scan.
                    </p>
                </div>

                <div className="bg-primary-50 border border-primary-200 rounded-xl overflow-hidden relative min-h-[300px] flex items-center justify-center">
                    {/* The div where html5-qrcode will render the video element */}
                    <div id="reader" className="w-full" />

                    {scannerError && (
                        <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-6 text-center z-10">
                            <Camera className="w-12 h-12 text-accent-danger mb-3 opacity-50" />
                            <p className="text-accent-danger font-medium">{scannerError}</p>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="mt-4"
                                onClick={onClose}
                            >
                                Close Scanner
                            </Button>
                        </div>
                    )}
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
                    #reader__camera_selection {
                        margin-bottom: 12px;
                        padding: 8px;
                        border-radius: 6px;
                        border: 1px solid #e2e8f0;
                        width: 100%;
                        max-width: 300px;
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

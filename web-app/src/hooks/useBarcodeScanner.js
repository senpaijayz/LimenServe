import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to intercept barcode scanner inputs.
 * Barcode scanners act like fast keyboards typically ending with an 'Enter' keypress.
 * @param {Function} onScan - Callback when a barcode is fully scanned
 */
const useBarcodeScanner = (onScan) => {
    const buffer = useRef('');
    const lastKeyTime = useRef(0);

    const handleKeyDown = useCallback((e) => {
        // We want to capture keys at the document level
        const currentTime = Date.now();

        // Timeout for human typing (usually > 50ms per key)
        if (currentTime - lastKeyTime.current > 50 && e.key !== 'Enter') {
            buffer.current = ''; // Reset if typing too slow (human)
        }

        if (e.key === 'Enter') {
            // Scanner finishes with Enter
            if (buffer.current.length > 3) {
                onScan(buffer.current);
                // Optional: blur active element if it's an input trying to capture the scan
                if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                    document.activeElement.blur();
                }
            }
            buffer.current = '';
        } else if (e.key.length === 1) {
            // Printable character (ignore Shift, Ctrl, etc)
            buffer.current += e.key;
        }

        lastKeyTime.current = currentTime;
    }, [onScan]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);
};

export default useBarcodeScanner;

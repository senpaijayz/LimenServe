import { useEffect, useRef, useCallback } from 'react';
import { validateScan } from '../utils/scannerPolicy';

/**
 * Hook to intercept barcode scanner inputs.
 * Barcode scanners act like fast keyboards typically ending with an 'Enter' keypress.
 * @param {Function} onScan - Callback when a barcode is fully scanned
 */
const useBarcodeScanner = (onScan) => {
    const buffer = useRef('');
    const lastKeyTime = useRef(0);
    const callback = useRef(onScan);
    const recent = useRef({ code: '', at: 0 });
    useEffect(() => { callback.current = onScan; }, [onScan]);

    const handleKeyDown = useCallback((e) => {
        // Manual entry inside the camera modal must not submit a second POS scan.
        if (document.querySelector('[data-barcode-scanner]') || e.ctrlKey || e.altKey || e.metaKey || e.repeat || e.isComposing) {
            buffer.current = ''; return;
        }
        const currentTime = Date.now();

        // Timeout for human typing (usually > 50ms per key)
        if (currentTime - lastKeyTime.current > 80) {
            buffer.current = ''; // Reset if typing too slow (human)
        }

        if (e.key === 'Enter') {
            // Scanner finishes with Enter
            const code = validateScan(buffer.current);
            if (code.length > 3) e.preventDefault();
            if (code.length > 3 && (recent.current.code !== code || currentTime - recent.current.at > 800)) {
                recent.current = { code, at: currentTime };
                Promise.resolve().then(() => callback.current(code)).catch(() => {
                    // Parent workflows own their visible lookup error state.
                    console.warn('Hardware barcode lookup did not complete.');
                });
                // Optional: blur active element if it's an input trying to capture the scan
                if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                    document.activeElement.blur();
                }
            }
            buffer.current = '';
        } else if (e.key.length === 1 && buffer.current.length < 160) {
            // Printable character (ignore Shift, Ctrl, etc)
            buffer.current += e.key;
        }

        lastKeyTime.current = currentTime;
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);
};

export default useBarcodeScanner;

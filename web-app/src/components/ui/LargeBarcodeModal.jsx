import { useState } from 'react';
import { Check, Copy, ScanLine } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import BarcodeDisplay from './BarcodeDisplay';

const LargeBarcodeModal = ({
    isOpen,
    onClose,
    barcodeValue,
    title = 'Scannable Barcode',
    subtitle = 'Point your camera here to scan.',
    productName,
}) => {
    const [copyState, setCopyState] = useState({ value: '', status: 'idle' });
    const safeValue = String(barcodeValue ?? '').trim();
    const visibleCopyState = copyState.value === safeValue ? copyState.status : 'idle';
    const canCopy = Boolean(
        typeof navigator !== 'undefined'
        && navigator.clipboard?.writeText
        && safeValue
    );

    const copyBarcodeValue = async () => {
        if (!canCopy) return;

        try {
            await navigator.clipboard.writeText(safeValue);
            setCopyState({ value: safeValue, status: 'copied' });
            window.setTimeout(() => setCopyState({ value: safeValue, status: 'idle' }), 1600);
        } catch {
            setCopyState({ value: safeValue, status: 'failed' });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
            <div className="space-y-5">
                <div className="flex items-start gap-3 rounded-2xl border border-primary-200 bg-primary-50/80 p-4">
                    <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-accent-blue shadow-sm">
                        <ScanLine className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-primary-950">{subtitle}</p>
                        {productName && (
                            <p className="mt-1 truncate text-sm text-primary-500">{productName}</p>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm sm:p-6">
                    <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl bg-white p-3">
                        <BarcodeDisplay
                            value={safeValue}
                            size="large"
                            displayValue
                            wrapperClassName="w-full"
                        />
                    </div>
                    <p className="mt-4 break-all text-center font-mono text-sm font-semibold text-primary-700">
                        {safeValue}
                    </p>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        variant="primary"
                        onClick={copyBarcodeValue}
                        disabled={!canCopy}
                        leftIcon={visibleCopyState === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    >
                        {visibleCopyState === 'copied' ? 'Copied' : visibleCopyState === 'failed' ? 'Copy failed' : 'Copy barcode value'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default LargeBarcodeModal;

import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, RefreshCcw, Upload } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { getCurrentRetailPriceList, replaceRetailPriceList } from '../../../services/catalogApi';

function parsePriceListText(rawText) {
    return rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const normalized = line.replace(/\t/g, ',');
            const [sku = '', price = ''] = normalized.split(',').map((part) => part.trim());
            return {
                sku: sku.toUpperCase(),
                price: Number(price),
            };
        })
        .filter((item) => item.sku && Number.isFinite(item.price) && item.price >= 0);
}

function downloadCsv(filename, rows) {
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

const PriceListManager = ({ onUpdated }) => {
    const { success, error } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [lastResult, setLastResult] = useState(null);

    const parsedItems = useMemo(() => parsePriceListText(bulkText), [bulkText]);

    const handleClose = () => {
        setIsOpen(false);
        setLastResult(null);
    };

    const handleDownloadTemplate = async () => {
        setIsDownloading(true);
        try {
            const currentPriceList = await getCurrentRetailPriceList();
            const rows = [
                ['SKU', 'PRICE', 'NAME', 'MODEL', 'CATEGORY'],
                ...currentPriceList.map((item) => [item.sku, item.price, item.name, item.model, item.category]),
            ];
            downloadCsv('limen-price-list-template.csv', rows);
        } catch (downloadError) {
            error(downloadError.message || 'Failed to download the current price list.');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        const text = await file.text();
        setBulkText(text);
        event.target.value = '';
    };

    const handleSubmit = async (submitEvent) => {
        submitEvent.preventDefault();

        if (parsedItems.length === 0) {
            error('Add at least one valid SKU and price before uploading.');
            return;
        }

        setIsSubmitting(true);
        setLastResult(null);

        try {
            const result = await replaceRetailPriceList(parsedItems, effectiveFrom);
            setLastResult(result);
            success(`Updated ${result.updatedCount} catalog prices.`);
            setBulkText('');
            onUpdated?.();
        } catch (submitError) {
            error(submitError.message || 'Failed to replace the price list.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <Button
                variant="secondary"
                leftIcon={<FileSpreadsheet className="w-4 h-4" />}
                onClick={() => setIsOpen(true)}
            >
                Replace Price List
            </Button>

            <Modal
                isOpen={isOpen}
                onClose={handleClose}
                title="Bulk Price List Update"
                size="xl"
            >
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4">
                        <p className="text-sm font-semibold text-primary-950">Supabase retail price source</p>
                        <p className="mt-1 text-sm text-primary-600">
                            Paste a full yearly price list using <span className="font-semibold">SKU,PRICE</span> per line. The upload replaces the current retail prices in Supabase and keeps price history in <span className="font-semibold">app.product_prices</span>.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <Input
                            label="Effective From"
                            type="date"
                            value={effectiveFrom}
                            onChange={(event) => setEffectiveFrom(event.target.value)}
                            containerClassName="max-w-xs"
                            required
                        />

                        <div className="flex flex-wrap gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                leftIcon={<Download className="w-4 h-4" />}
                                isLoading={isDownloading}
                                onClick={handleDownloadTemplate}
                            >
                                Download Current List
                            </Button>

                            <label className="btn btn-outline cursor-pointer">
                                <Upload className="w-4 h-4" />
                                <span>Upload CSV</span>
                                <input
                                    type="file"
                                    accept=".csv,.txt"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="input-label">SKU and price list</label>
                        <textarea
                            value={bulkText}
                            onChange={(event) => setBulkText(event.target.value)}
                            rows={12}
                            placeholder={`LF-OF-001,450\nLF-EO-004,1850\nLF-SP-410,1680`}
                            className="input min-h-[260px] font-mono text-sm"
                        />
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-primary-400">
                            Parsed rows: {parsedItems.length}
                        </p>
                    </div>

                    {lastResult && (
                        <div className="rounded-2xl border border-primary-200 bg-white p-4 text-sm text-primary-700">
                            <p className="font-semibold text-primary-950">Upload summary</p>
                            <p className="mt-2">Updated: {lastResult.updatedCount}</p>
                            <p>Skipped: {lastResult.skippedCount}</p>
                            <p>Effective from: {lastResult.effectiveFrom}</p>
                            {lastResult.skippedItems?.length > 0 && (
                                <p className="mt-2 text-accent-danger">
                                    Missing SKUs: {lastResult.skippedItems.map((item) => item.sku).join(', ')}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button type="button" variant="secondary" fullWidth onClick={handleClose}>
                            Close
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            isLoading={isSubmitting}
                            leftIcon={<RefreshCcw className="w-4 h-4" />}
                        >
                            Apply New Price List
                        </Button>
                    </div>
                </form>
            </Modal>
        </>
    );
};

export default PriceListManager;

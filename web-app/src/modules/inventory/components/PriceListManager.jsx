import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, RefreshCcw, Upload } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { getCurrentRetailPriceList, replaceRetailPriceList, replaceRetailPriceListFile } from '../../../services/catalogApi';

function parsePriceListText(rawText) {
    const rows = rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/\t/g, ',').split(',').map((part) => part.trim()));
    const normalizedHeader = (rows[0] || []).map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    const hasHeader = normalizedHeader.some((part) => ['partnumber', 'sku', 'partno', 'price', 'retailprice', 'srp'].includes(part));
    const findIndex = (names, fallback) => {
        const found = normalizedHeader.findIndex((part) => names.includes(part));
        return found >= 0 ? found : fallback;
    };
    const skuIndex = findIndex(['partnumber', 'partno', 'part', 'sku', 'itemcode', 'code'], 0);
    const priceIndex = findIndex(['price', 'retailprice', 'srp', 'listprice', 'amount'], 1);
    const nameIndex = findIndex(['name', 'description', 'partname', 'itemdescription'], 2);
    const modelIndex = findIndex(['model', 'application', 'vehicle', 'modelname'], 3);
    const categoryIndex = findIndex(['category', 'sourcecategory', 'group'], 4);

    return (hasHeader ? rows.slice(1) : rows)
        .map((row) => ({
            sku: String(row[skuIndex] || '').toUpperCase(),
            price: Number(row[priceIndex]),
            name: row[nameIndex] || '',
            model: row[modelIndex] || '',
            category: row[categoryIndex] || '',
        }))
        .filter((item) => item.sku && Number.isFinite(item.price) && item.price >= 0);
}

function formatUploadCount(value) {
    return Number(value ?? 0).toLocaleString('en-PH');
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
    const [isUploadingFile, setIsUploadingFile] = useState(false);
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
                ['PART_NUMBER', 'PRICE', 'NAME', 'MODEL', 'CATEGORY'],
                ...currentPriceList.map((item) => [item.sku, item.price, item.name, item.model, item.category]),
            ];
            downloadCsv('limen-price-list-template.csv', rows);
        } catch (downloadError) {
            error(downloadError.message || 'Failed to download the current price list.');
        } finally {
            setIsDownloading(false);
        }
    };

    const applyResult = (result) => {
        setLastResult(result);
        success(`Updated ${formatUploadCount(result.updatedCount)} catalog prices.`);
        onUpdated?.();
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        setIsUploadingFile(true);
        setLastResult(null);

        try {
            const result = await replaceRetailPriceListFile(file, effectiveFrom);
            applyResult(result);
            setBulkText('');
        } catch (uploadError) {
            error(uploadError.message || 'Failed to upload the price list file.');
        } finally {
            setIsUploadingFile(false);
            event.target.value = '';
        }
    };

    const handleSubmit = async (submitEvent) => {
        submitEvent.preventDefault();

        if (parsedItems.length === 0) {
            error('Add at least one valid part number and price before uploading.');
            return;
        }

        setIsSubmitting(true);
        setLastResult(null);

        try {
            const result = await replaceRetailPriceList(parsedItems, effectiveFrom);
            applyResult(result);
            setBulkText('');
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
                            Upload the yearly Mitsubishi Excel (.xlsx) or CSV price list, or paste rows manually. Imported rows become the active retail prices, older prices stay in history, and new part numbers are created when the file includes descriptions.
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
                                <span>{isUploadingFile ? 'Uploading...' : 'Upload Excel/CSV'}</span>
                                <input
                                    type="file"
                                    accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
                                    className="hidden"
                                    disabled={isUploadingFile}
                                    onChange={handleFileUpload}
                                />
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="input-label">Part number and price list</label>
                        <textarea
                            value={bulkText}
                            onChange={(event) => setBulkText(event.target.value)}
                            rows={12}
                            placeholder={`PART_NUMBER,PRICE,NAME,MODEL,CATEGORY\nLF-OF-001,450,Oil Filter,Montero,Filters\nLF-EO-004,1850,Engine Oil 4L,All Models,Fluids & Oils`}
                            className="input min-h-[260px] font-mono text-sm"
                        />
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-primary-400">
                            Parsed rows: {parsedItems.length}
                        </p>
                    </div>

                    {lastResult && (
                        <div className="rounded-2xl border border-primary-200 bg-white p-4 text-sm text-primary-700">
                            <p className="font-semibold text-primary-950">Upload summary</p>
                            <p className="mt-2">Updated active prices: {formatUploadCount(lastResult.updatedCount)}</p>
                            <p>Rows received: {formatUploadCount(lastResult.receivedCount ?? lastResult.updatedCount)}</p>
                            <p>Unique part numbers: {formatUploadCount(lastResult.uniqueCount ?? lastResult.updatedCount)}</p>
                            <p>Product records touched: {formatUploadCount(lastResult.createdOrUpdatedProducts ?? 0)}</p>
                            <p>Skipped: {formatUploadCount(lastResult.skippedCount)}</p>
                            <p>Effective from: {lastResult.effectiveFrom}</p>
                            {lastResult.skippedItems?.length > 0 && (
                                <p className="mt-2 text-accent-danger">
                                    Missing part numbers: {lastResult.skippedItems.map((item) => item.sku).join(', ')}
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

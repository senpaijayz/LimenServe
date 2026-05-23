import { useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, RefreshCcw, Upload } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { getCurrentRetailPriceList, replaceRetailPriceListFile } from '../../../services/catalogApi';

function formatUploadCount(value) {
    return Number(value ?? 0).toLocaleString('en-PH');
}

function formatFileSize(bytes = 0) {
    if (!bytes) {
        return '0 KB';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** unitIndex);
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatPeso(value) {
    if (value === null || value === undefined || value === '') {
        return 'New';
    }

    return Number(value ?? 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
    });
}

function getChangeLabel(status) {
    if (status === 'new_part') {
        return 'New part';
    }

    if (status === 'new_price') {
        return 'New price';
    }

    if (status === 'unchanged') {
        return 'Same price';
    }

    return 'Changed';
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
    const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);

    const priceChangeRows = lastResult?.priceChanges ?? [];
    const priceChangesTotalCount = lastResult?.priceChangesTotalCount ?? priceChangeRows.length;

    const handleClose = () => {
        setIsOpen(false);
        setLastResult(null);
        setSelectedFile(null);
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
        success(`Price list applied: ${formatUploadCount(result.changedCount ?? result.updatedCount)} changed, ${formatUploadCount(result.unchangedCount ?? 0)} already matched.`);
        onUpdated?.();
    };

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        setSelectedFile(file);
        setLastResult(null);
        event.target.value = '';
    };

    const handleSubmit = async (submitEvent) => {
        submitEvent.preventDefault();

        if (!selectedFile) {
            error('Choose an Excel or CSV price list first, then click Apply New Pricelist.');
            return;
        }

        setIsSubmitting(true);
        setLastResult(null);

        try {
            const result = await replaceRetailPriceListFile(selectedFile, effectiveFrom);
            applyResult(result);
            setSelectedFile(null);
        } catch (submitError) {
            error(submitError.message || 'Failed to upload the price list file.');
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
                        <p className="text-sm font-semibold text-primary-950">Retail price list source</p>
                        <p className="mt-1 text-sm text-primary-600">
                            Upload the new Mitsubishi price list and review exactly which part numbers changed before you leave this screen. Prices become active for the selected date, previous prices stay in history, and inventory stock quantities are never overwritten.
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
                                <span>{selectedFile ? 'Change Excel/CSV' : 'Choose Excel/CSV'}</span>
                                <input
                                    type="file"
                                    accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
                                    className="hidden"
                                    disabled={isSubmitting}
                                    onChange={handleFileChange}
                                />
                            </label>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-primary-200 bg-white p-4">
                        <p className="text-sm font-semibold text-primary-950">Selected pricelist file</p>
                        {selectedFile ? (
                            <div className="mt-3 flex flex-col gap-3 rounded-xl bg-primary-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="font-semibold text-primary-950">{selectedFile.name}</p>
                                    <p className="mt-1 text-sm text-primary-500">{formatFileSize(selectedFile.size)}</p>
                                </div>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>
                                    Remove
                                </Button>
                            </div>
                        ) : (
                            <p className="mt-2 text-sm text-primary-500">
                                No file selected yet. Choose the Excel or CSV file, then click Apply New Pricelist.
                            </p>
                        )}
                    </div>

                    {lastResult && (
                        <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white text-sm text-primary-700 shadow-sm">
                            <div className="flex flex-col gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                                    <div>
                                        <p className="font-semibold text-emerald-950">Price list applied successfully</p>
                                        <p className="mt-1 text-emerald-700">
                                            {formatUploadCount(lastResult.changedCount ?? lastResult.updatedCount)} changed or new prices, {formatUploadCount(lastResult.unchangedCount ?? 0)} already matched.
                                        </p>
                                    </div>
                                </div>
                                <p className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                    Effective {lastResult.effectiveFrom}
                                </p>
                            </div>

                            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-xl bg-primary-50 p-3">
                                    <p className="text-xs uppercase tracking-[0.16em] text-primary-400">Rows received</p>
                                    <p className="mt-1 text-lg font-semibold text-primary-950">{formatUploadCount(lastResult.receivedCount ?? lastResult.updatedCount)}</p>
                                </div>
                                <div className="rounded-xl bg-primary-50 p-3">
                                    <p className="text-xs uppercase tracking-[0.16em] text-primary-400">Unique parts</p>
                                    <p className="mt-1 text-lg font-semibold text-primary-950">{formatUploadCount(lastResult.uniqueCount ?? lastResult.updatedCount)}</p>
                                </div>
                                <div className="rounded-xl bg-primary-50 p-3">
                                    <p className="text-xs uppercase tracking-[0.16em] text-primary-400">New parts</p>
                                    <p className="mt-1 text-lg font-semibold text-primary-950">{formatUploadCount(lastResult.newProductsCount ?? 0)}</p>
                                </div>
                                <div className="rounded-xl bg-primary-50 p-3">
                                    <p className="text-xs uppercase tracking-[0.16em] text-primary-400">Skipped</p>
                                    <p className="mt-1 text-lg font-semibold text-primary-950">{formatUploadCount(lastResult.skippedCount)}</p>
                                </div>
                            </div>

                            {priceChangeRows.length > 0 && (
                                <div className="border-t border-primary-100">
                                    <div className="flex items-center justify-between px-4 py-3">
                                        <p className="font-semibold text-primary-950">Part number price changes</p>
                                        <p className="text-xs uppercase tracking-[0.16em] text-primary-400">
                                            Showing {formatUploadCount(priceChangeRows.length)} of {formatUploadCount(priceChangesTotalCount)}
                                        </p>
                                    </div>
                                    <div className="max-h-80 overflow-auto border-t border-primary-100">
                                        <table className="min-w-full divide-y divide-primary-100 text-sm">
                                            <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-[0.14em] text-primary-500 shadow-sm">
                                                <tr>
                                                    <th className="px-4 py-3 font-semibold">Part Number</th>
                                                    <th className="px-4 py-3 font-semibold">Name</th>
                                                    <th className="px-4 py-3 font-semibold">Old Price</th>
                                                    <th className="px-4 py-3 font-semibold">New Price</th>
                                                    <th className="px-4 py-3 font-semibold">Difference</th>
                                                    <th className="px-4 py-3 font-semibold">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-primary-100">
                                                {priceChangeRows.map((item) => (
                                                    <tr key={`${item.sku}-${item.newPrice}`} className="text-primary-700">
                                                        <td className="px-4 py-3 font-semibold text-primary-950">{item.sku}</td>
                                                        <td className="px-4 py-3">{item.name || '-'}</td>
                                                        <td className="px-4 py-3">{formatPeso(item.previousPrice)}</td>
                                                        <td className="px-4 py-3 font-semibold text-primary-950">{formatPeso(item.newPrice)}</td>
                                                        <td className={`px-4 py-3 ${Number(item.difference ?? 0) > 0 ? 'text-emerald-700' : Number(item.difference ?? 0) < 0 ? 'text-accent-danger' : ''}`}>
                                                            {item.difference === null || item.difference === undefined ? '-' : formatPeso(item.difference)}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-700">
                                                                {getChangeLabel(item.status)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            {lastResult.skippedItems?.length > 0 && (
                                <p className="border-t border-primary-100 px-4 py-3 text-accent-danger">
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
                            Apply New Pricelist
                        </Button>
                    </div>
                </form>
            </Modal>
        </>
    );
};

export default PriceListManager;

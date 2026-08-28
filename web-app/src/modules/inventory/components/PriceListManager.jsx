import { useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, History, RefreshCcw, Upload } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import {
    activateRetailPriceListVersion,
    getCurrentRetailPriceList,
    getRetailPriceListVersions,
    replaceRetailPriceListFile,
} from '../../../services/catalogApi';

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

    if (status === 'removed_from_list') {
        return 'Not in this list';
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
    const [versionYear, setVersionYear] = useState(String(new Date().getFullYear()));
    const [activateImmediately, setActivateImmediately] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);
    const [activatingVersionId, setActivatingVersionId] = useState(null);
    const [versions, setVersions] = useState([]);
    const [lastResult, setLastResult] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadPhase, setUploadPhase] = useState('');

    const priceChangeRows = lastResult?.priceChanges ?? [];
    const priceChangesTotalCount = lastResult?.priceChangesTotalCount ?? priceChangeRows.length;

    const handleClose = () => {
        setIsOpen(false);
        setLastResult(null);
        setSelectedFile(null);
        setUploadProgress(0);
        setUploadPhase('');
    };

    const loadVersions = async () => {
        setIsLoadingVersions(true);
        try {
            setVersions(await getRetailPriceListVersions());
        } catch (loadError) {
            error(loadError.message || 'Failed to load saved price lists.');
        } finally {
            setIsLoadingVersions(false);
        }
    };

    const handleOpen = () => {
        setIsOpen(true);
        void loadVersions();
    };

    const handleDownloadTemplate = async () => {
        setIsDownloading(true);
        try {
            const currentPriceList = await getCurrentRetailPriceList();
            const currentItems = currentPriceList?.items ?? currentPriceList ?? [];
            const rows = [
                ['PART_NUMBER', 'PRICE', 'NAME', 'MODEL', 'CATEGORY'],
                ...currentItems.map((item) => [item.sku, item.price, item.name, item.model, item.category]),
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
        success(`Price list ${result.versionYear ?? versionYear} ${result.isActive === false ? 'saved as a draft' : 'activated'}: ${formatUploadCount(result.changedCount ?? result.updatedCount)} changed, ${formatUploadCount(result.unchangedCount ?? 0)} already matched.`);
        void loadVersions();
        onUpdated?.();
    };

    const handleActivate = async (version) => {
        if (!version?.id || version.isActive) {
            return;
        }

        setActivatingVersionId(version.id);
        try {
            await activateRetailPriceListVersion(version.id);
            success(`Price list ${version.versionYear} is now active in inventory and quotations.`);
            await loadVersions();
            onUpdated?.();
        } catch (activateError) {
            error(activateError.message || 'Failed to activate the selected price list.');
        } finally {
            setActivatingVersionId(null);
        }
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
        setUploadProgress(4);
        setUploadPhase('Preparing the workbook…');

        try {
            const result = await replaceRetailPriceListFile(selectedFile, effectiveFrom, {
                versionYear,
                activate: activateImmediately,
                onUploadProgress: (event) => {
                    if (!event.total) {
                        setUploadProgress((current) => Math.max(current, 12));
                        setUploadPhase('Uploading the workbook…');
                        return;
                    }

                    const uploadedPercent = Math.min(78, Math.max(8, Math.round((event.loaded / event.total) * 78)));
                    setUploadProgress(uploadedPercent);
                    setUploadPhase(uploadedPercent >= 78 ? (activateImmediately ? 'Validating rows and applying prices…' : 'Validating and saving the draft…') : 'Uploading the workbook…');
                },
            });
            setUploadProgress(100);
            setUploadPhase(activateImmediately ? 'Pricelist applied successfully.' : 'Pricelist saved as a draft.');
            applyResult(result);
            setSelectedFile(null);
        } catch (submitError) {
            setUploadProgress(0);
            setUploadPhase('Replacement did not finish. Your existing pricelist was kept.');
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
                onClick={handleOpen}
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
                            Save each Mitsubishi price list by year. A newer list can add or remove part numbers without deleting inventory history; only the active list changes selling prices. Stock quantities are never overwritten.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                                label="Price list year"
                                type="number"
                                min="2000"
                                max="2200"
                                value={versionYear}
                                onChange={(event) => setVersionYear(event.target.value)}
                                required
                            />
                            <Input
                                label="Effective From"
                                type="date"
                                value={effectiveFrom}
                                onChange={(event) => {
                                    setEffectiveFrom(event.target.value);
                                    if (!versionYear) {
                                        setVersionYear(event.target.value.slice(0, 4));
                                    }
                                }}
                                required
                            />
                        </div>

                        <label className="flex max-w-xl items-start gap-3 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-sm text-primary-700">
                            <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 rounded border-primary-300 text-accent-blue focus:ring-accent-blue/30"
                                checked={activateImmediately}
                                onChange={(event) => setActivateImmediately(event.target.checked)}
                                disabled={isSubmitting}
                            />
                            <span>
                                <span className="block font-semibold text-primary-950">Make this the active price list now</span>
                                <span className="mt-0.5 block text-xs text-primary-500">Uncheck to save the year for review without changing live prices.</span>
                            </span>
                        </label>

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
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <History className="h-4 w-4 text-accent-blue" />
                                <p className="text-sm font-semibold text-primary-950">Saved price lists</p>
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={loadVersions} isLoading={isLoadingVersions}>
                                Refresh
                            </Button>
                        </div>
                        {versions.length > 0 ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {versions.map((version) => (
                                    <div key={version.id} className="rounded-xl border border-primary-100 bg-primary-50 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-semibold text-primary-950">{version.versionYear} list</p>
                                                <p className="mt-1 text-xs text-primary-500">{formatUploadCount(version.rowCount)} parts · effective {version.effectiveFrom}</p>
                                            </div>
                                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${version.isActive ? 'bg-emerald-100 text-emerald-700' : version.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-primary-100 text-primary-600'}`}>
                                                {version.isActive ? 'Active' : version.status}
                                            </span>
                                        </div>
                                        {!version.isActive && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="mt-3 w-full"
                                                isLoading={activatingVersionId === version.id}
                                                onClick={() => handleActivate(version)}
                                            >
                                                Use this year
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-2 text-sm text-primary-500">No saved versions yet. Upload the first list to create a year that can be selected later.</p>
                        )}
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

                    {isSubmitting && (
                        <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/5 p-4" role="status" aria-live="polite">
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <p className="font-semibold text-primary-950">{uploadPhase || 'Working…'}</p>
                                <span className="font-mono text-xs font-semibold text-accent-blue">{uploadProgress}%</span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary-100">
                                <div
                                    className="h-full rounded-full bg-accent-blue transition-[width] duration-300 ease-out"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                            <p className="mt-2 text-xs text-primary-500">The server is applying the change in one transaction. Keep this window open.</p>
                        </div>
                    )}

                    {!isSubmitting && uploadPhase && !lastResult && (
                        <div className="rounded-2xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger" role="alert">
                            {uploadPhase}
                        </div>
                    )}

                    {lastResult && (
                        <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white text-sm text-primary-700 shadow-sm">
                            <div className="flex flex-col gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                                    <div>
                                        <p className="font-semibold text-emerald-950">{lastResult.isActive === false ? 'Price list draft saved' : 'Price list applied successfully'}</p>
                                        <p className="mt-1 text-emerald-700">
                                            {formatUploadCount(lastResult.changedCount ?? lastResult.updatedCount)} changed or new prices, {formatUploadCount(lastResult.unchangedCount ?? 0)} already matched.
                                        </p>
                                    </div>
                                </div>
                                <p className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                    Effective {lastResult.effectiveFrom}
                                </p>
                            </div>

                            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
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
                                <div className="rounded-xl bg-amber-50 p-3">
                                    <p className="text-xs uppercase tracking-[0.16em] text-amber-600">Not in new list</p>
                                    <p className="mt-1 text-lg font-semibold text-amber-950">{formatUploadCount(lastResult.removedFromListCount ?? 0)}</p>
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

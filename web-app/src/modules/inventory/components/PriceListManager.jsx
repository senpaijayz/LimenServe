import { useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, History, RefreshCcw, Upload } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import { describePricelistResult } from '../utils/pricelistResult';
import { useToast } from '../../../components/ui/Toast';
import {
    activateRetailPriceListVersion,
    getCurrentRetailPriceList,
    getRetailPriceListVersions,
    uploadRetailPriceList,
    previewRetailPriceListUpload,
    importRetailPriceListUpload,
    getRetailPriceListOriginalDownload,
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
    const csv = rows.map((row) => row.map((value) => {
        const text = String(value ?? '');
        const safeText = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
        return `"${safeText.replace(/"/g, '""')}"`;
    }).join(',')).join('\n');
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);
    const [activatingVersionId, setActivatingVersionId] = useState(null);
    const [versions, setVersions] = useState([]);
    const [lastResult, setLastResult] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadPhase, setUploadPhase] = useState('');
    const [uploadAnalysis, setUploadAnalysis] = useState(null);
    const [selection, setSelection] = useState(null);
    const [preview, setPreview] = useState(null);
    const [reviewConfirmed, setReviewConfirmed] = useState(false);
    const [activationTarget, setActivationTarget] = useState(null);
    const [downloadingVersionId, setDownloadingVersionId] = useState(null);

    const selectedSheet = uploadAnalysis?.sheets?.find((sheet) => sheet.name === selection?.sheetName);
    const selectedPrice = selectedSheet?.priceColumns?.find((column) => column.index === Number(selection?.mapping?.price));
    const invalidatePreview = () => { setPreview(null); setReviewConfirmed(false); setUploadPhase(''); };
    const updateSelection = (patch) => {
        if (patch.mapping && Object.prototype.hasOwnProperty.call(patch.mapping, 'price')) {
            const detected = selectedSheet?.priceColumns?.find((column) => column.index === Number(patch.mapping.price));
            patch = {
                ...patch,
                priceKind: detected?.priceKind || 'unknown',
                vatStatus: detected?.vatStatus || 'unknown',
                priceBasis: detected?.priceBasis || 'per_unit',
                confirmPriceType: false,
            };
        }
        setSelection((current) => ({ ...current, ...patch }));
        invalidatePreview();
    };
    const chooseSheet = (name, analysis = uploadAnalysis) => {
        const sheet = analysis?.sheets?.find((entry) => entry.name === name);
        if (!sheet) return;
        const price = sheet.priceColumns?.find((column) => column.index === sheet.mapping?.price);
        setSelection({
            sheetName: name, headerRow: sheet.headerRow || 1, mapping: { ...sheet.mapping },
            vatStatus: price?.vatStatus || 'unknown', priceKind: price?.priceKind || 'unknown',
            priceBasis: price?.priceBasis || 'unknown', confirmPriceType: false, importMode: 'overlay',
        });
        invalidatePreview();
    };

    const priceChangeRows = lastResult?.priceChanges ?? [];
    const priceChangesTotalCount = lastResult?.priceChangesTotalCount ?? priceChangeRows.length;

    const handleClose = () => {
        if (isSubmitting || activatingVersionId) return;
        setIsOpen(false);
        setLastResult(null);
        setSelectedFile(null);
        setUploadProgress(0);
        setUploadPhase('');
        setUploadAnalysis(null);
        setSelection(null);
        setPreview(null);
        setReviewConfirmed(false);
        setActivationTarget(null);
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
        success(describePricelistResult(result));
        void loadVersions();
        onUpdated?.();
    };

    const handleActivate = async (version) => {
        if (!version?.id || version.isActive) {
            return;
        }

        setActivatingVersionId(version.id);
        try {
            const result = await activateRetailPriceListVersion(version.id);
            success(`Price list ${version.versionYear} is now active. ${describePricelistResult(result)}`);
            await loadVersions();
            onUpdated?.();
            setActivationTarget(null);
        } catch (activateError) {
            error(activateError.message || 'Failed to activate the selected price list.');
        } finally {
            setActivatingVersionId(null);
        }
    };

    const handleDownloadErrors = () => {
        const rows = [
            ['Excel row', 'Part number', 'Product description', 'Issue', 'Suggested correction', 'Severity'],
            ...(preview?.errors ?? []).map((row) => [row.rowNumber, row.sku, row.name, row.reason, row.suggestion, row.severity || 'error']),
        ];
        downloadCsv('limen-pricelist-validation-report.csv', rows);
    };

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        setSelectedFile(file);
        setLastResult(null);
        setUploadAnalysis(null);
        setSelection(null);
        invalidatePreview();
        event.target.value = '';
    };

    const handleAnalyze = async () => {
        if (!selectedFile) {
            error('Choose an Excel or CSV price list first.');
            return;
        }

        setIsSubmitting(true);
        setLastResult(null);
        setUploadProgress(4);
        setUploadPhase('Preparing the workbook…');

        try {
            const result = await uploadRetailPriceList(selectedFile, (event) => {
                    if (!event.total) {
                        setUploadProgress((current) => Math.max(current, 12));
                        setUploadPhase('Uploading the workbook…');
                        return;
                    }

                    const uploadedPercent = Math.min(78, Math.max(8, Math.round((event.loaded / event.total) * 78)));
                    setUploadProgress(uploadedPercent);
                    setUploadPhase(uploadedPercent >= 78 ? 'Preserving the original and detecting worksheets…' : 'Uploading the workbook…');
            });
            setUploadProgress(100);
            setUploadPhase('');
            setUploadAnalysis(result);
            // Require an explicit choice when a workbook contains several sheets.
            if (result.sheets?.length === 1) chooseSheet(result.sheets[0].name, result);
        } catch (submitError) {
            setUploadProgress(0);
            setUploadPhase(submitError.message || 'The pricelist update did not finish. Check saved lists before retrying.');
            error(submitError.message || 'Failed to upload the price list file.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePreview = async () => {
        if (!selection || !uploadAnalysis?.upload?.id) return;
        setIsSubmitting(true);
        setUploadProgress(0);
        setUploadPhase('Validating the selected worksheet and comparing prices…');
        setReviewConfirmed(false);
        try {
            const result = await previewRetailPriceListUpload(uploadAnalysis.upload.id, { ...selection, effectiveFrom, versionYear });
            setPreview(result);
            setUploadPhase('');
        } catch (previewError) {
            setPreview(null);
            setUploadPhase(previewError.message || 'Unable to validate the selected worksheet.');
        } finally { setIsSubmitting(false); }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!preview?.canImport || !preview.previewToken || !reviewConfirmed || isSubmitting) return;
        setIsSubmitting(true);
        setUploadProgress(0);
        setUploadPhase('Importing and verifying the draft. Current active prices are unchanged…');
        try {
            const result = await importRetailPriceListUpload(uploadAnalysis.upload.id,
                { ...selection, effectiveFrom, versionYear }, preview.previewToken);
            applyResult(result);
            setUploadPhase('');
            setPreview(null);
            setReviewConfirmed(false);
            setSelection(null);
            setUploadAnalysis(null);
            setSelectedFile(null);
        } catch (submitError) {
            setUploadPhase(submitError.message || 'Unable to save the draft. Check saved revisions before retrying.');
        } finally { setIsSubmitting(false); }
    };

    const handleDownloadOriginal = async (version) => {
        setDownloadingVersionId(version.id);
        try {
            const { url, filename } = await getRetailPriceListOriginalDownload(version.id);
            if (!url) throw new Error('No original workbook is available for this revision.');
            const link = document.createElement('a');
            link.href = url;
            link.download = filename || version.sourceFilename || 'pricelist.xlsx';
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (downloadError) { error(downloadError.message); }
        finally { setDownloadingVersionId(null); }
    };

    return (
        <>
            <Button
                variant="secondary"
                leftIcon={<FileSpreadsheet className="w-4 h-4" />}
                onClick={handleOpen}
            >
                Update Pricelist
            </Button>

            <Modal
                isOpen={isOpen}
                onClose={handleClose}
                title="Update Pricelist"
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
                                    accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
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
                                                <p className="font-semibold text-primary-950">{version.versionYear} · revision {version.revision ?? 1}</p>
                                                <p className="mt-1 text-xs text-primary-500">{formatUploadCount(version.rowCount)} parts · effective {version.effectiveFrom}</p>
                                                {version.upload?.originalFilename && <p className="mt-1 break-all text-xs text-primary-500">File: {version.upload.originalFilename}</p>}
                                                {version.upload?.worksheet && <p className="mt-1 text-xs text-primary-500">Sheet: {version.upload.worksheet} · {version.upload.pricingCategory?.replaceAll('_', ' ')}</p>}
                                                {version.upload?.uploadedAt && <p className="mt-1 text-xs text-primary-400">Uploaded {new Date(version.upload.uploadedAt).toLocaleString('en-PH')}</p>}
                                            </div>
                                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${version.isActive ? 'bg-emerald-100 text-emerald-700' : version.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-primary-100 text-primary-600'}`}>
                                                {version.isActive ? 'Active' : version.status}
                                            </span>
                                        </div>
                                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                            {version.sourceFileAvailable && (
                                                <Button type="button" variant="outline" size="sm" className="w-full"
                                                    isLoading={downloadingVersionId === version.id}
                                                    onClick={() => handleDownloadOriginal(version)}>
                                                    <Download className="mr-1 h-4 w-4" /> Original file
                                                </Button>
                                            )}
                                            {!version.isActive && version.status !== 'draft' && (
                                                <Button type="button" variant="outline" size="sm" className="w-full"
                                                    onClick={() => setActivationTarget(version)}>
                                                    Restore revision
                                                </Button>
                                            )}
                                            {!version.isActive && version.status === 'draft' && (
                                                <Button type="button" variant="outline" size="sm" className="w-full"
                                                    onClick={() => setActivationTarget(version)}>
                                                    Publish draft
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-2 text-sm text-primary-500">No saved versions yet. Upload the first list to create a year that can be selected later.</p>
                        )}
                    </div>

                    <div className="rounded-2xl border border-primary-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-primary-950">Selected pricelist file</p>
                            {uploadAnalysis?.upload?.duplicateDetected && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Same file uploaded before</span>}
                        </div>
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
                                Choose an .xlsx or .csv file. The exact original is kept in private storage. Nothing changes in live prices or stock until you review, save a draft, and separately publish it.
                            </p>
                        )}
                        {selectedFile && !uploadAnalysis && <Button type="button" className="mt-4" variant="primary" isLoading={isSubmitting} onClick={handleAnalyze}>Upload original and detect worksheets</Button>}
                    </div>

                    {uploadAnalysis && (
                        <div className="space-y-4 rounded-2xl border border-primary-200 bg-white p-4">
                            <div>
                                <p className="text-sm font-semibold text-primary-950">1. Choose a worksheet and price column</p>
                                <p className="mt-1 text-sm text-primary-500">The workbook’s sheets are separate price structures. Only one selected sheet is reviewed; they are never combined automatically.</p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-primary-800" htmlFor="pricelist-sheet">Worksheet</label>
                                    <select id="pricelist-sheet" value={selection?.sheetName || ''} onChange={(event) => chooseSheet(event.target.value)} className="input w-full" disabled={isSubmitting}>
                                        <option value="">Choose a worksheet</option>
                                        {uploadAnalysis.sheets?.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name} — {sheet.category} ({formatUploadCount(sheet.rowCount)} rows)</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-primary-800" htmlFor="pricelist-import-mode">How should it be compared?</label>
                                    <select id="pricelist-import-mode" value={selection?.importMode || 'overlay'} onChange={(event) => updateSelection({ importMode: event.target.value })} className="input w-full" disabled={!selection || isSubmitting}>
                                        <option value="overlay">Update selected parts; keep all other active prices</option>
                                        <option value="replace">Replace the complete retail price list</option>
                                    </select>
                                </div>
                            </div>
                            {selectedSheet && selection && (
                                <>
                                    <div className="grid gap-3 rounded-xl bg-primary-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                                        <p className="text-sm text-primary-700"><span className="font-semibold">Detected:</span> {selectedSheet.category}</p>
                                        <p className="text-sm text-primary-700"><span className="font-semibold">Header row:</span> {selectedSheet.headerRow || 'Not detected'}</p>
                                        <p className="text-sm text-primary-700"><span className="font-semibold">Data rows:</span> {formatUploadCount(selectedSheet.rowCount)}</p>
                                        <p className="text-sm text-primary-700"><span className="font-semibold">Original file:</span> {formatFileSize(uploadAnalysis.upload.sizeBytes)}</p>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {[
                                            ['sku', 'Part number'], ['name', 'Description'], ['model', 'Model / application'],
                                            ['uom', 'Sales unit'], ['pcc', 'PCC'], ['category', 'Category'], ['price', 'Price'],
                                        ].map(([key, label]) => (
                                            <div key={key}>
                                                <label className="mb-1 block text-sm font-medium text-primary-800" htmlFor={`pricelist-map-${key}`}>{label}{['sku', 'price'].includes(key) ? ' *' : ''}</label>
                                                <select id={`pricelist-map-${key}`} value={selection.mapping?.[key] ?? -1} onChange={(event) => updateSelection({ mapping: { ...selection.mapping, [key]: Number(event.target.value) } })} className="input w-full" disabled={isSubmitting}>
                                                    <option value={-1}>Not mapped</option>
                                                    {selectedSheet.columns?.map((column) => <option key={column.index} value={column.index}>{column.label}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-primary-800" htmlFor="pricelist-price-kind">Price type</label>
                                            <select id="pricelist-price-kind" value={selection.priceKind} onChange={(event) => updateSelection({ priceKind: event.target.value })} className="input w-full" disabled={isSubmitting}>
                                                <option value="unknown">Confirm manually</option><option value="srp">Customer selling price (SRP)</option><option value="dnp">Dealer net price (DNP)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-primary-800" htmlFor="pricelist-vat-status">VAT status</label>
                                            <select id="pricelist-vat-status" value={selection.vatStatus} onChange={(event) => updateSelection({ vatStatus: event.target.value })} className="input w-full" disabled={isSubmitting}>
                                                <option value="unknown">Confirm manually</option><option value="inclusive">VAT included</option><option value="exclusive">VAT excluded</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-primary-800" htmlFor="pricelist-price-basis">Price unit</label>
                                            <select id="pricelist-price-basis" value={selection.priceBasis} onChange={(event) => updateSelection({ priceBasis: event.target.value })} className="input w-full" disabled={isSubmitting}>
                                                <option value="per_unit">Per stocked item</option><option value="per_liter">Per liter</option>
                                            </select>
                                        </div>
                                        <Input label="Price list year" type="number" min="2000" max="2200" value={versionYear} onChange={(event) => { setVersionYear(event.target.value); invalidatePreview(); }} required />
                                        <Input label="Effective from" type="date" value={effectiveFrom} onChange={(event) => { setEffectiveFrom(event.target.value); if (!versionYear) setVersionYear(event.target.value.slice(0, 4)); invalidatePreview(); }} required />
                                    </div>
                                    {selection.confirmPriceType !== true && (selection.priceKind === 'unknown' || selection.vatStatus === 'unknown' || selection.vatStatus === 'exclusive') && (
                                        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                            <input type="checkbox" className="mt-1" checked={false} onChange={(event) => updateSelection({ confirmPriceType: event.target.checked, priceKind: selection.priceKind === 'unknown' ? 'srp' : selection.priceKind, vatStatus: selection.vatStatus === 'unknown' ? 'inclusive' : selection.vatStatus })} />
                                            <span>I verified the selected column is customer SRP and confirmed its VAT status. A VAT-exclusive SRP will be converted once using the system’s 12% VAT setting; a VAT-inclusive price will not be changed.</span>
                                        </label>
                                    )}
                                    {selection.confirmPriceType === true && <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" className="mt-1" checked onChange={() => updateSelection({ confirmPriceType: false })} /><span>Price type confirmed manually.</span></label>}
                                    <div className="flex flex-wrap items-center gap-3">
                                        <Button type="button" variant="primary" isLoading={isSubmitting} disabled={isSubmitting || selection.mapping?.sku < 0 || selection.mapping?.price < 0} onClick={handlePreview}>Preview selected sheet</Button>
                                        {selectedPrice && <p className="text-sm text-primary-600">Selected column: <span className="font-semibold">{selectedPrice.label}</span> · {selectedPrice.priceKind?.toUpperCase() || 'Price type unconfirmed'} · {selectedPrice.vatStatus || 'VAT unconfirmed'} · {selectedPrice.priceBasis === 'per_liter' ? 'per liter' : 'per item'}</p>}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {preview && (
                        <div className="space-y-4 rounded-2xl border border-primary-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div><p className="text-sm font-semibold text-primary-950">2. Review import preview</p><p className="mt-1 text-sm text-primary-500">This creates a saved draft only. Active retail prices and stock remain unchanged.</p></div>
                                {preview.errors?.length > 0 && <Button type="button" variant="outline" size="sm" onClick={handleDownloadErrors}><Download className="mr-1 h-4 w-4" /> Download error report</Button>}
                            </div>
                            {preview.blockers?.length > 0 && <div className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert"><p className="font-semibold">Cannot save this draft yet</p>{preview.blockers.map((blocker) => <p key={blocker}>• {blocker}</p>)}</div>}
                            {preview.warnings?.length > 0 && <div className="max-h-32 space-y-1 overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{preview.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                {[
                                    ['Detected rows', preview.counts?.totalRows], ['Valid parts', preview.counts?.validRows], ['Rejected rows', preview.counts?.invalidRows], ['VAT warnings', preview.counts?.warningRows],
                                    ['Existing products', preview.counts?.existingProducts], ['New products', preview.counts?.newProducts], ['Changed prices', preview.counts?.changedPrices], ['Unchanged prices', preview.counts?.unchangedPrices],
                                    ['Removed from list', preview.counts?.removedFromList], ['Saved revision rows', preview.counts?.revisionRowCount],
                                ].map(([label, value]) => <div key={label} className="rounded-xl bg-primary-50 p-3"><p className="text-xs uppercase tracking-wide text-primary-500">{label}</p><p className="mt-1 text-lg font-semibold text-primary-950">{formatUploadCount(value)}</p></div>)}
                            </div>
                            {preview.importMode === 'replace' && preview.counts?.removedFromList > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A replacement draft would omit {formatUploadCount(preview.counts.removedFromList)} parts in the current revision. Review this carefully; those items will not have an active price after this draft is published.</p>}
                            {preview.errors?.length > 0 && <div className="max-h-56 overflow-auto rounded-xl border border-primary-200"><table className="min-w-full text-left text-sm"><thead className="sticky top-0 bg-primary-50 text-xs uppercase text-primary-600"><tr><th className="px-3 py-2">Excel row</th><th className="px-3 py-2">Part number</th><th className="px-3 py-2">Issue</th><th className="px-3 py-2">Suggested correction</th></tr></thead><tbody>{preview.errors.slice(0, 150).map((row, index) => <tr key={`${row.rowNumber}-${index}`} className="border-t border-primary-100"><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2 font-medium">{row.sku || '—'}</td><td className="px-3 py-2">{row.reason}</td><td className="px-3 py-2">{row.suggestion}</td></tr>)}</tbody></table>{preview.errors.length > 150 && <p className="p-2 text-xs text-primary-500">Showing the first 150 issues. Download the report to view all.</p>}</div>}
                            {preview.sample?.length > 0 && <div className="overflow-auto rounded-xl border border-primary-200"><p className="border-b border-primary-100 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800">Sample detected prices</p><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase text-primary-500"><tr><th className="px-3 py-2">Excel row</th><th className="px-3 py-2">Part number</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Selected price</th></tr></thead><tbody>{preview.sample.map((row) => <tr key={`${row.sourceLineNumber}-${row.sku}`} className="border-t border-primary-100"><td className="px-3 py-2">{row.sourceLineNumber}</td><td className="px-3 py-2 font-semibold">{row.sku}</td><td className="px-3 py-2">{row.name || '—'}</td><td className="px-3 py-2">{formatPeso(row.price)}</td></tr>)}</tbody></table></div>}
                            {preview.priceChanges?.length > 0 && <div className="max-h-48 overflow-auto rounded-xl border border-primary-200"><p className="sticky top-0 border-b border-primary-100 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800">Price comparison (showing up to 80)</p><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase text-primary-500"><tr><th className="px-3 py-2">Part</th><th className="px-3 py-2">Previous</th><th className="px-3 py-2">New</th><th className="px-3 py-2">Result</th></tr></thead><tbody>{preview.priceChanges.map((row) => <tr key={row.sku} className="border-t border-primary-100"><td className="px-3 py-2">{row.sku}</td><td className="px-3 py-2">{formatPeso(row.previousPrice)}</td><td className="px-3 py-2">{formatPeso(row.newPrice)}</td><td className="px-3 py-2">{getChangeLabel(row.status)}</td></tr>)}</tbody></table></div>}
                            <label className={`flex items-start gap-2 rounded-lg p-3 text-sm ${preview.canImport ? 'border border-primary-200 bg-primary-50 text-primary-800' : 'border border-primary-100 bg-primary-50/50 text-primary-400'}`}>
                                <input type="checkbox" className="mt-1" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} disabled={!preview.canImport || isSubmitting} />
                                <span>I reviewed the selected worksheet, pricing type, VAT status, rejected rows, and list changes. Save this as a draft only; it will not change live prices.</span>
                            </label>
                        </div>
                    )}

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
                            <p className="mt-2 text-xs text-primary-500">The server is preserving the original and saving a draft. Live prices and inventory are not being changed.</p>
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
                                        <p className="font-semibold text-emerald-950">{lastResult.noOp ? 'Price list already up to date' : lastResult.isActive === false ? 'Price list draft saved' : 'Price list applied successfully'}</p>
                                        <p className="mt-1 text-emerald-700">
                                            {describePricelistResult(lastResult)}
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
                        <Button type="submit" variant="primary" fullWidth isLoading={isSubmitting}
                            disabled={!preview?.canImport || !reviewConfirmed || !uploadAnalysis?.upload?.id}
                            leftIcon={<RefreshCcw className="w-4 h-4" />}>
                            Save as Draft (Live Prices Unchanged)
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={Boolean(activationTarget)} onClose={() => !activatingVersionId && setActivationTarget(null)} title={activationTarget?.isActive ? 'Pricelist is already active' : activationTarget?.status === 'draft' ? 'Publish this draft?' : 'Restore this pricelist?'} size="md">
                {activationTarget && <div className="space-y-4">
                    <p className="text-sm text-primary-700">You are about to make <span className="font-semibold">{activationTarget.versionYear} · revision {activationTarget.revision ?? 1}</span> the active retail pricelist. POS, quotations, and the public catalog will use its prices after confirmation.</p>
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This switches the active price snapshot. Inventory quantities and the saved revision history are preserved. Verify the row count and worksheet before proceeding.</p>
                    <div className="flex gap-3">
                        <Button type="button" variant="secondary" fullWidth onClick={() => setActivationTarget(null)} disabled={Boolean(activatingVersionId)}>Cancel</Button>
                        <Button type="button" variant="primary" fullWidth isLoading={activatingVersionId === activationTarget.id} onClick={() => handleActivate(activationTarget)}>Confirm and activate</Button>
                    </div>
                </div>}
            </Modal>
        </>
    );
};

export default PriceListManager;

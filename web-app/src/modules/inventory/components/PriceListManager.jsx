import { useState } from 'react';
import { Archive, CheckCircle2, Download, FileSpreadsheet, History, Pencil, RefreshCcw, Trash2, Upload } from 'lucide-react';
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
    updateRetailPriceListVersion,
    archiveRetailPriceListVersion,
    deleteRetailPriceListVersion,
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
    const [activationTarget, setActivationTarget] = useState(null);
    const [downloadingVersionId, setDownloadingVersionId] = useState(null);
    const [revisionTarget, setRevisionTarget] = useState(null);
    const [revisionName, setRevisionName] = useState('');
    const [revisionDate, setRevisionDate] = useState('');
    const [savingRevisionField, setSavingRevisionField] = useState('');
    const [archiveTarget, setArchiveTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const selectedSheet = uploadAnalysis?.sheets?.find((sheet) => sheet.name === selection?.sheetName);
    const selectedPrice = selectedSheet?.priceColumns?.find((column) => column.index === Number(selection?.mapping?.price));
    const invalidatePreview = () => { setPreview(null); setUploadPhase(''); };
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
    const buildSheetSelection = (name, analysis = uploadAnalysis) => {
        const sheet = analysis?.sheets?.find((entry) => entry.name === name);
        if (!sheet) return null;
        const price = sheet.priceColumns?.find((column) => column.index === sheet.mapping?.price);
        return {
            sheetName: name, headerRow: sheet.headerRow || 1, mapping: { ...sheet.mapping },
            vatStatus: price?.vatStatus || 'unknown', priceKind: price?.priceKind || 'unknown',
            priceBasis: price?.priceBasis || 'unknown', confirmPriceType: false, importMode: 'overlay',
        };
    };
    const chooseSheet = (name, analysis = uploadAnalysis) => {
        const nextSelection = buildSheetSelection(name, analysis);
        if (!nextSelection) return;
        setSelection(nextSelection);
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

    const handleSaveRevisionField = async (field) => {
        if (!revisionTarget || savingRevisionField) return;
        const value = field === 'name' ? revisionName.trim() : revisionDate;
        if (!value) { error(field === 'name' ? 'Enter a name for this revision.' : 'Choose an effective date.'); return; }
        setSavingRevisionField(field);
        try {
            const changes = field === 'name'
                ? { action: 'rename', displayName: value }
                : { action: 'effective_date', effectiveFrom: value };
            await updateRetailPriceListVersion(revisionTarget.id, changes);
            success(field === 'name' ? 'Revision name updated. Prices were not changed.' : 'Effective date updated. Prices were not changed.');
            await loadVersions();
            setRevisionTarget(null);
        } catch (saveError) { error(saveError.message || 'Unable to update this revision.'); }
        finally { setSavingRevisionField(''); }
    };

    const handleArchiveRevision = async () => {
        if (!archiveTarget || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await archiveRetailPriceListVersion(archiveTarget.id);
            success('Revision archived. Its price history remains available.');
            setArchiveTarget(null);
            await loadVersions();
        } catch (archiveError) { error(archiveError.message || 'Unable to archive this revision.'); }
        finally { setIsSubmitting(false); }
    };

    const handleDeleteDraft = async () => {
        if (!deleteTarget || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await deleteRetailPriceListVersion(deleteTarget.id);
            success('Unpublished draft deleted. Product and transaction records were not changed.');
            setDeleteTarget(null);
            await loadVersions();
        } catch (deleteError) { error(deleteError.message || 'Unable to delete this draft.'); }
        finally { setIsSubmitting(false); }
    };

    const handleDownloadErrors = () => {
        const rows = [
            ['Excel row', 'Part number', 'Product description', 'Source column', 'Original cell value', 'Issue', 'Suggested correction', 'Severity'],
            ...(preview?.errors ?? []).map((row) => [row.rowNumber, row.sku, row.name, row.sourceColumn, row.sourceValue, row.reason, row.suggestion, row.severity || 'error']),
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
            const suggestedDate = result.upload?.suggestedEffectiveDate || effectiveFrom;
            const suggestedYear = suggestedDate.slice(0, 4) || versionYear;
            setEffectiveFrom(suggestedDate);
            setVersionYear(suggestedYear);
            const selectedName = result.recommendedSheetName
                || (result.sheets?.length === 1 ? result.sheets[0].name : null);
            const nextSelection = selectedName ? buildSheetSelection(selectedName, result) : null;
            if (nextSelection) {
                setSelection(nextSelection);
                const selected = result.sheets.find((sheet) => sheet.name === selectedName);
                if (selected?.mapping?.sku >= 0 && selected?.mapping?.price >= 0) {
                    setUploadPhase('Comparing part numbers and prices…');
                    const nextPreview = await previewRetailPriceListUpload(result.upload.id, {
                        ...nextSelection, effectiveFrom: suggestedDate, versionYear: suggestedYear,
                    });
                    setPreview(nextPreview);
                    setUploadPhase('');
                }
            }
        } catch (submitError) {
            setUploadProgress(0);
            setUploadPhase(submitError.message || 'The pricelist update did not finish. Check saved lists before retrying.');
            error(submitError.message || 'Failed to upload the price list file.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePreview = async (nextSelection = selection) => {
        if (!nextSelection || !uploadAnalysis?.upload?.id) return;
        setIsSubmitting(true);
        setUploadProgress(0);
        setUploadPhase('Comparing part numbers and prices…');
        try {
            const result = await previewRetailPriceListUpload(uploadAnalysis.upload.id, { ...nextSelection, effectiveFrom, versionYear });
            setPreview(result);
            setUploadPhase('');
        } catch (previewError) {
            setPreview(null);
            setUploadPhase(previewError.message || 'Unable to validate the selected worksheet.');
        } finally { setIsSubmitting(false); }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!preview?.canImport || !preview.previewToken || isSubmitting) return;
        setIsSubmitting(true);
        setUploadProgress(0);
        setUploadPhase('Saving the new revision and updating active prices…');
        try {
            const result = await importRetailPriceListUpload(uploadAnalysis.upload.id,
                { ...selection, effectiveFrom, versionYear }, preview.previewToken);
            applyResult(result);
            setUploadPhase('');
            setPreview(null);
            setSelection(null);
            setUploadAnalysis(null);
            setSelectedFile(null);
        } catch (submitError) {
            setUploadPhase(submitError.message || 'Unable to complete the update. Check Saved Price Lists before retrying.');
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
                        <p className="text-sm font-semibold text-primary-950">Upload, review, and update</p>
                        <p className="mt-1 text-sm text-primary-600">
                            LimenServe detects the customer price sheet, matches part numbers, and compares prices. Invalid rows are reported and skipped; existing prices and stock are preserved for those parts.
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
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-primary-950">1. Upload new pricelist</p>
                                <p className="mt-1 text-sm text-primary-500">Choose an Excel or CSV file. Its original copy is saved privately for your records.</p>
                            </div>
                            {uploadAnalysis?.upload?.duplicateDetected && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">This exact file was uploaded before</span>}
                        </div>
                        {selectedFile ? (
                            <div className="mt-3 flex flex-col gap-3 rounded-xl bg-primary-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div><p className="font-semibold text-primary-950">{selectedFile.name}</p><p className="mt-1 text-sm text-primary-500">{formatFileSize(selectedFile.size)}</p></div>
                                <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedFile(null); setUploadAnalysis(null); setSelection(null); setPreview(null); }}>Remove</Button>
                            </div>
                        ) : (
                            <p className="mt-2 text-sm text-primary-500">Select a pricelist to detect its customer price sheet and compare it with the active prices.</p>
                        )}
                        {selectedFile && !uploadAnalysis && <Button type="button" className="mt-4" variant="primary" isLoading={isSubmitting} onClick={handleAnalyze}>Upload and compare</Button>}
                    </div>

                    {uploadAnalysis && (
                        <div className="space-y-4 rounded-2xl border border-primary-200 bg-white p-4">
                            <div>
                                <p className="text-sm font-semibold text-primary-950">2. Automatic detection</p>
                                <p className="mt-1 text-sm text-primary-500">Part numbers, descriptions, and customer selling prices are detected automatically. Only choose a sheet if the workbook has no clear customer-price sheet.</p>
                            </div>
                            {(!selection || !uploadAnalysis.recommendedSheetName) && (
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-primary-800" htmlFor="pricelist-sheet">Choose the customer pricelist sheet</label>
                                    <select id="pricelist-sheet" value={selection?.sheetName || ''} onChange={(event) => { const next = buildSheetSelection(event.target.value); chooseSheet(event.target.value); if (next?.mapping?.sku >= 0 && next?.mapping?.price >= 0) void handlePreview(next); }} className="input w-full" disabled={isSubmitting}>
                                        <option value="">Select a sheet</option>
                                        {uploadAnalysis.sheets?.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name} — {sheet.category} ({formatUploadCount(sheet.rowCount)} rows)</option>)}
                                    </select>
                                </div>
                            )}
                            {selectedSheet && selection && (
                                <>
                                    <div className="grid gap-3 rounded-xl bg-primary-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                                        <p className="text-sm text-primary-700"><span className="font-semibold">Detected sheet:</span> {selectedSheet.name}</p>
                                        <p className="text-sm text-primary-700"><span className="font-semibold">Detected price:</span> {selectedPrice?.label || 'Select the price column'}</p>
                                        <p className="text-sm text-primary-700"><span className="font-semibold">Products:</span> {formatUploadCount(selectedSheet.rowCount)}</p>
                                        <p className="text-sm text-primary-700"><span className="font-semibold">Effective date:</span> {effectiveFrom || 'Choose below'}</p>
                                    </div>
                                    {(selectedSheet.status === 'mapping_required' || selection.mapping?.sku < 0 || selection.mapping?.price < 0 || selectedPrice?.priceKind !== 'srp') && (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            {[
                                                ['sku', 'Part number'], ['price', 'Customer price'], ['name', 'Product description'],
                                            ].map(([key, label]) => (
                                                <div key={key}>
                                                    <label className="mb-1 block text-sm font-medium text-primary-800" htmlFor={`pricelist-map-${key}`}>{label}{['sku', 'price'].includes(key) ? ' *' : ''}</label>
                                                    <select id={`pricelist-map-${key}`} value={selection.mapping?.[key] ?? -1} onChange={(event) => updateSelection({ mapping: { ...selection.mapping, [key]: Number(event.target.value) } })} className="input w-full" disabled={isSubmitting}>
                                                        <option value={-1}>Choose a column</option>
                                                        {selectedSheet.columns?.map((column) => <option key={column.index} value={column.index}>{column.label}</option>)}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {(selection.priceKind === 'unknown' || selection.vatStatus === 'unknown' || selection.vatStatus === 'exclusive' || selection.priceBasis === 'per_liter') && (
                                        <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:grid-cols-2">
                                            <p className="text-sm text-amber-900 sm:col-span-2">Check the detected price details below before continuing.</p>
                                            {selection.priceKind === 'unknown' && <div><label className="mb-1 block text-sm font-medium text-amber-950" htmlFor="pricelist-price-kind">Price type</label><select id="pricelist-price-kind" value={selection.priceKind} onChange={(event) => updateSelection({ priceKind: event.target.value })} className="input w-full"><option value="unknown">Choose type</option><option value="srp">Customer selling price (SRP)</option><option value="dnp">Dealer net price (DNP)</option></select></div>}
                                            {selection.vatStatus === 'unknown' && <div><label className="mb-1 block text-sm font-medium text-amber-950" htmlFor="pricelist-vat-status">VAT</label><select id="pricelist-vat-status" value={selection.vatStatus} onChange={(event) => updateSelection({ vatStatus: event.target.value })} className="input w-full"><option value="unknown">Choose VAT status</option><option value="inclusive">VAT included</option><option value="exclusive">VAT excluded</option></select></div>}
                                            {selection.vatStatus === 'exclusive' && <p className="text-sm text-amber-900 sm:col-span-2">This sheet shows VAT-exclusive prices. LimenServe will add the configured 12% VAT once during the update.</p>}
                                            {selection.priceBasis === 'per_liter' && <p className="text-sm text-amber-900 sm:col-span-2">This sheet is priced per liter and cannot replace per-item POS prices. Choose the per-item customer price sheet instead.</p>}
                                            {selection.priceBasis !== 'per_liter' && <label className="flex items-start gap-2 text-sm text-amber-900 sm:col-span-2"><input type="checkbox" className="mt-1" checked={selection.confirmPriceType === true} onChange={(event) => updateSelection({ confirmPriceType: event.target.checked })} /><span>I confirmed this is the correct customer price. VAT-exclusive prices are converted once using the system’s 12% VAT setting.</span></label>}
                                        </div>
                                    )}
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div className="w-full sm:max-w-xs"><label className="mb-1 block text-sm font-medium text-primary-800" htmlFor="pricelist-effective-date">Effective date</label><Input id="pricelist-effective-date" type="date" value={effectiveFrom} onChange={(event) => { setEffectiveFrom(event.target.value); setVersionYear(event.target.value.slice(0, 4)); invalidatePreview(); }} required /></div>
                                        {!preview && <Button type="button" variant="primary" isLoading={isSubmitting} disabled={isSubmitting || selection.mapping?.sku < 0 || selection.mapping?.price < 0} onClick={() => void handlePreview()}>Review price changes</Button>}
                                        {preview && <Button type="button" variant="outline" isLoading={isSubmitting} onClick={() => void handlePreview()}>Refresh comparison</Button>}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {preview && (
                        <div className="space-y-4 rounded-2xl border border-primary-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div><p className="text-sm font-semibold text-primary-950">3. Price change summary</p><p className="mt-1 text-sm text-primary-500">Check the comparison before updating. Invalid rows will be skipped and existing prices for those parts will be kept.</p></div>
                                {preview.errors?.length > 0 && <Button type="button" variant="outline" size="sm" onClick={handleDownloadErrors}><Download className="mr-1 h-4 w-4" /> Download error report</Button>}
                            </div>
                            {preview.blockers?.length > 0 && <div className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert"><p className="font-semibold">A selection is needed before updating</p>{preview.blockers.map((blocker) => <p key={blocker}>• {blocker}</p>)}</div>}
                            {preview.warnings?.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><summary className="cursor-pointer font-semibold">Price notes ({formatUploadCount(preview.warnings.length)})</summary><div className="mt-2 max-h-32 space-y-1 overflow-auto">{preview.warnings.slice(0, 100).map((warning, index) => <p key={`${index}-${warning}`}>• {warning}</p>)}</div></details>}
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                {[
                                    ['Products detected', preview.counts?.totalRows], ['Matched parts', preview.counts?.existingProducts], ['Prices changed', preview.counts?.changedPrices], ['Prices unchanged', preview.counts?.unchangedPrices],
                                    ['New part numbers', preview.counts?.newProducts], ['Missing prices', preview.counts?.missingPrices], ['Invalid prices / zero', (preview.counts?.invalidPrices || 0) + (preview.counts?.zeroPrices || 0)], ['Conflicting duplicates', preview.counts?.conflictingDuplicateGroups],
                                ].map(([label, value]) => <div key={label} className="rounded-xl bg-primary-50 p-3"><p className="text-xs uppercase tracking-wide text-primary-500">{label}</p><p className="mt-1 text-lg font-semibold text-primary-950">{formatUploadCount(value)}</p></div>)}
                            </div>
                            {preview.counts?.roundingWarnings > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{formatUploadCount(preview.counts.roundingWarnings)} price(s) have more than two decimal places. Review the source values in Price notes; the preview shows the exact cent amount that will be saved.</p>}
                            {preview.duplicateGroups?.length > 0 && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-950">Choose which row to use for repeated part numbers</p>{preview.duplicateGroups.map((group) => <div key={group.sku} className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center"><p className="text-sm text-amber-950"><span className="font-semibold">{group.sku}</span> · rows {group.rows.map((row) => row.rowNumber).join(', ')}</p><select aria-label={`Choose Excel row for ${group.sku}`} value={group.selectedRow || ''} onChange={(event) => updateSelection({ duplicateResolutions: { ...selection.duplicateResolutions, [group.sku]: Number(event.target.value) } })} className="input w-full"><option value="">Keep existing price until reviewed</option>{group.rows.map((row) => <option key={row.rowNumber} value={row.rowNumber}>Row {row.rowNumber} · {row.sourcePrice} · {row.name || 'No description'}</option>)}</select></div>)}</div>}
                            {preview.errors?.length > 0 && <details className="rounded-xl border border-primary-200"><summary className="cursor-pointer bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800">Rows needing attention ({formatUploadCount(preview.errors.length)})</summary><div className="max-h-56 overflow-auto"><table className="min-w-full text-left text-sm"><thead className="sticky top-0 bg-white text-xs uppercase text-primary-600"><tr><th className="px-3 py-2">Excel row</th><th className="px-3 py-2">Part number</th><th className="px-3 py-2">Source value</th><th className="px-3 py-2">What happened</th><th className="px-3 py-2">Next step</th></tr></thead><tbody>{preview.errors.slice(0, 150).map((row, index) => <tr key={`${row.rowNumber}-${index}`} className="border-t border-primary-100"><td className="px-3 py-2">{row.rowNumber ?? '—'}</td><td className="px-3 py-2 font-medium">{row.sku || '—'}</td><td className="px-3 py-2 font-mono">{row.sourceValue || '(blank)'}</td><td className="px-3 py-2">{row.reason}</td><td className="px-3 py-2">{row.suggestion}</td></tr>)}</tbody></table>{preview.errors.length > 150 && <p className="p-2 text-xs text-primary-500">Showing the first 150 issues. Download the report to view all.</p>}</div></details>}
                            {preview.sample?.length > 0 && <details className="rounded-xl border border-primary-200"><summary className="cursor-pointer bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800">Sample detected prices</summary><div className="overflow-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase text-primary-500"><tr><th className="px-3 py-2">Excel row</th><th className="px-3 py-2">Part number</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Selected price</th></tr></thead><tbody>{preview.sample.map((row) => <tr key={`${row.sourceLineNumber}-${row.sku}`} className="border-t border-primary-100"><td className="px-3 py-2">{row.sourceLineNumber}</td><td className="px-3 py-2 font-semibold">{row.sku}</td><td className="px-3 py-2">{row.name || '—'}</td><td className="px-3 py-2">{formatPeso(row.price)}</td></tr>)}</tbody></table></div></details>}
                            {preview.priceChanges?.length > 0 && <details className="rounded-xl border border-primary-200"><summary className="cursor-pointer bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800">Price-by-price comparison (showing up to 80)</summary><div className="max-h-48 overflow-auto"><table className="min-w-full text-left text-sm"><thead className="sticky top-0 bg-white text-xs uppercase text-primary-500"><tr><th className="px-3 py-2">Part</th><th className="px-3 py-2">Previous</th><th className="px-3 py-2">New</th><th className="px-3 py-2">Result</th></tr></thead><tbody>{preview.priceChanges.map((row) => <tr key={row.sku} className="border-t border-primary-100"><td className="px-3 py-2">{row.sku}</td><td className="px-3 py-2">{formatPeso(row.previousPrice)}</td><td className="px-3 py-2">{formatPeso(row.newPrice)}</td><td className="px-3 py-2">{getChangeLabel(row.status)}</td></tr>)}</tbody></table></div></details>}
                            {preview.counts?.zeroPrices > 0 && <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><input type="checkbox" className="mt-1" checked={selection?.confirmZeroPrices === true} onChange={(event) => updateSelection({ confirmZeroPrices: event.target.checked })} /><span>{formatUploadCount(preview.counts.zeroPrices)} explicit zero price(s) found. Confirm only if ₱0.00 is intended for these parts.</span></label>}
                        </div>
                    )}

                    <details className="rounded-2xl border border-primary-200 bg-white p-4">
                        <summary className="cursor-pointer text-sm font-semibold text-primary-950"><History className="mr-2 inline h-4 w-4 text-accent-blue" />Saved price lists ({formatUploadCount(versions.length)})</summary>
                        <div className="mt-3">
                            <div className="flex justify-end">
                                <Button type="button" variant="ghost" size="sm" onClick={loadVersions} isLoading={isLoadingVersions}>Refresh</Button>
                            </div>
                            {versions.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {versions.map((version) => <div key={version.id} className="rounded-xl border border-primary-100 bg-primary-50 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="break-words font-semibold text-primary-950">{version.displayName || `Price list ${version.versionYear} · revision ${version.revision ?? 1}`}</p>
                                            <p className="mt-1 text-xs text-primary-600">Revision {version.revision ?? 1} · {formatUploadCount(version.rowCount)} parts · effective {version.effectiveFrom}</p>
                                            {version.upload?.originalFilename && <p className="mt-1 break-all text-xs text-primary-500">File: {version.upload.originalFilename}</p>}
                                            {version.upload?.worksheet && <p className="mt-1 text-xs text-primary-500">Sheet: {version.upload.worksheet} · {version.upload.pricingCategory?.replaceAll('_', ' ')}</p>}
                                            {version.upload?.uploadedAt && <p className="mt-1 text-xs text-primary-500">Uploaded {new Date(version.upload.uploadedAt).toLocaleString('en-PH')}</p>}
                                        </div>
                                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${version.isActive ? 'bg-emerald-100 text-emerald-700' : version.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-primary-100 text-primary-700'}`}>
                                            {version.isActive ? 'Active' : `${version.status.charAt(0).toUpperCase()}${version.status.slice(1)}`}
                                        </span>
                                    </div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => { setRevisionTarget(version); setRevisionName(version.displayName || `Price list ${version.versionYear} · revision ${version.revision ?? 1}`); setRevisionDate(version.effectiveFrom || ''); }}><Pencil className="mr-1 h-4 w-4" />Edit name / date</Button>
                                        {version.sourceFileAvailable && <Button type="button" variant="outline" size="sm" className="w-full" isLoading={downloadingVersionId === version.id} onClick={() => handleDownloadOriginal(version)}><Download className="mr-1 h-4 w-4" />Original file</Button>}
                                        {!version.isActive && version.status !== 'draft' && <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setActivationTarget(version)}>Restore revision</Button>}
                                        {!version.isActive && version.status === 'draft' && <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setActivationTarget(version)}>Publish draft</Button>}
                                        {!version.isActive && version.status === 'published' && <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setArchiveTarget(version)}><Archive className="mr-1 h-4 w-4" />Archive revision</Button>}
                                        {!version.isActive && version.status === 'draft' && <Button type="button" variant="outline" size="sm" className="w-full text-accent-danger" onClick={() => setDeleteTarget(version)}><Trash2 className="mr-1 h-4 w-4" />Delete draft</Button>}
                                    </div>
                                </div>)}
                            </div> : <p className="mt-2 text-sm text-primary-600">No saved revisions yet.</p>}
                        </div>
                    </details>

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
                            <p className="mt-2 text-xs text-primary-500">The original file and revision history are retained. Inventory quantities and completed transactions are not changed.</p>
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
                                        <p className="font-semibold text-emerald-950">{lastResult.noOp ? 'Price list already up to date' : lastResult.activationPending ? 'Revision saved — activation needs attention' : lastResult.isActive === false ? 'Price list draft saved' : 'Price list updated successfully'}</p>
                                        <p className="mt-1 text-emerald-700">
                                            {lastResult.message || describePricelistResult(lastResult)}
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
                            disabled={!preview?.canImport || !uploadAnalysis?.upload?.id}
                            leftIcon={<RefreshCcw className="w-4 h-4" />}>
                            Update Pricelist
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={Boolean(activationTarget)} onClose={() => !activatingVersionId && setActivationTarget(null)} title={activationTarget?.isActive ? 'Pricelist is already active' : activationTarget?.status === 'draft' ? 'Publish this draft?' : 'Restore this pricelist?'} size="md">
                {activationTarget && <div className="space-y-4">
                    <p className="text-sm text-primary-700">You are about to make <span className="font-semibold">{activationTarget.displayName || `Price list ${activationTarget.versionYear} · revision ${activationTarget.revision ?? 1}`}</span> the active retail pricelist. POS, quotations, and the public catalog will use its prices after confirmation.</p>
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This switches the active price snapshot. Inventory quantities and the saved revision history are preserved. Verify the row count and worksheet before proceeding.</p>
                    <div className="flex gap-3">
                        <Button type="button" variant="secondary" fullWidth onClick={() => setActivationTarget(null)} disabled={Boolean(activatingVersionId)}>Cancel</Button>
                        <Button type="button" variant="primary" fullWidth isLoading={activatingVersionId === activationTarget.id} onClick={() => handleActivate(activationTarget)}>Confirm and activate</Button>
                    </div>
                </div>}
            </Modal>

            <Modal isOpen={Boolean(revisionTarget)} onClose={() => !savingRevisionField && setRevisionTarget(null)} title="Edit saved revision" size="md">
                {revisionTarget && <div className="space-y-4">
                    <p className="text-sm text-primary-600">Change the label or effective date. These edits do not change any product price.</p>
                    <div className="space-y-2">
                        <Input label="Revision name" value={revisionName} maxLength={140} onChange={(event) => setRevisionName(event.target.value)} />
                        <Button type="button" variant="outline" isLoading={savingRevisionField === 'name'} disabled={Boolean(savingRevisionField) || !revisionName.trim()} onClick={() => void handleSaveRevisionField('name')}>Save name</Button>
                    </div>
                    <div className="space-y-2">
                        <Input label="Effective date" type="date" value={revisionDate} onChange={(event) => setRevisionDate(event.target.value)} />
                        <Button type="button" variant="outline" isLoading={savingRevisionField === 'date'} disabled={Boolean(savingRevisionField) || !revisionDate} onClick={() => void handleSaveRevisionField('date')}>Save date</Button>
                    </div>
                    <Button type="button" variant="secondary" fullWidth onClick={() => setRevisionTarget(null)} disabled={Boolean(savingRevisionField)}>Done</Button>
                </div>}
            </Modal>

            <Modal isOpen={Boolean(archiveTarget)} onClose={() => !isSubmitting && setArchiveTarget(null)} title="Archive this revision?" size="md">
                {archiveTarget && <div className="space-y-4">
                    <p className="text-sm text-primary-700">Archive <span className="font-semibold">{archiveTarget.displayName || `Price list ${archiveTarget.versionYear} · revision ${archiveTarget.revision ?? 1}`}</span>? It will remain in revision history and can still be restored later. Product prices and the original file are kept.</p>
                    <div className="flex gap-3"><Button type="button" variant="secondary" fullWidth onClick={() => setArchiveTarget(null)} disabled={isSubmitting}>Cancel</Button><Button type="button" variant="primary" fullWidth isLoading={isSubmitting} onClick={() => void handleArchiveRevision()}>Archive revision</Button></div>
                </div>}
            </Modal>

            <Modal isOpen={Boolean(deleteTarget)} onClose={() => !isSubmitting && setDeleteTarget(null)} title="Delete unpublished draft?" size="md">
                {deleteTarget && <div className="space-y-4">
                    <p className="text-sm text-primary-700">This permanently removes the never-published draft <span className="font-semibold">{deleteTarget.displayName || `Price list ${deleteTarget.versionYear} · revision ${deleteTarget.revision ?? 1}`}</span>, its draft rows, and its original upload if no other record uses that file.</p>
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Published or active revisions cannot be deleted. Product records, active prices, inventory, sales, and quotations are not deleted.</p>
                    <div className="flex gap-3"><Button type="button" variant="secondary" fullWidth onClick={() => setDeleteTarget(null)} disabled={isSubmitting}>Keep draft</Button><Button type="button" variant="primary" fullWidth isLoading={isSubmitting} onClick={() => void handleDeleteDraft()}>Delete draft</Button></div>
                </div>}
            </Modal>
        </>
    );
};

export default PriceListManager;

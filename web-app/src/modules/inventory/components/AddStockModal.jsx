import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, CheckCircle, ClipboardCheck, FileText, ListPlus, LoaderCircle, Package, Plus, Search, Trash2, UploadCloud, Wand2 } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import useDataStore from '../../../store/useDataStore';
import { getSuppliers } from '../../../services/catalogApi';
import { formatNumber } from '../../../utils/formatters';
import { getPartNumberSearchSuggestions, getProductPartNumber } from '../../../utils/barcode';
import { useLocator3DStore } from '../../locator3d/store/useLocator3DStore';
import { receiveStockFromSupplierInvoice } from '../services/receiveStock';
import {
    DIAMOND_INVOICE_SAMPLE_TEXT,
    parseSupplierInvoiceText,
    recognizeInvoiceImage,
} from '../utils/invoiceOcr';

const EMPTY_SUPPLIER = {
    id: '',
    name: '',
    contact: '',
    address: '',
    referenceNumber: '',
    receivedDate: new Date().toISOString().slice(0, 10),
    reason: 'Stock receiving',
};

const getSupplierContactDetails = (supplier = {}) => [
    supplier.contactName,
    supplier.phone,
    supplier.email,
].filter(Boolean).join(' | ');

function BulkItemRow({ item, index, onUpdate, onRemove, findProduct, products }) {
    const [query, setQuery] = useState(item.searchQuery || '');
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [showCamera, setShowCamera] = useState(false);

    const doSearch = useCallback(async (q) => {
        const id = q.trim();
        if (!id) {
            onUpdate(index, { product: null, searchQuery: q });
            setSearchError('');
            return;
        }

        setSearching(true);
        try {
            const found = await findProduct(id);
            if (found) {
                onUpdate(index, { product: found, searchQuery: q });
                setSearchError('');
            } else {
                onUpdate(index, { product: null, searchQuery: q });
                setSearchError('Part number not found');
            }
        } finally {
            setSearching(false);
        }
    }, [findProduct, index, onUpdate]);

    useEffect(() => {
        if (!query.trim()) return undefined;
        const timer = setTimeout(() => doSearch(query), 400);
        return () => clearTimeout(timer);
    }, [query, doSearch]);

    const currentQty = Number(item.product?.quantity ?? item.product?.stock ?? 0);
    const addQty = Number(item.quantity) || 0;
    const suggestions = useMemo(() => getPartNumberSearchSuggestions(products || [], query, 5), [products, query]);

    return (
        <div className="rounded-xl border border-primary-200 bg-white p-4 space-y-3 relative">
            {index > 0 && (
                <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="absolute top-3 right-3 text-primary-400 hover:text-red-500 transition-colors p-1"
                    aria-label="Remove product row"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            )}

            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                        type="text"
                        placeholder="Scan barcode or type part number..."
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            onUpdate(index, { searchQuery: e.target.value });
                        }}
                        className={`w-full pl-10 pr-4 py-2.5 bg-white border rounded-xl text-sm placeholder-primary-400 focus:outline-none focus:ring-2 shadow-sm transition-all ${
                            searchError ? 'border-red-300 focus:border-red-400 focus:ring-red-100' :
                            item.product ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-100' :
                            'border-primary-200 focus:border-accent-blue focus:ring-accent-blue/10'
                        } text-primary-950`}
                    />
                    {query.trim() && suggestions.length > 0 && (
                        <div className="absolute z-20 mt-2 max-h-48 w-full overflow-y-auto rounded-xl border border-primary-200 bg-white py-1 shadow-lg">
                            {suggestions.map((product) => (
                                <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => {
                                        const partNumber = getProductPartNumber(product);
                                        setQuery(partNumber);
                                        onUpdate(index, { product, searchQuery: partNumber });
                                        setSearchError('');
                                    }}
                                    className="flex w-full flex-col px-3 py-2 text-left transition hover:bg-primary-50"
                                >
                                    <span className="truncate text-sm font-semibold text-primary-950">{product.name}</span>
                                    <span className="font-mono text-xs text-primary-500">{getProductPartNumber(product) || 'No part number'} · Stock: {formatNumber(product.quantity ?? product.stock ?? 0)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <Button variant="secondary" onClick={() => setShowCamera(true)} type="button" className="px-3">
                    <Camera className="w-4 h-4" />
                </Button>
            </div>

            {searching && <p className="text-xs text-primary-400">Searching...</p>}
            {searchError && <p className="text-xs text-red-500">{searchError}</p>}

            {item.product && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-3">
                    <Package className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-primary-950 truncate">{item.product.name}</p>
                        <p className="font-mono text-xs text-primary-500">{getProductPartNumber(item.product)} - Stock: {formatNumber(currentQty)}</p>
                    </div>
                    {addQty > 0 && (
                        <div className="text-right flex-shrink-0">
                            <p className="text-xs text-primary-400">After</p>
                            <p className="text-sm font-bold text-emerald-700">{formatNumber(currentQty + addQty)}</p>
                        </div>
                    )}
                </div>
            )}

            <Input
                label="Quantity to Add *"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 50"
                value={item.quantity}
                onChange={(e) => onUpdate(index, { quantity: e.target.value })}
                disabled={!item.product}
            />
            <CameraScannerModal
                isOpen={showCamera}
                onClose={() => setShowCamera(false)}
                onScan={(code) => {
                    if (code) {
                        setQuery(code);
                        doSearch(code);
                    }
                }}
            />
        </div>
    );
}

const emptyInvoiceDraft = () => ({
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    orderNumber: '',
    supplierName: 'Diamond Motor Corporation',
    rawText: '',
    items: [],
});

const AddStockModal = ({ isOpen, onClose, onSave, onInvoicePosted }) => {
    const { findProduct, products } = useDataStore();
    const navigate = useNavigate();
    const setRecentlyReceivedStock = useLocator3DStore((state) => state.setRecentlyReceivedStock);
    const emptyItem = () => ({ product: null, searchQuery: '', quantity: '' });
    const [mode, setMode] = useState('barcode');
    const [bulkItems, setBulkItems] = useState([emptyItem()]);
    const [supplier, setSupplier] = useState(EMPTY_SUPPLIER);
    const [invoiceDraft, setInvoiceDraft] = useState(emptyInvoiceDraft());
    const [invoiceReceipt, setInvoiceReceipt] = useState(null);
    const [invoiceOcrText, setInvoiceOcrText] = useState('');
    const [ocrProgress, setOcrProgress] = useState({ status: '', progress: 0 });
    const [isReadingInvoice, setIsReadingInvoice] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitProgress, setSubmitProgress] = useState({ done: 0, total: 0 });
    const [bulkSuccess, setBulkSuccess] = useState(false);
    const [bulkResults, setBulkResults] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loadingSuppliers, setLoadingSuppliers] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        let isActive = true;

        setBulkItems([emptyItem()]);
        setMode('barcode');
        setSupplier(EMPTY_SUPPLIER);
        setInvoiceDraft(emptyInvoiceDraft());
        setInvoiceReceipt(null);
        setInvoiceOcrText('');
        setOcrProgress({ status: '', progress: 0 });
        setIsReadingInvoice(false);
        setError('');
        setIsSubmitting(false);
        setSubmitProgress({ done: 0, total: 0 });
        setBulkSuccess(false);
        setBulkResults([]);

        const loadSuppliers = async () => {
            setLoadingSuppliers(true);
            try {
                const supplierRows = await getSuppliers();
                if (isActive) {
                    setSuppliers(supplierRows);
                }
            } catch (loadError) {
                if (isActive) {
                    setError(loadError.message || 'Unable to load suppliers.');
                    setSuppliers([]);
                }
            } finally {
                if (isActive) {
                    setLoadingSuppliers(false);
                }
            }
        };

        void loadSuppliers();

        return () => {
            isActive = false;
        };
    }, [isOpen]);

    const updateSupplier = (field, val) => setSupplier((current) => ({ ...current, [field]: val }));

    const selectSupplier = (supplierId) => {
        const selectedSupplier = suppliers.find((item) => item.id === supplierId);
        if (!selectedSupplier) {
            setSupplier((current) => ({
                ...current,
                id: '',
                name: '',
                contact: '',
                address: '',
            }));
            return;
        }

        setSupplier((current) => ({
            ...current,
            id: selectedSupplier.id,
            name: selectedSupplier.name || '',
            contact: getSupplierContactDetails(selectedSupplier),
            address: selectedSupplier.address || '',
        }));
    };

    const updateBulkItem = useCallback((index, changes) => {
        setBulkItems((items) => items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
    }, []);

    const removeBulkItem = useCallback((index) => {
        setBulkItems((items) => (items.length <= 1 ? items : items.filter((_, i) => i !== index)));
    }, []);

    const addBulkItem = () => setBulkItems((items) => [...items, emptyItem()]);
    const validBulkItems = bulkItems.filter((item) => item.product && Number(item.quantity) > 0);
    const invoiceTotals = useMemo(() => {
        const totalQuantity = invoiceDraft.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        const totalCost = invoiceDraft.items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitCost) || 0)), 0);

        return {
            totalCost,
            totalQuantity,
        };
    }, [invoiceDraft.items]);

    const applyParsedInvoice = useCallback((parsedInvoice) => {
        const supplierName = parsedInvoice.supplierName || 'Diamond Motor Corporation';
        const matchedSupplier = suppliers.find((item) => item.name?.toLowerCase().includes(supplierName.toLowerCase().replace(' corporation', '')));

        setInvoiceDraft({
            invoiceNumber: parsedInvoice.invoiceNumber || '',
            invoiceDate: parsedInvoice.invoiceDate || new Date().toISOString().slice(0, 10),
            orderNumber: parsedInvoice.orderNumber || '',
            supplierName,
            rawText: parsedInvoice.rawText || '',
            items: parsedInvoice.items,
        });
        setSupplier((current) => ({
            ...current,
            id: matchedSupplier?.id || current.id,
            name: matchedSupplier?.name || supplierName,
            contact: matchedSupplier ? getSupplierContactDetails(matchedSupplier) : current.contact,
            address: matchedSupplier?.address || current.address,
            referenceNumber: parsedInvoice.invoiceNumber || current.referenceNumber,
            receivedDate: parsedInvoice.invoiceDate || current.receivedDate,
            reason: 'Supplier invoice stock receiving',
        }));
        setInvoiceOcrText(parsedInvoice.rawText || '');
        setError(parsedInvoice.items.length ? '' : 'No line items were detected. Check the image or paste clearer OCR text.');
    }, [suppliers]);

    const updateInvoiceItem = (index, changes) => {
        setInvoiceDraft((current) => ({
            ...current,
            items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)),
        }));
    };

    const removeInvoiceItem = (index) => {
        setInvoiceDraft((current) => ({
            ...current,
            items: current.items.filter((_, itemIndex) => itemIndex !== index),
        }));
    };

    const addInvoiceItem = () => {
        setInvoiceDraft((current) => ({
            ...current,
            items: [...current.items, { partNumber: '', description: '', quantity: 1, unitCost: 0 }],
        }));
    };

    const handleInvoiceImage = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        setIsReadingInvoice(true);
        setError('');
        setOcrProgress({ status: 'Reading invoice image', progress: 0.05 });

        try {
            const parsedInvoice = await recognizeInvoiceImage(file, (progress) => {
                setOcrProgress({
                    status: progress.status || 'Reading invoice image',
                    progress: progress.progress || 0,
                });
            });
            applyParsedInvoice(parsedInvoice);
        } catch (scanError) {
            setError(scanError.message || 'Unable to read the invoice image.');
        } finally {
            setIsReadingInvoice(false);
        }
    };

    const parsePastedInvoiceText = () => {
        applyParsedInvoice(parseSupplierInvoiceText(invoiceOcrText));
    };

    const loadSampleInvoice = () => {
        applyParsedInvoice(parseSupplierInvoiceText(DIAMOND_INVOICE_SAMPLE_TEXT));
    };

    const handleSaveBulk = async () => {
        if (validBulkItems.length === 0) {
            setError('Add at least one product with a valid quantity.');
            return;
        }
        if (!supplier.id) {
            setError('Choose a supplier from Supplier Management.');
            return;
        }

        setIsSubmitting(true);
        setError('');
        setSubmitProgress({ done: 0, total: validBulkItems.length });
        const results = [];

        try {
            for (let i = 0; i < validBulkItems.length; i += 1) {
                const item = validBulkItems[i];
                const qty = Number(item.quantity);
                await onSave({
                    product: item.product,
                    quantity: qty,
                    supplierId: supplier.id,
                    supplierName: supplier.name.trim(),
                    supplierContact: supplier.contact.trim(),
                    supplierAddress: supplier.address.trim(),
                    referenceNumber: supplier.referenceNumber.trim(),
                    receivedDate: supplier.receivedDate,
                    reason: supplier.reason.trim() || 'Stock receiving',
                    _bulkMode: true,
                });
                results.push({ name: item.product.name, sku: getProductPartNumber(item.product), qty });
                setSubmitProgress({ done: i + 1, total: validBulkItems.length });
            }
            setBulkResults(results);
            setBulkSuccess(true);
        } catch (e) {
            setError(e.message || 'Failed to receive stock.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePostInvoice = async () => {
        const items = invoiceDraft.items
            .map((item) => ({
                partNumber: String(item.partNumber || '').trim().toUpperCase(),
                description: String(item.description || item.partNumber || '').trim(),
                quantity: Number(item.quantity),
                unitCost: Number(item.unitCost || 0),
                uom: 'PC',
                brand: 'Mitsubishi',
            }))
            .filter((item) => item.partNumber && item.quantity > 0);

        if (!invoiceDraft.invoiceNumber.trim()) {
            setError('Invoice number is required before posting.');
            return;
        }

        if (!supplier.name.trim() && !invoiceDraft.supplierName.trim()) {
            setError('Supplier name is required before posting.');
            return;
        }

        if (!items.length) {
            setError('Add or detect at least one invoice line item with quantity greater than zero.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const receipt = await receiveStockFromSupplierInvoice({
                invoiceNumber: invoiceDraft.invoiceNumber,
                invoiceDate: invoiceDraft.invoiceDate,
                supplierId: supplier.id || undefined,
                supplierName: supplier.name || invoiceDraft.supplierName,
                poReference: invoiceDraft.orderNumber,
                notes: supplier.reason || 'Supplier invoice stock receiving',
                source: 'ocr_upload',
                ocrReady: true,
                items,
            });
            const receiptItems = (receipt.items || []).map((item) => ({
                productId: item.productId,
                partNumber: item.partNumber,
                description: item.description,
                quantity: Number(item.quantity) || 0,
                receiptId: receipt.receiptId,
            }));

            setRecentlyReceivedStock({
                createdAt: new Date().toISOString(),
                items: receiptItems,
                receiptId: receipt.receiptId,
                returnTo: '/inventory',
                source: 'supplier_invoice',
            });
            setInvoiceReceipt(receipt);
            setBulkResults(receiptItems.map((item) => ({
                name: item.description || item.partNumber,
                sku: item.partNumber,
                qty: item.quantity,
            })));
            setBulkSuccess(true);
            onInvoicePosted?.(receipt);
        } catch (postError) {
            setError(postError.message || 'Failed to post supplier invoice stock.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const open3DStockroom = () => {
        onClose();
        navigate('/locator-3d?mode=stock-receipt');
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Stock" size="lg">
            <div className="space-y-5">
                {bulkSuccess ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                        <CheckCircle className="w-16 h-16 text-emerald-500" />
                        <p className="text-xl font-bold text-primary-950">Stock Received!</p>
                        <div className="w-full max-w-sm space-y-2">
                            {bulkResults.map((result, index) => (
                                <div key={`${result.sku}-${index}`} className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2 text-sm">
                                    <div className="min-w-0">
                                        <p className="font-bold text-primary-950 truncate">{result.name}</p>
                                        <p className="text-xs font-mono text-primary-500">{result.sku}</p>
                                    </div>
                                    <span className="font-bold text-emerald-700 flex-shrink-0 ml-3">+{formatNumber(result.qty)}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Button variant="secondary" onClick={onClose}>Back to Inventory</Button>
                            {invoiceReceipt && (
                                <Button variant="primary" onClick={open3DStockroom} rightIcon={<ArrowRight className="h-4 w-4" />}>
                                    Assign Locations in 3D Stockroom
                                </Button>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-primary-200 bg-primary-50 p-1">
                            <button
                                type="button"
                                onClick={() => setMode('barcode')}
                                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${mode === 'barcode' ? 'bg-white text-primary-950 shadow-sm' : 'text-primary-500 hover:text-primary-800'}`}
                            >
                                <Package className="h-4 w-4" />
                                Add Existing Stock
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('invoice')}
                                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${mode === 'invoice' ? 'bg-white text-primary-950 shadow-sm' : 'text-primary-500 hover:text-primary-800'}`}
                            >
                                <FileText className="h-4 w-4" />
                                Scan Parts Invoice
                            </button>
                        </div>

                        {mode === 'barcode' ? (
                            <>
                                <p className="text-sm text-primary-500">
                                    Scan barcodes or type part numbers to add stock to existing products. Register brand-new products from Product Management.
                                </p>

                                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                                    {bulkItems.map((item, index) => (
                                        <BulkItemRow
                                            key={index}
                                            item={item}
                                            index={index}
                                            onUpdate={updateBulkItem}
                                            onRemove={removeBulkItem}
                                            findProduct={findProduct}
                                            products={products}
                                        />
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    onClick={addBulkItem}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-primary-200 rounded-xl text-sm font-bold text-primary-500 hover:border-accent-blue hover:text-accent-blue transition-colors"
                                >
                                    <ListPlus className="w-4 h-4" />
                                    Add Another Product
                                </button>
                            </>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-accent-blue/20 bg-blue-50/80 p-4">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-accent-blue shadow-sm">
                                                <Camera className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-primary-950">Scan a printed Diamond parts invoice</p>
                                                <p className="mt-1 text-sm text-primary-600">Capture the full page. The system detects stock numbers, quantities, invoice number, order number, and date, then lets you review before posting.</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent-blue px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
                                                <UploadCloud className="h-4 w-4" />
                                                Camera / Upload
                                                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleInvoiceImage} />
                                            </label>
                                            <Button variant="secondary" type="button" onClick={loadSampleInvoice} leftIcon={<Wand2 className="h-4 w-4" />}>
                                                Use Sample
                                            </Button>
                                        </div>
                                    </div>
                                    {isReadingInvoice && (
                                        <div className="mt-4 space-y-2">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-primary-700">
                                                <LoaderCircle className="h-4 w-4 animate-spin" />
                                                {ocrProgress.status || 'Reading invoice image'}
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-white">
                                                <div className="h-full rounded-full bg-accent-blue transition-all" style={{ width: `${Math.max(8, Math.round((ocrProgress.progress || 0) * 100))}%` }} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="grid gap-3 sm:grid-cols-3">
                                    <Input label="Invoice No." value={invoiceDraft.invoiceNumber} onChange={(event) => setInvoiceDraft((current) => ({ ...current, invoiceNumber: event.target.value }))} placeholder="PSI-HO-A0089610" />
                                    <Input label="Order No." value={invoiceDraft.orderNumber} onChange={(event) => setInvoiceDraft((current) => ({ ...current, orderNumber: event.target.value }))} placeholder="PRS-HO-A0068334" />
                                    <Input label="Invoice Date" type="date" value={invoiceDraft.invoiceDate} onChange={(event) => setInvoiceDraft((current) => ({ ...current, invoiceDate: event.target.value }))} />
                                </div>

                                <div className="overflow-hidden rounded-2xl border border-primary-200 bg-white">
                                    <div className="flex items-center justify-between border-b border-primary-100 px-4 py-3">
                                        <div>
                                            <p className="text-sm font-black text-primary-950">Detected Line Items</p>
                                            <p className="text-xs text-primary-500">{invoiceDraft.items.length} parts / {formatNumber(invoiceTotals.totalQuantity)} total qty</p>
                                        </div>
                                        <Button variant="secondary" type="button" onClick={addInvoiceItem} leftIcon={<ListPlus className="h-4 w-4" />}>Add Row</Button>
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto">
                                        {invoiceDraft.items.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                                                <ClipboardCheck className="h-10 w-10 text-primary-300" />
                                                <p className="font-bold text-primary-700">No parts detected yet</p>
                                                <p className="max-w-sm text-sm text-primary-500">Use the camera/upload button, paste OCR text below, or add rows manually.</p>
                                            </div>
                                        ) : (
                                            <div className="min-w-[760px]">
                                                <div className="grid grid-cols-[150px_1fr_90px_120px_44px] gap-2 bg-primary-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-primary-500">
                                                    <span>Part Number</span>
                                                    <span>Description</span>
                                                    <span>Qty</span>
                                                    <span>Unit Cost</span>
                                                    <span />
                                                </div>
                                                {invoiceDraft.items.map((item, index) => (
                                                    <div key={`${item.partNumber}-${index}`} className="grid grid-cols-[150px_1fr_90px_120px_44px] gap-2 border-t border-primary-100 px-3 py-2">
                                                        <input className="input px-3 py-2 font-mono text-xs uppercase" value={item.partNumber} onChange={(event) => updateInvoiceItem(index, { partNumber: event.target.value })} />
                                                        <input className="input px-3 py-2 text-sm" value={item.description} onChange={(event) => updateInvoiceItem(index, { description: event.target.value })} />
                                                        <input className="input px-3 py-2 text-sm" type="number" min="1" value={item.quantity} onChange={(event) => updateInvoiceItem(index, { quantity: event.target.value })} />
                                                        <input className="input px-3 py-2 text-sm" type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => updateInvoiceItem(index, { unitCost: event.target.value })} />
                                                        <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-primary-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeInvoiceItem(index)} aria-label="Remove invoice row">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-3">
                                    <label className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500" htmlFor="invoice-ocr-text">OCR Text Review</label>
                                    <textarea
                                        id="invoice-ocr-text"
                                        className="mt-2 min-h-24 w-full rounded-xl border border-primary-200 bg-white p-3 text-xs text-primary-800 outline-none transition focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/15"
                                        value={invoiceOcrText}
                                        onChange={(event) => setInvoiceOcrText(event.target.value)}
                                        placeholder="Paste OCR text here if the camera result needs correction..."
                                    />
                                    <div className="mt-2 flex justify-end">
                                        <Button variant="secondary" type="button" onClick={parsePastedInvoiceText} disabled={!invoiceOcrText.trim()}>
                                            Re-detect from Text
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="rounded-xl border border-primary-200 p-4 space-y-4">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Supplier Information</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label className="block sm:col-span-2">
                                    <span className="mb-1 block text-xs font-medium text-primary-600">Supplier</span>
                                    <select
                                        className="input w-full"
                                        value={supplier.id}
                                        onChange={(e) => selectSupplier(e.target.value)}
                                        disabled={loadingSuppliers}
                                    >
                                        <option value="">{loadingSuppliers ? 'Loading suppliers...' : 'Choose supplier'}</option>
                                        {suppliers.map((supplierOption) => (
                                            <option key={supplierOption.id} value={supplierOption.id}>
                                                {supplierOption.name}{supplierOption.supplierId ? ` - ${supplierOption.supplierId}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                {mode === 'invoice' && (
                                    <Input
                                        label="Supplier Name from Invoice"
                                        placeholder="Diamond Motor Corporation"
                                        value={supplier.name || invoiceDraft.supplierName}
                                        onChange={(event) => {
                                            updateSupplier('name', event.target.value);
                                            setInvoiceDraft((current) => ({ ...current, supplierName: event.target.value }));
                                        }}
                                    />
                                )}
                                <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-3 sm:col-span-2">
                                    {supplier.id ? (
                                        <div className="grid gap-3 text-sm sm:grid-cols-3">
                                            <div>
                                                <p className="text-xs font-semibold text-primary-500">Supplier Name</p>
                                                <p className="mt-1 font-bold text-primary-950">{supplier.name || '-'}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-primary-500">Contact Details</p>
                                                <p className="mt-1 text-primary-700">{supplier.contact || '-'}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-primary-500">Address</p>
                                                <p className="mt-1 text-primary-700">{supplier.address || '-'}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-primary-500">Select a supplier to use its saved name, contact details, and address.</p>
                                    )}
                                </div>
                                <Input label="Invoice / Reference No." placeholder="DR / OR number" value={supplier.referenceNumber} onChange={(e) => updateSupplier('referenceNumber', e.target.value)} />
                                <Input label="Received Date" type="date" value={supplier.receivedDate} onChange={(e) => updateSupplier('receivedDate', e.target.value)} />
                                <Input label="Reason / Notes" placeholder="Stock receiving" value={supplier.reason} onChange={(e) => updateSupplier('reason', e.target.value)} />
                            </div>
                        </div>

                        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

                        {isSubmitting && submitProgress.total > 1 && (
                            <div className="space-y-1">
                                <div className="w-full bg-primary-100 rounded-full h-2">
                                    <div className="bg-accent-blue h-2 rounded-full transition-all" style={{ width: `${(submitProgress.done / submitProgress.total) * 100}%` }} />
                                </div>
                                <p className="text-xs text-primary-500 text-center">Processing {submitProgress.done} of {submitProgress.total} products...</p>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-primary-100">
                            <p className="text-xs text-primary-400">
                                {mode === 'invoice'
                                    ? `${invoiceDraft.items.length} invoice line${invoiceDraft.items.length !== 1 ? 's' : ''} / ${formatNumber(invoiceTotals.totalQuantity)} qty`
                                    : `${validBulkItems.length} product${validBulkItems.length !== 1 ? 's' : ''} ready`}
                            </p>
                            <div className="flex gap-3">
                                <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
                                <Button
                                    variant="primary"
                                    type="button"
                                    onClick={mode === 'invoice' ? handlePostInvoice : handleSaveBulk}
                                    isLoading={isSubmitting}
                                    disabled={mode === 'invoice'
                                        ? invoiceDraft.items.length === 0 || isSubmitting || isReadingInvoice
                                        : validBulkItems.length === 0 || !supplier.id || isSubmitting}
                                    leftIcon={<Plus className="w-4 h-4" />}
                                >
                                    {mode === 'invoice' ? `Post Invoice Stock (${invoiceDraft.items.length})` : `Receive Stock (${validBulkItems.length})`}
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};

export default AddStockModal;

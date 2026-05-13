import { useState, useEffect, useRef } from 'react';
import { Camera, Search, Plus, Package, Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import useDataStore from '../../../store/useDataStore';
import { formatNumber } from '../../../utils/formatters';

const TAB_SINGLE = 'single';
const TAB_BULK = 'bulk';

const EMPTY_SUPPLIER = {
    name: '',
    contact: '',
    address: '',
    referenceNumber: '',
    receivedDate: new Date().toISOString().slice(0, 10),
    reason: 'Stock receiving',
};

function parseBulkCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    return lines.map((line, i) => {
        const cols = line.split(',').map((c) => c.trim());
        return {
            _rowIndex: i,
            sku: cols[0] || '',
            quantity: cols[1] || '',
            supplierName: cols[2] || '',
            referenceNumber: cols[3] || '',
            status: 'pending', // pending | matched | error
            product: null,
            errorMessage: '',
        };
    });
}

// ── Single-item form ──────────────────────────────────────────────────────────
function SingleTab({ findProduct, onSave, onClose }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [showCamera, setShowCamera] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [quantityToAdd, setQuantityToAdd] = useState('');
    const [supplier, setSupplier] = useState(EMPTY_SUPPLIER);
    const [error, setError] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const id = searchQuery.trim();
        if (!id) { setSelectedProduct(null); setError(''); return; }
        let active = true;
        setIsSearching(true);
        void (async () => {
            const found = await findProduct(id);
            if (!active) return;
            if (found) { setSelectedProduct(found); setError(''); }
            else { setSelectedProduct(null); setError('Part Number (SKU) not found in Master Catalog.'); }
            setIsSearching(false);
        })();
        return () => { active = false; };
    }, [findProduct, searchQuery]);

    const updateSupplier = (field, value) => setSupplier((s) => ({ ...s, [field]: value }));

    const handleSave = async () => {
        const qty = Number(quantityToAdd);
        if (!selectedProduct) { setError('Please scan or enter a valid Part Number first.'); return; }
        if (!Number.isFinite(qty) || qty <= 0) { setError('Please enter a valid quantity greater than 0.'); return; }
        if (!supplier.name.trim()) { setError('Supplier name is required.'); return; }
        if (!supplier.contact.trim()) { setError('Supplier contact details are required.'); return; }
        setIsSubmitting(true); setError('');
        try {
            await onSave({
                product: selectedProduct,
                quantity: qty,
                supplierName: supplier.name.trim(),
                supplierContact: supplier.contact.trim(),
                supplierAddress: supplier.address.trim(),
                referenceNumber: supplier.referenceNumber.trim(),
                receivedDate: supplier.receivedDate,
                reason: supplier.reason.trim() || 'Stock receiving',
            });
        } catch (e) { setError(e.message || 'Failed to receive stock.'); }
        finally { setIsSubmitting(false); }
    };

    const currentQty = Number(selectedProduct?.quantity ?? selectedProduct?.stock ?? 0);
    const projected = selectedProduct && Number(quantityToAdd) > 0 ? currentQty + Number(quantityToAdd) : currentQty;

    return (
        <div className="space-y-5">
            {/* SKU search */}
            <div>
                <label className="block text-xs font-bold uppercase tracking-[0.14em] text-primary-500 mb-1.5">
                    Scan or Enter Part Number (SKU) <span className="text-accent-danger">*</span>
                </label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                        <input
                            type="text"
                            placeholder="Scan barcode or type SKU..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                            className={`w-full pl-10 pr-4 py-2.5 bg-white border rounded-xl text-sm text-primary-950 placeholder-primary-400 focus:outline-none focus:ring-2 shadow-sm transition-all ${
                                error ? 'border-red-300 focus:border-red-400 focus:ring-red-100' :
                                selectedProduct ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-100' :
                                'border-primary-200 focus:border-accent-blue focus:ring-accent-blue/10'
                            }`}
                        />
                    </div>
                    <Button variant="secondary" onClick={() => setShowCamera(true)} type="button" className="px-3">
                        <Camera className="w-4 h-4 text-primary-600" />
                    </Button>
                </div>
                {isSearching && <p className="text-xs text-primary-400 mt-1">Searching catalog...</p>}
                {!isSearching && error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>

            {/* Product preview */}
            {selectedProduct && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-white border border-emerald-200 flex items-center justify-center">
                            <Package className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <p className="font-bold text-sm text-primary-950">{selectedProduct.name}</p>
                            <p className="font-mono text-xs text-primary-500">{selectedProduct.sku}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-emerald-200 text-center">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-primary-400">Current</p>
                            <p className="text-lg font-bold text-primary-900">{formatNumber(currentQty)}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-primary-400">Adding</p>
                            <p className="text-lg font-bold text-accent-blue">{quantityToAdd ? formatNumber(Number(quantityToAdd)) : '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-primary-400">After</p>
                            <p className="text-lg font-bold text-emerald-700">{formatNumber(projected)}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Quantity */}
            <Input
                label="Quantity to Add *"
                type="number" min="1" step="1"
                placeholder="e.g. 50"
                value={quantityToAdd}
                onChange={(e) => setQuantityToAdd(e.target.value)}
                disabled={!selectedProduct}
            />

            {/* Supplier fields */}
            <div className="rounded-xl border border-primary-200 p-4 space-y-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Supplier Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Supplier Name *" placeholder="e.g. Mitsubishi Motors PH" value={supplier.name} onChange={(e) => updateSupplier('name', e.target.value)} disabled={!selectedProduct} />
                    <Input label="Contact Details *" placeholder="Phone or email" value={supplier.contact} onChange={(e) => updateSupplier('contact', e.target.value)} disabled={!selectedProduct} />
                    <Input label="Address" placeholder="Supplier address" value={supplier.address} onChange={(e) => updateSupplier('address', e.target.value)} disabled={!selectedProduct} />
                    <Input label="Invoice / Reference No." placeholder="DR / OR number" value={supplier.referenceNumber} onChange={(e) => updateSupplier('referenceNumber', e.target.value)} disabled={!selectedProduct} />
                    <Input label="Received Date" type="date" value={supplier.receivedDate} onChange={(e) => updateSupplier('receivedDate', e.target.value)} disabled={!selectedProduct} />
                    <Input label="Reason" placeholder="Stock receiving" value={supplier.reason} onChange={(e) => updateSupplier('reason', e.target.value)} disabled={!selectedProduct} />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-primary-100">
                <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
                <Button
                    variant="primary" type="button"
                    onClick={handleSave}
                    isLoading={isSubmitting}
                    disabled={!selectedProduct || !quantityToAdd || Number(quantityToAdd) <= 0 || !supplier.name.trim() || !supplier.contact.trim() || isSubmitting}
                    leftIcon={<Plus className="w-4 h-4" />}
                >
                    Receive Stock
                </Button>
            </div>

            <CameraScannerModal isOpen={showCamera} onClose={() => setShowCamera(false)} onScan={(code) => { if (code) setSearchQuery(code); }} />
        </div>
    );
}

// ── Bulk CSV tab ──────────────────────────────────────────────────────────────
function BulkTab({ findProduct, onBulkSave, onClose }) {
    const fileRef = useRef(null);
    const [rows, setRows] = useState([]);
    const [csvText, setCsvText] = useState('');
    const [globalSupplier, setGlobalSupplier] = useState(EMPTY_SUPPLIER);
    const [validating, setValidating] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    const updateGlobal = (field, val) => setGlobalSupplier((s) => ({ ...s, [field]: val }));

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setCsvText(ev.target.result || '');
        reader.readAsText(file);
    };

    const handleValidate = async () => {
        if (!csvText.trim()) { setError('Paste CSV data or upload a file first.'); return; }
        setValidating(true); setError('');
        const parsed = parseBulkCsv(csvText);
        const resolved = await Promise.all(
            parsed.map(async (row) => {
                if (!row.sku) return { ...row, status: 'error', errorMessage: 'SKU is missing' };
                const qty = Number(row.quantity);
                if (!Number.isFinite(qty) || qty <= 0) return { ...row, status: 'error', errorMessage: 'Invalid quantity' };
                const product = await findProduct(row.sku);
                if (!product) return { ...row, status: 'error', errorMessage: 'SKU not found in catalog' };
                return { ...row, status: 'matched', product };
            })
        );
        setRows(resolved);
        setValidating(false);
    };

    const validRows = rows.filter((r) => r.status === 'matched');
    const errorRows = rows.filter((r) => r.status === 'error');

    const handleSubmit = async () => {
        if (validRows.length === 0) { setError('No valid rows to submit.'); return; }
        if (!globalSupplier.name.trim()) { setError('Supplier name is required.'); return; }
        if (!globalSupplier.contact.trim()) { setError('Supplier contact is required.'); return; }
        setSubmitting(true); setError('');
        try {
            await onBulkSave(validRows.map((row) => ({
                product: row.product,
                quantity: Number(row.quantity),
                supplierName: (row.supplierName || globalSupplier.name).trim(),
                supplierContact: globalSupplier.contact.trim(),
                supplierAddress: globalSupplier.address.trim(),
                referenceNumber: (row.referenceNumber || globalSupplier.referenceNumber).trim(),
                receivedDate: globalSupplier.receivedDate,
                reason: globalSupplier.reason || 'Bulk stock receiving',
            })));
            setDone(true);
        } catch (e) { setError(e.message || 'Failed to submit bulk stock.'); }
        finally { setSubmitting(false); }
    };

    if (done) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
                <CheckCircle className="w-16 h-16 text-emerald-500" />
                <p className="text-xl font-bold text-primary-950">Bulk Stock Received!</p>
                <p className="text-sm text-primary-500">{validRows.length} items successfully added to inventory.</p>
                <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Instructions */}
            <div className="rounded-xl bg-accent-blue/5 border border-accent-blue/20 p-4 text-sm text-primary-700">
                <p className="font-bold mb-1">CSV Format:</p>
                <code className="text-xs bg-white border border-primary-200 rounded px-2 py-1 block">
                    SKU, Quantity, Supplier Name (optional), Reference No. (optional)
                </code>
                <p className="mt-2 text-xs text-primary-500">One item per line. Supplier name in CSV overrides the global supplier below if provided.</p>
            </div>

            {/* Paste / upload */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Paste CSV Data</label>
                    <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-semibold text-accent-blue hover:underline flex items-center gap-1">
                        <Upload className="w-3 h-3" /> Upload .csv file
                    </button>
                    <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                </div>
                <textarea
                    rows={5}
                    placeholder={"MZ314019,10,Mitsubishi PH,DR-2024-001\nMB380200,5,,\nMR507437,20,Parts Depot,INV-555"}
                    value={csvText}
                    onChange={(e) => { setCsvText(e.target.value); setRows([]); }}
                    className="w-full rounded-xl border border-primary-200 bg-white px-4 py-3 font-mono text-xs text-primary-950 focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 resize-none"
                />
            </div>

            <Button variant="secondary" onClick={handleValidate} isLoading={validating} className="w-full">
                Validate Items
            </Button>

            {/* Preview table */}
            {rows.length > 0 && (
                <div className="rounded-xl border border-primary-200 overflow-hidden">
                    <div className="bg-primary-50 px-4 py-2 flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">{rows.length} rows — {validRows.length} valid, {errorRows.length} errors</p>
                    </div>
                    <div className="overflow-x-auto max-h-52 overflow-y-auto">
                        <table className="min-w-full text-sm">
                            <thead className="sticky top-0 bg-white border-b border-primary-100">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-primary-400">SKU</th>
                                    <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-primary-400">Product</th>
                                    <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wide text-primary-400">Current</th>
                                    <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wide text-primary-400">Adding</th>
                                    <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wide text-primary-400">After</th>
                                    <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-primary-400">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-primary-50">
                                {rows.map((row) => {
                                    const current = Number(row.product?.quantity ?? row.product?.stock ?? 0);
                                    const adding = Number(row.quantity);
                                    return (
                                        <tr key={row._rowIndex} className={row.status === 'error' ? 'bg-red-50' : 'hover:bg-primary-50/50'}>
                                            <td className="px-3 py-2 font-mono text-xs text-primary-600">{row.sku}</td>
                                            <td className="px-3 py-2 text-xs text-primary-900 max-w-[160px] truncate">{row.product?.name || '—'}</td>
                                            <td className="px-3 py-2 text-right text-xs text-primary-600">{row.product ? formatNumber(current) : '—'}</td>
                                            <td className="px-3 py-2 text-right text-xs font-bold text-accent-blue">{Number.isFinite(adding) && adding > 0 ? formatNumber(adding) : '—'}</td>
                                            <td className="px-3 py-2 text-right text-xs font-bold text-emerald-700">{row.product && Number.isFinite(adding) ? formatNumber(current + adding) : '—'}</td>
                                            <td className="px-3 py-2">
                                                {row.status === 'matched'
                                                    ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle className="w-3 h-3" /> OK</span>
                                                    : <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600"><AlertCircle className="w-3 h-3" /> {row.errorMessage}</span>
                                                }
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Global supplier */}
            {rows.length > 0 && (
                <div className="rounded-xl border border-primary-200 p-4 space-y-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Global Supplier Details (applies to all rows)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Supplier Name *" placeholder="e.g. Mitsubishi Motors PH" value={globalSupplier.name} onChange={(e) => updateGlobal('name', e.target.value)} />
                        <Input label="Contact Details *" placeholder="Phone or email" value={globalSupplier.contact} onChange={(e) => updateGlobal('contact', e.target.value)} />
                        <Input label="Address" placeholder="Supplier address" value={globalSupplier.address} onChange={(e) => updateGlobal('address', e.target.value)} />
                        <Input label="Reference No." placeholder="Batch reference" value={globalSupplier.referenceNumber} onChange={(e) => updateGlobal('referenceNumber', e.target.value)} />
                        <Input label="Received Date" type="date" value={globalSupplier.receivedDate} onChange={(e) => updateGlobal('receivedDate', e.target.value)} />
                        <Input label="Reason" placeholder="Bulk stock receiving" value={globalSupplier.reason} onChange={(e) => updateGlobal('reason', e.target.value)} />
                    </div>
                </div>
            )}

            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

            <div className="flex justify-end gap-3 pt-2 border-t border-primary-100">
                <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
                {validRows.length > 0 && (
                    <Button variant="primary" onClick={handleSubmit} isLoading={submitting} leftIcon={<Plus className="w-4 h-4" />}>
                        Receive {validRows.length} Item{validRows.length !== 1 ? 's' : ''}
                    </Button>
                )}
            </div>
        </div>
    );
}

// ── Main modal ────────────────────────────────────────────────────────────────
const AddStockModal = ({ isOpen, onClose, onSave }) => {
    const { findProduct } = useDataStore();
    const [activeTab, setActiveTab] = useState(TAB_SINGLE);

    const handleBulkSave = async (items) => {
        // Submit each item sequentially
        for (const item of items) {
            await onSave(item);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Receiving & Add Stock" size="lg">
            {/* Tab toggle */}
            <div className="flex gap-1 p-1 bg-primary-100 rounded-xl mb-6">
                <button
                    type="button"
                    onClick={() => setActiveTab(TAB_SINGLE)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${activeTab === TAB_SINGLE ? 'bg-white text-primary-950 shadow-sm' : 'text-primary-500 hover:text-primary-700'}`}
                >
                    Single Item
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab(TAB_BULK)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${activeTab === TAB_BULK ? 'bg-white text-primary-950 shadow-sm' : 'text-primary-500 hover:text-primary-700'}`}
                >
                    Bulk Import (CSV)
                </button>
            </div>

            {activeTab === TAB_SINGLE
                ? <SingleTab key="single" findProduct={findProduct} onSave={onSave} onClose={onClose} />
                : <BulkTab key="bulk" findProduct={findProduct} onBulkSave={handleBulkSave} onClose={onClose} />
            }
        </Modal>
    );
};

export default AddStockModal;

import { useState, useEffect, useCallback } from 'react';
import { Camera, Search, Plus, Package, CheckCircle, Trash2, ListPlus } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import useDataStore from '../../../store/useDataStore';
import { formatNumber } from '../../../utils/formatters';

const EMPTY_SUPPLIER = {
    name: '',
    contact: '',
    address: '',
    referenceNumber: '',
    receivedDate: new Date().toISOString().slice(0, 10),
    reason: 'Stock receiving',
};

function BulkItemRow({ item, index, onUpdate, onRemove, findProduct }) {
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
                setSearchError('SKU not found');
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
                        placeholder="Scan barcode or type SKU..."
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
                        <p className="font-mono text-xs text-primary-500">{item.product.sku} - Stock: {formatNumber(currentQty)}</p>
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

const AddStockModal = ({ isOpen, onClose, onSave }) => {
    const { findProduct } = useDataStore();
    const emptyItem = () => ({ product: null, searchQuery: '', quantity: '' });
    const [bulkItems, setBulkItems] = useState([emptyItem()]);
    const [supplier, setSupplier] = useState(EMPTY_SUPPLIER);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitProgress, setSubmitProgress] = useState({ done: 0, total: 0 });
    const [bulkSuccess, setBulkSuccess] = useState(false);
    const [bulkResults, setBulkResults] = useState([]);

    useEffect(() => {
        if (!isOpen) return;
        setBulkItems([emptyItem()]);
        setSupplier(EMPTY_SUPPLIER);
        setError('');
        setIsSubmitting(false);
        setSubmitProgress({ done: 0, total: 0 });
        setBulkSuccess(false);
        setBulkResults([]);
    }, [isOpen]);

    const updateSupplier = (field, val) => setSupplier((current) => ({ ...current, [field]: val }));

    const updateBulkItem = useCallback((index, changes) => {
        setBulkItems((items) => items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
    }, []);

    const removeBulkItem = useCallback((index) => {
        setBulkItems((items) => (items.length <= 1 ? items : items.filter((_, i) => i !== index)));
    }, []);

    const addBulkItem = () => setBulkItems((items) => [...items, emptyItem()]);
    const validBulkItems = bulkItems.filter((item) => item.product && Number(item.quantity) > 0);

    const handleSaveBulk = async () => {
        if (validBulkItems.length === 0) {
            setError('Add at least one product with a valid quantity.');
            return;
        }
        if (!supplier.name.trim()) {
            setError('Supplier name is required.');
            return;
        }
        if (!supplier.contact.trim()) {
            setError('Supplier contact details are required.');
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
                    supplierName: supplier.name.trim(),
                    supplierContact: supplier.contact.trim(),
                    supplierAddress: supplier.address.trim(),
                    referenceNumber: supplier.referenceNumber.trim(),
                    receivedDate: supplier.receivedDate,
                    reason: supplier.reason.trim() || 'Stock receiving',
                    _bulkMode: true,
                });
                results.push({ name: item.product.name, sku: item.product.sku, qty });
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
                        <Button variant="primary" onClick={onClose}>Done</Button>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-primary-500">
                            Scan barcodes or type Part Numbers (SKU) to add stock to existing products. Register brand-new products from Product Management.
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

                        <div className="rounded-xl border border-primary-200 p-4 space-y-4">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Supplier Information</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Input label="Supplier Name *" placeholder="e.g. Mitsubishi Motors PH" value={supplier.name} onChange={(e) => updateSupplier('name', e.target.value)} />
                                <Input label="Contact Details *" placeholder="Phone or email" value={supplier.contact} onChange={(e) => updateSupplier('contact', e.target.value)} />
                                <Input label="Address" placeholder="Supplier address" value={supplier.address} onChange={(e) => updateSupplier('address', e.target.value)} />
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
                            <p className="text-xs text-primary-400">{validBulkItems.length} product{validBulkItems.length !== 1 ? 's' : ''} ready</p>
                            <div className="flex gap-3">
                                <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
                                <Button
                                    variant="primary"
                                    type="button"
                                    onClick={handleSaveBulk}
                                    isLoading={isSubmitting}
                                    disabled={validBulkItems.length === 0 || !supplier.name.trim() || !supplier.contact.trim() || isSubmitting}
                                    leftIcon={<Plus className="w-4 h-4" />}
                                >
                                    Receive Stock ({validBulkItems.length})
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

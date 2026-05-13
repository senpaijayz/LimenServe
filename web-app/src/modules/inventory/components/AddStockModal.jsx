import { useState, useEffect, useCallback } from 'react';
import { Camera, Search, Plus, Package, CheckCircle, Trash2, ListPlus } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import useDataStore from '../../../store/useDataStore';
import { formatNumber, formatCurrency } from '../../../utils/formatters';

const EMPTY_SUPPLIER = {
    name: '',
    contact: '',
    address: '',
    referenceNumber: '',
    receivedDate: new Date().toISOString().slice(0, 10),
    reason: 'Stock receiving',
};

const CATEGORIES = [
    'Engine Parts', 'Transmission', 'Brakes', 'Suspension', 'Electrical',
    'Body Parts', 'Filters', 'Belts & Hoses', 'Cooling System', 'Exhaust',
    'Fuel System', 'Lubricants & Fluids', 'Tires & Wheels', 'Accessories', 'Other',
];

/* ─── Inline item search row ────────────────────────────────── */
function BulkItemRow({ item, index, onUpdate, onRemove, findProduct }) {
    const [query, setQuery] = useState(item.searchQuery || '');
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [showCamera, setShowCamera] = useState(false);

    const doSearch = useCallback(async (q) => {
        const id = q.trim();
        if (!id) { onUpdate(index, { product: null, searchQuery: q }); setSearchError(''); return; }
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
        } finally { setSearching(false); }
    }, [findProduct, index, onUpdate]);

    useEffect(() => {
        if (!query.trim()) return;
        const t = setTimeout(() => doSearch(query), 400);
        return () => clearTimeout(t);
    }, [query, doSearch]);

    const currentQty = Number(item.product?.quantity ?? item.product?.stock ?? 0);
    const addQty = Number(item.quantity) || 0;

    return (
        <div className="rounded-xl border border-primary-200 bg-white p-4 space-y-3 relative">
            {index > 0 && (
                <button type="button" onClick={() => onRemove(index)}
                    className="absolute top-3 right-3 text-primary-400 hover:text-red-500 transition-colors p-1">
                    <Trash2 className="w-4 h-4" />
                </button>
            )}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input type="text" placeholder="Scan barcode or type SKU..."
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); onUpdate(index, { searchQuery: e.target.value }); }}
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
                        <p className="font-mono text-xs text-primary-500">{item.product.sku} · Stock: {formatNumber(currentQty)}</p>
                    </div>
                    {addQty > 0 && (
                        <div className="text-right flex-shrink-0">
                            <p className="text-xs text-primary-400">After</p>
                            <p className="text-sm font-bold text-emerald-700">{formatNumber(currentQty + addQty)}</p>
                        </div>
                    )}
                </div>
            )}

            <Input label="Quantity to Add *" type="number" min="1" step="1" placeholder="e.g. 50"
                value={item.quantity}
                onChange={(e) => onUpdate(index, { quantity: e.target.value })}
                disabled={!item.product}
            />
            <CameraScannerModal isOpen={showCamera} onClose={() => setShowCamera(false)}
                onScan={(code) => { if (code) { setQuery(code); doSearch(code); } }} />
        </div>
    );
}

/**
 * Add Stock Modal — supports bulk stock receiving and new product registration.
 */
const AddStockModal = ({ isOpen, onClose, onSave }) => {
    const { findProduct } = useDataStore();
    const [mode, setMode] = useState('existing');

    // ── Bulk existing-product state ──────────────────────────────
    const emptyItem = () => ({ product: null, searchQuery: '', quantity: '' });
    const [bulkItems, setBulkItems] = useState([emptyItem()]);
    const [supplier, setSupplier] = useState(EMPTY_SUPPLIER);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitProgress, setSubmitProgress] = useState({ done: 0, total: 0 });
    const [bulkSuccess, setBulkSuccess] = useState(false);
    const [bulkResults, setBulkResults] = useState([]);

    // ── New-product state ──────────────────────────────────────────
    const [newProduct, setNewProduct] = useState({
        name: '', sku: '', category: 'Engine Parts', price: '', initialQty: '',
    });
    const [newSupplier, setNewSupplier] = useState(EMPTY_SUPPLIER);
    const [newError, setNewError] = useState('');
    const [isNewSubmitting, setIsNewSubmitting] = useState(false);
    const [newSuccess, setNewSuccess] = useState(false);

    // Reset on open
    useEffect(() => {
        if (!isOpen) return;
        setMode('existing');
        setBulkItems([emptyItem()]);
        setSupplier(EMPTY_SUPPLIER); setError(''); setIsSubmitting(false);
        setSubmitProgress({ done: 0, total: 0 }); setBulkSuccess(false); setBulkResults([]);
        setNewProduct({ name: '', sku: '', category: 'Engine Parts', price: '', initialQty: '' });
        setNewSupplier(EMPTY_SUPPLIER); setNewError(''); setIsNewSubmitting(false); setNewSuccess(false);
    }, [isOpen]);

    const updateSupplier = (field, val) => setSupplier((s) => ({ ...s, [field]: val }));
    const updateNewProduct = (field, val) => setNewProduct((p) => ({ ...p, [field]: val }));
    const updateNewSupplier = (field, val) => setNewSupplier((s) => ({ ...s, [field]: val }));

    const updateBulkItem = useCallback((index, changes) => {
        setBulkItems((items) => items.map((item, i) => i === index ? { ...item, ...changes } : item));
    }, []);

    const removeBulkItem = useCallback((index) => {
        setBulkItems((items) => items.length <= 1 ? items : items.filter((_, i) => i !== index));
    }, []);

    const addBulkItem = () => setBulkItems((items) => [...items, emptyItem()]);

    const validBulkItems = bulkItems.filter((item) => item.product && Number(item.quantity) > 0);

    // ── Save bulk existing product stock ────────────────────────
    const handleSaveBulk = async () => {
        if (validBulkItems.length === 0) { setError('Add at least one product with a valid quantity.'); return; }
        if (!supplier.name.trim()) { setError('Supplier name is required.'); return; }
        if (!supplier.contact.trim()) { setError('Supplier contact details are required.'); return; }
        setIsSubmitting(true); setError('');
        setSubmitProgress({ done: 0, total: validBulkItems.length });
        const results = [];
        try {
            for (let i = 0; i < validBulkItems.length; i++) {
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
        } catch (e) { setError(e.message || 'Failed to receive stock.'); }
        finally { setIsSubmitting(false); }
    };

    // ── Save new product ───────────────────────────────────────────
    const handleSaveNew = async () => {
        if (!newProduct.name.trim()) { setNewError('Product name is required.'); return; }
        if (!newProduct.sku.trim()) { setNewError('SKU / Part number is required.'); return; }
        const price = Number(newProduct.price);
        const qty = Number(newProduct.initialQty);
        if (!Number.isFinite(price) || price < 0) { setNewError('Please enter a valid price.'); return; }
        if (!Number.isFinite(qty) || qty < 0) { setNewError('Please enter a valid initial quantity.'); return; }
        if (!newSupplier.name.trim()) { setNewError('Supplier name is required.'); return; }
        setIsNewSubmitting(true); setNewError('');
        try {
            await onSave({
                product: {
                    id: null, name: newProduct.name.trim(), sku: newProduct.sku.trim().toUpperCase(),
                    category: newProduct.category, price, quantity: 0, isNew: true,
                },
                quantity: qty || 0,
                supplierName: newSupplier.name.trim(),
                supplierContact: newSupplier.contact.trim(),
                supplierAddress: newSupplier.address.trim(),
                referenceNumber: newSupplier.referenceNumber.trim(),
                receivedDate: newSupplier.receivedDate,
                reason: newSupplier.reason.trim() || 'New product registration',
                isNewProduct: true,
                newProductDetails: {
                    name: newProduct.name.trim(), sku: newProduct.sku.trim().toUpperCase(),
                    category: newProduct.category, price,
                },
            });
            setNewSuccess(true);
        } catch (e) { setNewError(e.message || 'Failed to register new product.'); }
        finally { setIsNewSubmitting(false); }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Stock" size="lg">
            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-primary-100 rounded-xl mb-6">
                <button type="button" onClick={() => setMode('existing')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${mode === 'existing' ? 'bg-white text-primary-950 shadow-sm' : 'text-primary-500 hover:text-primary-700'}`}>
                    Add to Existing Product
                </button>
                <button type="button" onClick={() => setMode('new')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${mode === 'new' ? 'bg-white text-primary-950 shadow-sm' : 'text-primary-500 hover:text-primary-700'}`}>
                    Register New Product
                </button>
            </div>

            {/* ── EXISTING PRODUCT TAB (BULK) ── */}
            {mode === 'existing' && (
                <div className="space-y-5">
                    {bulkSuccess ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-4">
                            <CheckCircle className="w-16 h-16 text-emerald-500" />
                            <p className="text-xl font-bold text-primary-950">Stock Received!</p>
                            <div className="w-full max-w-sm space-y-2">
                                {bulkResults.map((r, i) => (
                                    <div key={i} className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2 text-sm">
                                        <div className="min-w-0">
                                            <p className="font-bold text-primary-950 truncate">{r.name}</p>
                                            <p className="text-xs font-mono text-primary-500">{r.sku}</p>
                                        </div>
                                        <span className="font-bold text-emerald-700 flex-shrink-0 ml-3">+{formatNumber(r.qty)}</span>
                                    </div>
                                ))}
                            </div>
                            <Button variant="primary" onClick={onClose}>Done</Button>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-primary-500">
                                Scan barcodes or type Part Numbers (SKU) to add stock. Use the button below to add multiple products in one batch.
                            </p>

                            {/* Bulk item list */}
                            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                                {bulkItems.map((item, index) => (
                                    <BulkItemRow key={index} item={item} index={index}
                                        onUpdate={updateBulkItem} onRemove={removeBulkItem}
                                        findProduct={findProduct} />
                                ))}
                            </div>

                            <button type="button" onClick={addBulkItem}
                                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-primary-200 rounded-xl text-sm font-bold text-primary-500 hover:border-accent-blue hover:text-accent-blue transition-colors">
                                <ListPlus className="w-4 h-4" />
                                Add Another Product
                            </button>

                            {/* Supplier */}
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
                                    <Button variant="primary" type="button"
                                        onClick={handleSaveBulk}
                                        isLoading={isSubmitting}
                                        disabled={validBulkItems.length === 0 || !supplier.name.trim() || !supplier.contact.trim() || isSubmitting}
                                        leftIcon={<Plus className="w-4 h-4" />}>
                                        Receive Stock ({validBulkItems.length})
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── NEW PRODUCT TAB ── */}
            {mode === 'new' && (
                <div className="space-y-5">
                    {newSuccess ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-4">
                            <CheckCircle className="w-16 h-16 text-emerald-500" />
                            <p className="text-xl font-bold text-primary-950">Product Registered!</p>
                            <p className="text-sm text-primary-500 text-center">
                                {newProduct.name} has been added to inventory with {newProduct.initialQty} units.
                            </p>
                            <Button variant="primary" onClick={onClose}>Done</Button>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-primary-500">
                                Add a brand-new product that doesn't exist in the catalog yet. Fill in the product details and initial stock quantity.
                            </p>

                            {/* Product details */}
                            <div className="rounded-xl border border-primary-200 p-4 space-y-4">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Product Details</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <Input label="Product Name *" placeholder="e.g. Oil Filter — Montero Sport 2.4D"
                                            value={newProduct.name} onChange={(e) => updateNewProduct('name', e.target.value)} />
                                    </div>
                                    <Input label="SKU / Part Number *" placeholder="e.g. MZ314019"
                                        value={newProduct.sku} onChange={(e) => updateNewProduct('sku', e.target.value.toUpperCase())} />
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-[0.14em] text-primary-500 mb-1.5">Category</label>
                                        <select value={newProduct.category} onChange={(e) => updateNewProduct('category', e.target.value)}
                                            className="w-full border border-primary-200 rounded-xl px-3 py-2.5 text-sm text-primary-950 bg-white focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 shadow-sm">
                                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <Input label="Retail Price (₱) *" type="number" min="0" step="0.01" placeholder="0.00"
                                        value={newProduct.price} onChange={(e) => updateNewProduct('price', e.target.value)} />
                                    <Input label="Initial Stock Quantity" type="number" min="0" step="1" placeholder="0"
                                        value={newProduct.initialQty} onChange={(e) => updateNewProduct('initialQty', e.target.value)} />
                                </div>
                                {newProduct.name && newProduct.sku && newProduct.price && (
                                    <div className="rounded-lg bg-primary-50 border border-primary-200 p-3 flex items-center gap-3">
                                        <Package className="w-5 h-5 text-primary-400 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-bold text-primary-950">{newProduct.name}</p>
                                            <p className="text-xs text-primary-500 font-mono">{newProduct.sku} · {newProduct.category} · {formatCurrency(Number(newProduct.price) || 0)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Supplier */}
                            <div className="rounded-xl border border-primary-200 p-4 space-y-4">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Supplier / Source Information</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Input label="Supplier Name *" placeholder="e.g. Mitsubishi Motors PH" value={newSupplier.name} onChange={(e) => updateNewSupplier('name', e.target.value)} />
                                    <Input label="Contact Details" placeholder="Phone or email" value={newSupplier.contact} onChange={(e) => updateNewSupplier('contact', e.target.value)} />
                                    <Input label="Address" placeholder="Supplier address" value={newSupplier.address} onChange={(e) => updateNewSupplier('address', e.target.value)} />
                                    <Input label="Invoice / Reference No." placeholder="DR / OR number" value={newSupplier.referenceNumber} onChange={(e) => updateNewSupplier('referenceNumber', e.target.value)} />
                                    <Input label="Received Date" type="date" value={newSupplier.receivedDate} onChange={(e) => updateNewSupplier('receivedDate', e.target.value)} />
                                    <Input label="Notes" placeholder="Initial stock registration" value={newSupplier.reason} onChange={(e) => updateNewSupplier('reason', e.target.value)} />
                                </div>
                            </div>

                            {newError && <p className="text-sm text-red-600 font-medium">{newError}</p>}

                            <div className="flex justify-end gap-3 pt-2 border-t border-primary-100">
                                <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
                                <Button variant="primary" type="button" onClick={handleSaveNew} isLoading={isNewSubmitting}
                                    disabled={!newProduct.name.trim() || !newProduct.sku.trim() || !newSupplier.name.trim() || isNewSubmitting}
                                    leftIcon={<Plus className="w-4 h-4" />}>
                                    Register Product
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
};

export default AddStockModal;

import { useState, useEffect } from 'react';
import { Camera, Search, Plus, Package, CheckCircle } from 'lucide-react';
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

/**
 * Add Stock Modal
 * Two modes:
 *   "Add to Existing Product" — scan/type SKU, add quantity
 *   "Register New Product"   — fill in product details + initial stock
 */
const AddStockModal = ({ isOpen, onClose, onSave }) => {
    const { findProduct } = useDataStore();
    const [mode, setMode] = useState('existing'); // 'existing' | 'new'

    // ── Existing-product state ─────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [showCamera, setShowCamera] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [quantityToAdd, setQuantityToAdd] = useState('');
    const [supplier, setSupplier] = useState(EMPTY_SUPPLIER);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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
        setSearchQuery(''); setSelectedProduct(null); setQuantityToAdd('');
        setSupplier(EMPTY_SUPPLIER); setError(''); setIsSubmitting(false);
        setNewProduct({ name: '', sku: '', category: 'Engine Parts', price: '', initialQty: '' });
        setNewSupplier(EMPTY_SUPPLIER); setNewError(''); setIsNewSubmitting(false); setNewSuccess(false);
    }, [isOpen]);

    // Auto-search existing product by SKU
    useEffect(() => {
        const id = searchQuery.trim();
        if (!id) { setSelectedProduct(null); setError(''); return; }
        let active = true;
        setIsSearching(true);
        void (async () => {
            const found = await findProduct(id);
            if (!active) return;
            if (found) { setSelectedProduct(found); setError(''); }
            else { setSelectedProduct(null); setError('Part Number (SKU) not found. Use "Register New Product" tab to add it.'); }
            setIsSearching(false);
        })();
        return () => { active = false; };
    }, [findProduct, searchQuery]);

    const updateSupplier = (field, val) => setSupplier((s) => ({ ...s, [field]: val }));
    const updateNewProduct = (field, val) => setNewProduct((p) => ({ ...p, [field]: val }));
    const updateNewSupplier = (field, val) => setNewSupplier((s) => ({ ...s, [field]: val }));

    // ── Save existing product stock ────────────────────────────────
    const handleSaveExisting = async () => {
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
            // Build a pseudo-product object that matches what onSave expects.
            // The backend receiveInventoryStock creates or upserts by productId=null with metadata.
            await onSave({
                product: {
                    id: null,                    // signals new product
                    name: newProduct.name.trim(),
                    sku: newProduct.sku.trim().toUpperCase(),
                    category: newProduct.category,
                    price,
                    quantity: 0,
                    isNew: true,                 // flag for backend
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
                    name: newProduct.name.trim(),
                    sku: newProduct.sku.trim().toUpperCase(),
                    category: newProduct.category,
                    price,
                },
            });
            setNewSuccess(true);
        } catch (e) { setNewError(e.message || 'Failed to register new product.'); }
        finally { setIsNewSubmitting(false); }
    };

    const currentQty = Number(selectedProduct?.quantity ?? selectedProduct?.stock ?? 0);
    const projected = selectedProduct && Number(quantityToAdd) > 0 ? currentQty + Number(quantityToAdd) : currentQty;

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Stock" size="lg">
            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-primary-100 rounded-xl mb-6">
                <button
                    type="button"
                    onClick={() => setMode('existing')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${mode === 'existing' ? 'bg-white text-primary-950 shadow-sm' : 'text-primary-500 hover:text-primary-700'}`}
                >
                    Add to Existing Product
                </button>
                <button
                    type="button"
                    onClick={() => setMode('new')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${mode === 'new' ? 'bg-white text-primary-950 shadow-sm' : 'text-primary-500 hover:text-primary-700'}`}
                >
                    Register New Product
                </button>
            </div>

            {/* ── EXISTING PRODUCT TAB ── */}
            {mode === 'existing' && (
                <div className="space-y-5">
                    <p className="text-sm text-primary-500">
                        Scan a barcode or type the Part Number (SKU) to add stock to an existing inventory item.
                    </p>

                    {/* SKU search */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-[0.14em] text-primary-500 mb-1.5">
                            Part Number (SKU) <span className="text-red-500">*</span>
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
                                    className={`w-full pl-10 pr-4 py-2.5 bg-white border rounded-xl text-sm placeholder-primary-400 focus:outline-none focus:ring-2 shadow-sm transition-all ${
                                        error ? 'border-red-300 focus:border-red-400 focus:ring-red-100 text-red-900' :
                                        selectedProduct ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-100 text-primary-950' :
                                        'border-primary-200 focus:border-accent-blue focus:ring-accent-blue/10 text-primary-950'
                                    }`}
                                />
                            </div>
                            <Button variant="secondary" onClick={() => setShowCamera(true)} type="button" className="px-3">
                                <Camera className="w-4 h-4" />
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
                                    <p className="font-mono text-xs text-primary-500">{selectedProduct.sku} · {selectedProduct.category}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-emerald-200 text-center">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-primary-400">Current Stock</p>
                                    <p className="text-xl font-bold text-primary-900">{formatNumber(currentQty)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-primary-400">Adding</p>
                                    <p className="text-xl font-bold text-accent-blue">{quantityToAdd ? formatNumber(Number(quantityToAdd)) : '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-primary-400">After Receive</p>
                                    <p className="text-xl font-bold text-emerald-700">{formatNumber(projected)}</p>
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

                    {/* Supplier */}
                    <div className="rounded-xl border border-primary-200 p-4 space-y-4">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Supplier Information</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input label="Supplier Name *" placeholder="e.g. Mitsubishi Motors PH" value={supplier.name} onChange={(e) => updateSupplier('name', e.target.value)} disabled={!selectedProduct} />
                            <Input label="Contact Details *" placeholder="Phone or email" value={supplier.contact} onChange={(e) => updateSupplier('contact', e.target.value)} disabled={!selectedProduct} />
                            <Input label="Address" placeholder="Supplier address" value={supplier.address} onChange={(e) => updateSupplier('address', e.target.value)} disabled={!selectedProduct} />
                            <Input label="Invoice / Reference No." placeholder="DR / OR number" value={supplier.referenceNumber} onChange={(e) => updateSupplier('referenceNumber', e.target.value)} disabled={!selectedProduct} />
                            <Input label="Received Date" type="date" value={supplier.receivedDate} onChange={(e) => updateSupplier('receivedDate', e.target.value)} disabled={!selectedProduct} />
                            <Input label="Reason / Notes" placeholder="Stock receiving" value={supplier.reason} onChange={(e) => updateSupplier('reason', e.target.value)} disabled={!selectedProduct} />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2 border-t border-primary-100">
                        <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
                        <Button
                            variant="primary" type="button"
                            onClick={handleSaveExisting}
                            isLoading={isSubmitting}
                            disabled={!selectedProduct || !quantityToAdd || Number(quantityToAdd) <= 0 || !supplier.name.trim() || !supplier.contact.trim() || isSubmitting}
                            leftIcon={<Plus className="w-4 h-4" />}
                        >
                            Receive Stock
                        </Button>
                    </div>

                    <CameraScannerModal isOpen={showCamera} onClose={() => setShowCamera(false)} onScan={(code) => { if (code) setSearchQuery(code); }} />
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
                                        <Input
                                            label="Product Name *"
                                            placeholder="e.g. Oil Filter — Montero Sport 2.4D"
                                            value={newProduct.name}
                                            onChange={(e) => updateNewProduct('name', e.target.value)}
                                        />
                                    </div>
                                    <Input
                                        label="SKU / Part Number *"
                                        placeholder="e.g. MZ314019"
                                        value={newProduct.sku}
                                        onChange={(e) => updateNewProduct('sku', e.target.value.toUpperCase())}
                                    />
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-[0.14em] text-primary-500 mb-1.5">Category</label>
                                        <select
                                            value={newProduct.category}
                                            onChange={(e) => updateNewProduct('category', e.target.value)}
                                            className="w-full border border-primary-200 rounded-xl px-3 py-2.5 text-sm text-primary-950 bg-white focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 shadow-sm"
                                        >
                                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <Input
                                        label="Retail Price (₱) *"
                                        type="number" min="0" step="0.01"
                                        placeholder="0.00"
                                        value={newProduct.price}
                                        onChange={(e) => updateNewProduct('price', e.target.value)}
                                    />
                                    <Input
                                        label="Initial Stock Quantity"
                                        type="number" min="0" step="1"
                                        placeholder="0"
                                        value={newProduct.initialQty}
                                        onChange={(e) => updateNewProduct('initialQty', e.target.value)}
                                    />
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
                                <Button
                                    variant="primary" type="button"
                                    onClick={handleSaveNew}
                                    isLoading={isNewSubmitting}
                                    disabled={!newProduct.name.trim() || !newProduct.sku.trim() || !newSupplier.name.trim() || isNewSubmitting}
                                    leftIcon={<Plus className="w-4 h-4" />}
                                >
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

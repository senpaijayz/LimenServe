import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, Receipt, Check, Printer, Wrench, Camera } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import { useCart } from '../../../context/CartContext';
import { formatCurrency } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import useBarcodeScanner from '../../../hooks/useBarcodeScanner';
import useDataStore from '../../../store/useDataStore';
import Barcode from 'react-barcode';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import AddServiceModal from '../../../components/ui/AddServiceModal';
import { createPosSale } from '../../../services/posApi';
import SaleReceiptPreview from '../components/SaleReceiptPreview.jsx';

/**
 * POS Terminal Page
 * Point of Sale interface for processing transactions
 */
const POSTerminal = () => {
    const {
        items, totals, addItem, removeItem, updateQuantity, clearCart,
        customerName, setCustomerName, discountPercent, setDiscountPercent
    } = useCart();

    const { success } = useToast();
    const { products: storeProducts, loading, fetchProducts, hasLoadedProducts, isHydratingProducts, findProduct } = useDataStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showCameraScanner, setShowCameraScanner] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [lastTransaction, setLastTransaction] = useState(null);
    const [paymentError, setPaymentError] = useState('');
    const [processingPayment, setProcessingPayment] = useState(false);

    useEffect(() => {
        if (!hasLoadedProducts && !loading) {
            void fetchProducts();
        }
    }, [fetchProducts, hasLoadedProducts, loading]);

    // Filter products
    const filteredProducts = useMemo(() => (
        storeProducts.filter((product) => (
            product.name.toLowerCase().includes(deferredSearchQuery.toLowerCase())
            || product.sku.toLowerCase().includes(deferredSearchQuery.toLowerCase())
        ))
    ), [deferredSearchQuery, storeProducts]);

    // Handle product click
    const handleProductClick = (product) => {
        addItem(product);
        success(`Added ${product.name} to cart`);
    };

    // Handle hardware barcode scanning
    useBarcodeScanner((barcode) => {
        handleBarcodeScanned(barcode);
    });

    // Handle camera scanning
    const handleBarcodeScanned = async (barcode) => {
        if (!barcode) return;

        const normalizedBarcode = String(barcode).trim().toLowerCase();
        const localProduct = storeProducts.find((product) => product.sku.toLowerCase() === normalizedBarcode || String(product.id) === String(barcode));
        const product = localProduct || await findProduct(barcode);

        if (product) {
            addItem(product, 1);
            success(`Scanned: ${product.name}`);
        } else {
            console.warn(`Barcode not found in inventory: ${barcode}`);
        }
    };

    const handleAddService = (serviceItem) => {
        addItem(serviceItem, 1);
        success(`Added service: ${serviceItem.name}`);
    };

    // Calculate change
    const change = parseFloat(paymentAmount) - totals.total;

    // Handle payment
    const handlePayment = async () => {
        if (parseFloat(paymentAmount) < totals.total || processingPayment) return;

        setProcessingPayment(true);
        setPaymentError('');

        try {
            const payload = {
                customerName,
                paymentMethod: 'cash',
                cashReceived: parseFloat(paymentAmount),
                changeDue: change,
                discountPercent,
                totals,
                items: items.map((item) => ({
                    id: item.id,
                    productId: item.lineType === 'product' ? (item.productId || item.id) : null,
                    serviceId: item.lineType === 'service' ? (item.serviceId || null) : null,
                    lineType: item.lineType || (item.sku === 'SERVICE' ? 'service' : 'product'),
                    name: item.name,
                    sku: item.sku,
                    quantity: item.quantity,
                    unitPrice: item.price,
                    lineTotal: item.price * item.quantity,
                    displayName: item.name,
                })),
            };

            const transaction = await createPosSale(payload);

            setLastTransaction({
                saleId: transaction.saleId,
                transactionNumber: transaction.transactionNumber,
                sale: transaction.sale,
                items: transaction.items ?? [],
                receipt: transaction.receipt ?? null,
            });

            setShowPaymentModal(false);
            setShowSuccessModal(true);
            clearCart();
            setPaymentAmount('');
            success(`Sale ${transaction.transactionNumber} completed`);
        } catch (error) {
            setPaymentError(error.message || 'Failed to save the sale.');
        } finally {
            setProcessingPayment(false);
        }
    };

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-4">
            {/* Products Section */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Search Bar */}
                <div className="relative mb-4 flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                        <input
                            type="text"
                            placeholder="Search products or scan barcode..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-white border border-primary-200 rounded-xl text-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm"
                            autoFocus
                        />
                    </div>
                    <Button
                        variant="secondary"
                        className="px-4 py-3 h-auto"
                        onClick={() => setShowCameraScanner(true)}
                        title="Scan Barcode with Camera"
                    >
                        <Camera className="w-6 h-6 text-primary-600" />
                    </Button>
                    <Button
                        variant="primary"
                        className="px-4 py-3 h-auto whitespace-nowrap"
                        onClick={() => setShowServiceModal(true)}
                        leftIcon={<Wrench className="w-5 h-5" />}
                    >
                        Add Service
                    </Button>
                </div>

                {/* Products Grid */}
                {isHydratingProducts && !loading && (
                    <p className="mb-3 text-sm text-primary-500">Loading more catalog pages in the background...</p>
                )}

                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-primary-400">Loading catalog...</div>
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {filteredProducts.map((product) => (
                                <button
                                    key={product.id}
                                    onClick={() => handleProductClick(product)}
                                    className="pos-item text-left"
                                >
                                    <div className="h-16 bg-primary-50 rounded-lg mb-2 flex items-center justify-center border border-primary-100 p-1 overflow-hidden">
                                        <div className="w-full flex items-center justify-center opacity-80 mix-blend-multiply">
                                            <Barcode
                                                value={product.sku || 'UNKNOWN'}
                                                width={1}
                                                height={30}
                                                fontSize={10}
                                                margin={0}
                                                displayValue={false}
                                                background="transparent"
                                                lineColor="#0f172a"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-sm font-semibold text-primary-950 line-clamp-2 mb-1">
                                        {product.name}
                                    </p>
                                    <p className="text-xs font-mono text-primary-500 mb-2">{product.sku}</p>
                                    <p className="text-lg font-bold text-accent-blue">
                                        {formatCurrency(product.price)}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Cart Sidebar */}
            <div className="w-full lg:w-96 flex flex-col bg-white border border-primary-200 shadow-sm rounded-xl p-4">
                {/* Cart Header */}
                <div className="flex items-center justify-between pb-3 border-b border-primary-100">
                    <h2 className="text-lg font-display font-bold text-primary-950">
                        Current Sale
                    </h2>
                    {items.length > 0 && (
                        <button
                            onClick={clearCart}
                            className="text-sm text-accent-danger font-medium hover:underline"
                        >
                            Clear All
                        </button>
                    )}
                </div>

                {/* Customer Details */}
                <div className="pt-3 pb-2 border-b border-primary-100">
                    <input
                        type="text"
                        placeholder="Customer Name (Optional)"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm"
                    />
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto py-4 space-y-3">
                    {items.length === 0 ? (
                        <div className="text-center py-8">
                            <Receipt className="w-12 h-12 text-primary-300 mx-auto mb-3" />
                            <p className="text-primary-500 font-medium tracking-wide">Cart is empty</p>
                            <p className="text-sm text-primary-400 mt-1">Click products to add</p>
                        </div>
                    ) : (
                        items.map((item) => (
                            <div key={item.id} className="cart-item bg-primary-50 border border-primary-100 p-3 rounded-xl flex items-center justify-between">
                                <div className="flex-1 min-w-0 pr-3">
                                    <p className="text-sm font-semibold text-primary-950 truncate">
                                        {item.name}
                                    </p>
                                    <p className="text-sm font-bold text-accent-blue mt-0.5">
                                        {formatCurrency(item.price)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                        className="p-1 rounded-md bg-white border border-primary-200 text-primary-600 hover:bg-primary-50 transition-colors shadow-sm"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                    <span className="w-8 text-center font-bold text-primary-950">{item.quantity}</span>
                                    <button
                                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                        className="p-1 rounded-md bg-white border border-primary-200 text-primary-600 hover:bg-primary-50 transition-colors shadow-sm"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="p-1.5 rounded-md text-accent-danger hover:bg-accent-danger/10 transition-colors ml-2"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Cart Totals */}
                <div className="pt-4 mt-2 border-t border-primary-200">

                    {/* Discount Input */}
                    <div className="flex items-center justify-between mb-3 bg-primary-50 p-2 rounded-lg border border-primary-100">
                        <span className="text-sm text-primary-700 font-semibold">Discount (%)</span>
                        <div className="flex items-center gap-1 w-20">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={discountPercent}
                                onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 text-right text-sm font-bold text-accent-danger bg-white border border-primary-200 rounded-md focus:outline-none focus:border-accent-danger focus:ring-1 focus:ring-accent-danger"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-sm text-primary-600 font-medium">
                            <span>Subtotal</span>
                            <span>{formatCurrency(totals.rawSubtotal)}</span>
                        </div>

                        {discountPercent > 0 && (
                            <div className="flex justify-between text-sm text-accent-danger font-semibold">
                                <span>Discount ({discountPercent}%)</span>
                                <span>-{formatCurrency(totals.discountAmount)}</span>
                            </div>
                        )}

                        <div className="flex justify-between text-sm text-primary-600 font-medium">
                            <span>VAT (12%)</span>
                            <span>{formatCurrency(totals.tax)}</span>
                        </div>
                        <div className="flex justify-between text-xl font-bold text-primary-950 pt-3 mt-1 border-t border-primary-200">
                            <span>Total</span>
                            <span className="text-accent-blue">{formatCurrency(totals.total)}</span>
                        </div>
                    </div>
                </div>

                {/* Payment Button */}
                <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    className="mt-4"
                    disabled={items.length === 0}
                    onClick={() => setShowPaymentModal(true)}
                    leftIcon={<CreditCard className="w-5 h-5" />}
                >
                    Process Payment
                </Button>
            </div>

            {/* Payment Modal */}
            <Modal
                isOpen={showPaymentModal}
                onClose={() => {
                    if (!processingPayment) {
                        setShowPaymentModal(false);
                        setPaymentError('');
                    }
                }}
                title="Process Payment"
                size="md"
            >
                <div className="space-y-6">
                    {/* Total Display */}
                    <div className="text-center p-6 bg-primary-50 border border-primary-100 rounded-xl shadow-inner">
                        <p className="text-sm text-primary-500 font-semibold uppercase tracking-widest mb-1">Amount Due</p>
                        <p className="text-4xl font-bold font-display text-accent-blue">
                            {formatCurrency(totals.total)}
                        </p>
                    </div>

                    {/* Cash Amount */}
                    <div>
                        <label className="text-sm font-semibold text-primary-700 mb-2 block">Cash Received</label>
                        <div className="relative">
                            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                            <input
                                type="number"
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                placeholder="Enter amount"
                                className="w-full pl-12 pr-4 py-3 bg-white border border-primary-200 rounded-xl text-2xl font-bold text-primary-950 placeholder-primary-300 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Quick Amount Buttons */}
                    <div className="grid grid-cols-3 gap-3">
                        {[500, 1000, 2000].map((amount) => (
                            <button
                                key={amount}
                                onClick={() => setPaymentAmount(String(amount))}
                                className="p-3 rounded-lg bg-white border border-primary-200 hover:border-accent-blue hover:shadow-sm hover:text-accent-blue transition-all text-primary-700 font-bold"
                            >
                                ₱{amount.toLocaleString()}
                            </button>
                        ))}
                    </div>

                    {/* Change Display */}
                    {paymentAmount && (
                        <div className={`text-center p-4 rounded-xl ${change >= 0 ? 'bg-accent-success/20' : 'bg-accent-danger/20'}`}>
                            <p className="text-sm text-primary-400 mb-1">
                                {change >= 0 ? 'Change' : 'Insufficient'}
                            </p>
                            <p className={`text-2xl font-bold ${change >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                                {formatCurrency(Math.abs(change))}
                            </p>
                        </div>
                    )}

                    {paymentError && (
                        <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/10 px-4 py-3 text-sm text-accent-danger">
                            {paymentError}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                        <Button
                            variant="secondary"
                            fullWidth
                            disabled={processingPayment}
                            onClick={() => {
                                setShowPaymentModal(false);
                                setPaymentError('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="success"
                            fullWidth
                            disabled={!paymentAmount || parseFloat(paymentAmount) < totals.total || processingPayment}
                            onClick={handlePayment}
                            leftIcon={<Check className="w-4 h-4" />}
                            isLoading={processingPayment}
                        >
                            Complete Sale
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Success Modal */}
            <Modal
                isOpen={showSuccessModal}
                onClose={() => setShowSuccessModal(false)}
                size="xl"
                showCloseButton={false}
            >
                <div className="text-center py-4">
                    <div className="w-16 h-16 rounded-full bg-accent-success/20 flex items-center justify-center mx-auto mb-3">
                        <Check className="w-8 h-8 text-accent-success" />
                    </div>
                    <h3 className="text-xl font-display font-bold text-primary-950 mb-1">
                        Payment Successful!
                    </h3>
                    <p className="text-primary-400 text-sm mb-4">Transaction completed</p>
                </div>

                {/* Receipt Preview */}
                {lastTransaction?.receipt && (
                    <SaleReceiptPreview receipt={lastTransaction.receipt} printId="pos-receipt" />
                )}

                <div className="flex gap-3 print:hidden">
                    <Button variant="secondary" fullWidth onClick={() => setShowSuccessModal(false)}>
                        New Transaction
                    </Button>
                    <Button variant="primary" fullWidth leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
                        Print Receipt
                    </Button>
                </div>
            </Modal>

            {/* Camera Scanner Modal */}
            <CameraScannerModal
                isOpen={showCameraScanner}
                onClose={() => setShowCameraScanner(false)}
                onScan={handleBarcodeScanned}
            />

            {/* Add Service Modal */}
            <AddServiceModal
                isOpen={showServiceModal}
                onClose={() => setShowServiceModal(false)}
                onAddService={handleAddService}
            />
        </div>
    );
};

export default POSTerminal;


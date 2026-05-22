import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, Receipt, Check, Printer, Wrench, Camera, ChevronLeft, ChevronRight, AlertTriangle, Calculator, WalletCards, ScanLine } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import { useCart } from '../../../context/CartContext';
import { formatCurrency } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import useBarcodeScanner from '../../../hooks/useBarcodeScanner';
import useDataStore from '../../../store/useDataStore';
import BarcodeDisplay from '../../../components/ui/BarcodeDisplay';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import LargeBarcodeModal from '../../../components/ui/LargeBarcodeModal';
import AddServiceModal from '../../../components/ui/AddServiceModal';
import { createPosSale } from '../../../services/posApi';
import SaleReceiptPreview from '../components/SaleReceiptPreview.jsx';
import useProductCatalog from '../../../hooks/useProductCatalog';
import { buildProductBarcodeValue, getBarcodeLookupCandidates, productMatchesIdentifier } from '../../../utils/barcode';

const PAGE_SIZE = 14;

function buildCashTenderOptions(total) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const roundedToHundred = Math.ceil(safeTotal / 100) * 100;
    const roundedToFiveHundred = Math.ceil(safeTotal / 500) * 500;
    const baseOptions = [
        safeTotal,
        roundedToHundred,
        roundedToFiveHundred,
        500,
        1000,
        2000,
        5000,
    ].filter((amount) => amount >= safeTotal && amount > 0);

    return [...new Set(baseOptions.map((amount) => Number(amount.toFixed(2))))].slice(0, 6);
}

function formatTenderAmount(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return '';
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatCatalogProduct(product) {
    return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        model: product.model,
        category: product.category,
        price: Number(product.price ?? 0),
        stock: Number(product.stock ?? 0),
        quantity: Number(product.stock ?? 0),
        status: product.status ?? 'in_stock',
        uom: product.uom ?? 'PC',
        brand: product.brand ?? 'Mitsubishi',
        cost: Math.round(Number(product.price ?? 0) * 0.55),
        location: product.location ?? { floor: '-', section: '-', shelf: '-' },
    };
}

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
    const { findProduct } = useDataStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showCameraScanner, setShowCameraScanner] = useState(false);
    const [largeBarcodeProduct, setLargeBarcodeProduct] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [lastTransaction, setLastTransaction] = useState(null);
    const [paymentError, setPaymentError] = useState('');
    const [processingPayment, setProcessingPayment] = useState(false);
    const {
        products,
        pagination,
        loading,
        error,
    } = useProductCatalog({
        page: currentPage,
        pageSize: PAGE_SIZE,
        searchQuery,
        selectedCategory: 'all',
        sortBy: 'name-asc',
        includeCategories: false,
    });

    useEffect(() => {
        setCurrentPage(1);
    }, [deferredSearchQuery]);

    // Filter products
    const visibleProducts = useMemo(() => (
        products.map(formatCatalogProduct)
    ), [products]);

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

        const lookupCandidates = getBarcodeLookupCandidates(barcode);
        const searchValue = lookupCandidates[lookupCandidates.length - 1] || String(barcode).trim();
        setSearchQuery(searchValue);
        setCurrentPage(1);

        const localProduct = visibleProducts.find((product) => productMatchesIdentifier(product, barcode));
        const product = localProduct || await findProduct(barcode);

        if (product) {
            setSearchQuery(product.sku || searchValue);
            success(`Scanned: ${product.name}. Select it from the results to add to cart.`);
        } else {
            console.warn(`Barcode not found in inventory: ${barcode}`);
        }
    };

    const handleAddService = (serviceItem) => {
        addItem(serviceItem, 1);
        success(`Added service: ${serviceItem.name}`);
    };

    // Calculate change
    const paymentReceived = Number(paymentAmount) || 0;
    const change = paymentReceived - totals.total;
    const amountShort = Math.max(0, totals.total - paymentReceived);
    const hasEnoughCash = paymentReceived >= totals.total;
    const cashTenderOptions = useMemo(() => buildCashTenderOptions(totals.total), [totals.total]);
    const canCompletePayment = items.length > 0 && hasEnoughCash && !processingPayment;
    const canGoPrev = (pagination.page ?? currentPage) > 1;
    const canGoNext = (pagination.page ?? currentPage) < (pagination.totalPages ?? 1);
    const rangeStart = pagination.totalCount === 0 ? 0 : (((pagination.page ?? currentPage) - 1) * (pagination.pageSize ?? PAGE_SIZE)) + 1;
    const rangeEnd = pagination.totalCount === 0 ? 0 : Math.min((pagination.page ?? currentPage) * (pagination.pageSize ?? PAGE_SIZE), pagination.totalCount ?? 0);

    const openPaymentModal = () => {
        setPaymentAmount('');
        setPaymentError('');
        setShowPaymentModal(true);
    };

    const closePaymentModal = () => {
        if (processingPayment) return;
        setShowPaymentModal(false);
        setPaymentError('');
    };

    const setTenderAmount = (amount) => {
        setPaymentAmount(formatTenderAmount(amount));
        setPaymentError('');
    };

    // Handle payment
    const handlePayment = async () => {
        if (!canCompletePayment) {
            if (items.length === 0) {
                setPaymentError('Add at least one item before completing the sale.');
            } else if (!hasEnoughCash) {
                setPaymentError(`Cash received is short by ${formatCurrency(amountShort)}.`);
            }
            return;
        }

        setProcessingPayment(true);
        setPaymentError('');

        try {
            const payload = {
                customerName,
                paymentMethod: 'cash',
                cashReceived: paymentReceived,
                changeDue: Math.max(0, change),
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

    const handlePaymentInputKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handlePayment();
        }
    };

    return (
        <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4 lg:h-[calc(100vh-8rem)] lg:flex-row">
            {/* Products Section */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Search Bar */}
                <div className="relative mb-4 flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                        <input
                            type="text"
                            placeholder="Search products or scan barcode..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-white border border-primary-200 rounded-xl text-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm"
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
                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-primary-400">Loading catalog...</div>
                ) : error ? (
                    <div className="flex-1 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                            <div>
                                <p className="font-semibold">Product catalog temporarily unavailable</p>
                                <p className="mt-1 text-sm">{error}</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-1 flex-col">
                        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {visibleProducts.map((product) => (
                                <div
                                    key={product.id}
                                    className="pos-item text-left"
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleProductClick(product)}
                                        className="block w-full text-left"
                                    >
                                        <div className="h-[4.5rem] bg-white rounded-lg mb-2 flex items-center justify-center border border-primary-100 p-2 overflow-hidden">
                                            <div className="w-full flex items-center justify-center">
                                                <BarcodeDisplay
                                                    value={buildProductBarcodeValue(product.sku || 'UNKNOWN') || (product.sku || 'UNKNOWN')}
                                                    size="small"
                                                    height={48}
                                                    fontSize={0}
                                                    margin={16}
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
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setLargeBarcodeProduct(product);
                                        }}
                                        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary-200 bg-white px-3 py-2 text-xs font-semibold text-primary-600 transition hover:border-accent-blue hover:text-accent-blue"
                                    >
                                        <ScanLine className="h-4 w-4" />
                                        Large barcode
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 rounded-xl border border-primary-200 bg-white px-4 py-3 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-primary-600">
                                    Showing <span className="font-semibold text-primary-950">{rangeStart}-{rangeEnd}</span> of <span className="font-semibold text-primary-950">{pagination.totalCount ?? 0}</span> products
                                </p>
                                <div className="flex w-full flex-col gap-2 min-[420px]:flex-row sm:w-auto sm:items-center">
                                    <Button
                                        variant="secondary"
                                        onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                                        disabled={!canGoPrev}
                                        leftIcon={<ChevronLeft className="h-4 w-4" />}
                                        className="w-full min-[420px]:w-auto"
                                    >
                                        Previous
                                    </Button>
                                    <span className="min-w-[108px] text-center text-sm font-semibold text-primary-700">
                                        Page {pagination.page ?? currentPage} of {pagination.totalPages ?? 1}
                                    </span>
                                    <Button
                                        variant="secondary"
                                        onClick={() => setCurrentPage((page) => Math.min(page + 1, pagination.totalPages ?? page))}
                                        disabled={!canGoNext}
                                        rightIcon={<ChevronRight className="h-4 w-4" />}
                                        className="w-full min-[420px]:w-auto"
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Cart Sidebar */}
            <div className="flex max-h-[80dvh] w-full flex-col rounded-xl border border-primary-200 bg-white p-4 shadow-sm lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:w-96">
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
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                    <button
                                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                        className="flex min-h-9 min-w-9 items-center justify-center rounded-md border border-primary-200 bg-white text-primary-600 shadow-sm transition-colors hover:bg-primary-50"
                                        aria-label={`Decrease ${item.name} quantity`}
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                    <span className="w-8 text-center font-bold text-primary-950">{item.quantity}</span>
                                    <button
                                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                        className="flex min-h-9 min-w-9 items-center justify-center rounded-md border border-primary-200 bg-white text-primary-600 shadow-sm transition-colors hover:bg-primary-50"
                                        aria-label={`Increase ${item.name} quantity`}
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="ml-1 flex min-h-9 min-w-9 items-center justify-center rounded-md text-accent-danger transition-colors hover:bg-accent-danger/10 sm:ml-2"
                                        aria-label={`Remove ${item.name}`}
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
                    onClick={openPaymentModal}
                    leftIcon={<CreditCard className="w-5 h-5" />}
                >
                    Process Payment
                </Button>
            </div>

            {/* Payment Modal */}
            <Modal
                isOpen={showPaymentModal}
                onClose={closePaymentModal}
                title="Cash Checkout"
                size="lg"
            >
                <div className="space-y-5">
                    <div className="rounded-2xl border border-primary-900 bg-primary-950 p-5 text-white shadow-lg">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-300">Amount Due</p>
                                <p className="mt-2 text-4xl font-bold font-display tracking-normal">{formatCurrency(totals.total)}</p>
                                <p className="mt-2 text-sm text-primary-300">
                                    {items.length} {items.length === 1 ? 'item' : 'items'}
                                    {customerName ? ` for ${customerName}` : ' in current sale'}
                                </p>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
                                <WalletCards className="h-6 w-6 text-white" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-primary-400">Subtotal</p>
                            <p className="mt-1 text-sm font-bold text-primary-950">{formatCurrency(totals.rawSubtotal)}</p>
                        </div>
                        <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-primary-400">Discount</p>
                            <p className="mt-1 text-sm font-bold text-accent-danger">-{formatCurrency(totals.discountAmount)}</p>
                        </div>
                        <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-primary-400">VAT</p>
                            <p className="mt-1 text-sm font-bold text-primary-950">{formatCurrency(totals.tax)}</p>
                        </div>
                        <div className="rounded-xl border border-accent-blue/30 bg-accent-blue/10 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-accent-blue">Total</p>
                            <p className="mt-1 text-sm font-bold text-accent-blue">{formatCurrency(totals.total)}</p>
                        </div>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className="space-y-4">
                            <div>
                                <label className="mb-2 block text-sm font-semibold text-primary-700">Cash Received</label>
                                <div className="relative">
                                    <Banknote className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary-400" />
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={paymentAmount}
                                        onChange={(e) => {
                                            setPaymentAmount(e.target.value);
                                            setPaymentError('');
                                        }}
                                        onKeyDown={handlePaymentInputKeyDown}
                                        placeholder="Enter cash amount"
                                        className="w-full rounded-xl border border-primary-200 bg-white py-3 pl-12 pr-4 text-2xl font-bold text-primary-950 shadow-sm placeholder-primary-300 focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary-700">
                                    <Calculator className="h-4 w-4 text-primary-400" />
                                    Quick tender
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {cashTenderOptions.map((amount) => (
                                        <button
                                            key={amount}
                                            type="button"
                                            onClick={() => setTenderAmount(amount)}
                                            className="min-h-12 rounded-lg border border-primary-200 bg-white px-3 py-2 text-left transition-all hover:border-accent-blue hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/30"
                                        >
                                            <span className="block text-xs font-semibold uppercase tracking-wider text-primary-400">
                                                {amount === totals.total ? 'Exact' : 'Cash'}
                                            </span>
                                            <span className="block text-base font-bold text-primary-950">{formatCurrency(amount)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={`rounded-xl border p-4 ${hasEnoughCash ? 'border-accent-success/30 bg-accent-success/10' : 'border-accent-danger/30 bg-accent-danger/10'}`}>
                                <p className="text-sm font-semibold text-primary-600">
                                    {hasEnoughCash ? 'Change Due' : 'Amount Short'}
                                </p>
                                <p className={`mt-1 text-3xl font-bold ${hasEnoughCash ? 'text-accent-success' : 'text-accent-danger'}`}>
                                    {formatCurrency(hasEnoughCash ? Math.max(0, change) : amountShort)}
                                </p>
                                <p className="mt-2 text-sm text-primary-500">
                                    {hasEnoughCash ? 'Ready to complete and print the receipt.' : 'Enter enough cash before completing the sale.'}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-primary-200 bg-white">
                            <div className="flex items-center justify-between border-b border-primary-100 px-4 py-3">
                                <p className="text-sm font-bold text-primary-950">Sale Review</p>
                                <p className="text-xs font-semibold text-primary-400">{items.length} lines</p>
                            </div>
                            <div className="max-h-72 overflow-y-auto px-4 py-2">
                                {items.map((item) => (
                                    <div key={item.id} className="flex items-start justify-between gap-3 border-b border-primary-100 py-3 last:border-b-0">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-primary-950">{item.name}</p>
                                            <p className="mt-0.5 text-xs text-primary-500">
                                                {item.quantity} x {formatCurrency(item.price)}
                                            </p>
                                        </div>
                                        <p className="shrink-0 text-sm font-bold text-primary-950">
                                            {formatCurrency(item.price * item.quantity)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {paymentError && (
                        <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/10 px-4 py-3 text-sm text-accent-danger">
                            {paymentError}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Button
                            variant="secondary"
                            fullWidth
                            disabled={processingPayment}
                            onClick={closePaymentModal}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="success"
                            fullWidth
                            disabled={!canCompletePayment}
                            onClick={handlePayment}
                            leftIcon={<Check className="w-4 h-4" />}
                            isLoading={processingPayment}
                        >
                            {processingPayment ? 'Saving Sale' : 'Complete Sale'}
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

                <div className="flex flex-col gap-3 print:hidden sm:flex-row">
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

            <LargeBarcodeModal
                isOpen={Boolean(largeBarcodeProduct)}
                onClose={() => setLargeBarcodeProduct(null)}
                barcodeValue={largeBarcodeProduct ? buildProductBarcodeValue(largeBarcodeProduct.sku || 'UNKNOWN') : ''}
                productName={largeBarcodeProduct?.name}
                title="Product Barcode"
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


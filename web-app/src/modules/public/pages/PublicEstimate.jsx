import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Minus, Trash2, Calculator, Printer, User, Phone, Car, Wrench, X, Check, ChevronRight, Package, ArrowLeft } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';
import useDataStore from '../../../store/useDataStore';
import useServiceCatalog from '../../../hooks/useServiceCatalog';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';

const createQuoteMeta = () => ({
    issuedAt: new Date(),
    reference: `QT-${Date.now().toString().slice(-6)}`,
});

/**
 * Public Estimate Page - Modern Automotive Aesthetic
 */
const PublicEstimate = () => {
    const { products: storeProducts, loading } = useDataStore();
    const { services: availableServices } = useServiceCatalog();
    const [step, setStep] = useState(1); // 1 = build, 2 = review, 3 = result
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [vehicleInfo, setVehicleInfo] = useState('');

    const [selectedParts, setSelectedParts] = useState([]);
    const [selectedServices, setSelectedServices] = useState([]);
    const [partSearch, setPartSearch] = useState('');
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [quoteMeta, setQuoteMeta] = useState(() => createQuoteMeta());

    // Operations
    const addPart = (product) => {
        const existing = selectedParts.find(p => p.id === product.id);
        if (existing) {
            setSelectedParts(parts => parts.map(p => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p));
        } else {
            setSelectedParts([...selectedParts, { ...product, quantity: 1 }]);
        }
    };
    const removePart = (id) => setSelectedParts(parts => parts.filter(p => p.id !== id));
    const updateQty = (id, qty) => {
        if (qty < 1) return removePart(id);
        setSelectedParts(parts => parts.map(p => p.id === id ? { ...p, quantity: qty } : p));
    };

    const toggleService = (service) => {
        const existing = selectedServices.find(s => s.id === service.id);
        if (existing) {
            setSelectedServices(services => services.filter(s => s.id !== service.id));
        } else {
            setSelectedServices([...selectedServices, service]);
        }
    };

    // Totals
    const partsTotal = selectedParts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
    const servicesTotal = selectedServices.reduce((sum, s) => sum + s.price, 0);
    const subtotal = partsTotal + servicesTotal;
    const vat = subtotal * 0.12;
    const total = subtotal + vat;

    const availableProducts = storeProducts.map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        category: p.category,
        model: p.model,
    }));

    const filteredProducts = availableProducts.filter(p =>
        p.name.toLowerCase().includes(partSearch.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(partSearch.toLowerCase()) ||
        (p.model || '').toLowerCase().includes(partSearch.toLowerCase())
    );

    const hasItems = selectedParts.length > 0 || selectedServices.length > 0;

    const handleViewOfficialQuote = () => {
        setQuoteMeta(createQuoteMeta());
        setStep(3);
    };

    const resetForm = () => {
        setStep(1);
        setCustomerName('');
        setCustomerPhone('');
        setVehicleInfo('');
        setSelectedParts([]);
        setSelectedServices([]);
        setShowPrintPreview(false);
        setQuoteMeta(createQuoteMeta());
    };

    return (
        <div className="bg-primary-50 min-h-screen relative font-sans text-primary-900 pb-20 print:bg-white print:p-0 print:m-0 print:min-h-0 print:block">
            {/* Atmospheric Background - Light */}
            <div className="fixed inset-0 bg-gradient-to-b from-white via-primary-50 to-primary-50 -z-10 print:hidden" />
            <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-accent-blue/10 rounded-full blur-[150px] mix-blend-multiply pointer-events-none -z-10 opacity-60 print:hidden" />
            <div className="absolute top-[30%] right-[-10%] w-[40vw] h-[40vw] bg-accent-danger/5 rounded-full blur-[120px] mix-blend-multiply pointer-events-none -z-10 opacity-50 print:hidden" />

            {/* Page Header */}
            <section className="relative pt-32 pb-16 px-4 md:px-8 xl:px-12 z-10 max-w-[1600px] mx-auto layout-container border-b border-primary-200 mb-12 print:hidden">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12">
                    <div className="max-w-3xl">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="w-8 h-1 bg-accent-primary" />
                            <span className="text-xs font-bold tracking-[0.3em] font-sans text-primary-500 uppercase">Quotations</span>
                        </div>
                        <h1 className="text-5xl md:text-7xl font-display font-extrabold text-primary-950 tracking-tighter leading-[1.1]">
                            Cost Estimator
                        </h1>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-2 font-display text-sm font-medium">
                        {[
                            { num: 1, label: 'Select' },
                            { num: 2, label: 'Details' },
                            { num: 3, label: 'Quotation' },
                        ].map((s, i) => (
                            <div key={s.num} className="flex items-center">
                                <span className={`flex items-center justify-center h-8 px-4 border rounded-full transition-colors ${step === s.num ? 'bg-accent-primary border-accent-primary text-white shadow-sm' : step > s.num ? 'bg-white border-primary-300 text-primary-950' : 'bg-primary-50 border-primary-200 text-primary-400'}`}>
                                    {s.num}. {s.label}
                                </span>
                                {i < 2 && <div className={`w-6 h-px mx-2 ${step > s.num ? 'bg-primary-300' : 'bg-primary-200'}`} />}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Main Content Area */}
            <section className="relative z-10 max-w-[1600px] mx-auto px-4 md:px-8 xl:px-12 py-2 print:hidden">

                <AnimatePresence mode="wait">
                    {/* STEP 1: Build Quote */}
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
                        >
                            {/* Left Column - Selection */}
                            <div className="lg:col-span-8 space-y-8">

                                {/* Parts Selection */}
                                <div className="surface p-6">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-accent-primary/5 border border-accent-primary/20 flex items-center justify-center">
                                                <Package className="w-5 h-5 text-accent-primary" />
                                            </div>
                                            <h3 className="text-xl font-display font-semibold text-primary-950">Genuine Parts</h3>
                                        </div>

                                        <div className="relative w-full sm:w-72">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-500" />
                                            <input
                                                type="text"
                                                placeholder="Search by part name or SKU..."
                                                value={partSearch}
                                                onChange={(e) => setPartSearch(e.target.value)}
                                                className="input pl-10 py-2.5 text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {filteredProducts.map((product) => {
                                            const isSelected = selectedParts.some(p => p.id === product.id);
                                            return (
                                                <button
                                                    key={product.id}
                                                    onClick={() => addPart(product)}
                                                    className={`p-4 text-left rounded-xl border flex flex-col gap-2 transition-all duration-300 ${isSelected
                                                        ? 'bg-accent-primary/5 border-accent-primary/30 ring-1 ring-accent-primary/30'
                                                        : 'bg-white border-primary-200 hover:border-accent-primary hover:bg-primary-50 shadow-sm'
                                                        }`}
                                                >
                                                    <span className="text-xs font-semibold text-primary-500">{product.sku}</span>
                                                    <span className="text-base font-display font-medium text-primary-950 line-clamp-1">{product.name}</span>
                                                    <span className="text-sm font-bold text-accent-blue mt-auto">{formatCurrency(product.price)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Services Selection */}
                                <div className="surface p-6">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-10 h-10 rounded-lg bg-accent-primary/5 border border-accent-primary/20 flex items-center justify-center">
                                            <Wrench className="w-5 h-5 text-accent-primary" />
                                        </div>
                                        <h3 className="text-xl font-display font-semibold text-primary-950">Maintenance Services</h3>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {availableServices.map((service) => {
                                            const isSelected = selectedServices.some(s => s.id === service.id);
                                            return (
                                                <button
                                                    key={service.id}
                                                    onClick={() => toggleService(service)}
                                                    className={`p-4 text-left rounded-xl border flex items-center justify-between transition-all duration-300 ${isSelected
                                                        ? 'bg-accent-primary/5 border-accent-primary/30 ring-1 ring-accent-primary/30 text-primary-950'
                                                        : 'bg-white border-primary-200 text-primary-600 hover:border-accent-primary hover:text-primary-950 shadow-sm'
                                                        }`}
                                                >
                                                    <span className="text-sm font-medium pr-4">{service.name}</span>
                                                    <span className={`text-sm font-bold ${isSelected ? 'text-accent-primary' : 'text-primary-500'}`}>
                                                        {formatCurrency(service.price)}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column - Summary */}
                            <div className="lg:col-span-4">
                                <div className="surface sticky top-28 flex flex-col min-h-[500px]">
                                    <div className="p-6 border-b border-primary-200">
                                        <h3 className="text-lg font-display font-semibold text-primary-950">Quotation Summary</h3>
                                        <p className="text-sm text-primary-500 mt-1">Review your selected items</p>
                                    </div>

                                    <div className="p-6 flex-1 flex flex-col bg-white">
                                        {!hasItems ? (
                                            <div className="flex-1 flex flex-col items-center justify-center text-center">
                                                <div className="w-16 h-16 rounded-full bg-accent-primary/5 border border-accent-primary/20 flex items-center justify-center mb-4">
                                                    <Calculator className="w-8 h-8 text-accent-primary" />
                                                </div>
                                                <span className="text-lg font-display font-medium text-primary-950">No items selected</span>
                                                <span className="text-sm text-primary-500 mt-2">Add parts or services to begin estimating.</span>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex flex-col gap-6">

                                                {/* Parts List */}
                                                {selectedParts.length > 0 && (
                                                    <div>
                                                        <span className="text-xs font-bold uppercase tracking-widest text-primary-500 mb-3 block">Parts</span>
                                                        <div className="space-y-3">
                                                            {selectedParts.map((part) => (
                                                                <div key={part.id} className="flex flex-col gap-2 p-3 bg-white rounded-xl border border-primary-200 shadow-sm">
                                                                    <div className="flex justify-between items-start">
                                                                        <span className="text-sm font-medium text-primary-950 line-clamp-1 pr-2">{part.name}</span>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-sm font-bold text-accent-blue whitespace-nowrap">{formatCurrency(part.price * part.quantity)}</span>
                                                                            <button onClick={() => removePart(part.id)} className="p-0.5 text-primary-400 hover:text-accent-danger hover:bg-accent-danger/10 rounded transition-colors">
                                                                                <X className="w-4 h-4" />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center bg-primary-50 border border-primary-200 rounded-lg p-0.5">
                                                                            <button onClick={() => updateQty(part.id, part.quantity - 1)} className="p-1 hover:bg-white rounded-md text-primary-500 hover:text-primary-950 transition-colors">
                                                                                <Minus className="w-4 h-4" />
                                                                            </button>
                                                                            <span className="text-xs font-semibold w-8 text-center text-primary-900">{part.quantity}</span>
                                                                            <button onClick={() => updateQty(part.id, part.quantity + 1)} className="p-1 hover:bg-white rounded-md text-primary-500 hover:text-primary-950 transition-colors">
                                                                                <Plus className="w-4 h-4" />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Services List */}
                                                {selectedServices.length > 0 && (
                                                    <div>
                                                        <span className="text-xs font-bold uppercase tracking-widest text-primary-500 mb-3 block">Services</span>
                                                        <div className="space-y-2">
                                                            {selectedServices.map((service) => (
                                                                <div key={service.id} className="flex justify-between items-center p-3 bg-white rounded-xl border border-primary-200 shadow-sm group">
                                                                    <span className="text-sm text-primary-950 line-clamp-1 pr-2">{service.name}</span>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-sm font-semibold text-accent-blue">{formatCurrency(service.price)}</span>
                                                                        <button onClick={() => toggleService(service)} className="text-primary-400 hover:text-accent-danger transition-colors">
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Totals & Next Button */}
                                    <div className="p-6 border-t border-primary-200 bg-primary-50/50">
                                        <div className="space-y-3 mb-6">
                                            <div className="flex justify-between text-sm text-primary-600">
                                                <span>Subtotal</span><span className="text-primary-950 font-medium">{formatCurrency(subtotal)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm text-primary-600">
                                                <span>VAT (12%)</span><span className="text-primary-950 font-medium">{formatCurrency(vat)}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-4 border-t border-primary-200">
                                                <span className="text-base font-medium text-primary-950">Estimated Total</span>
                                                <span className="text-2xl font-display font-bold text-accent-blue">{formatCurrency(total)}</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setStep(2)}
                                            disabled={!hasItems}
                                            className="btn btn-primary w-full"
                                        >
                                            Generate Estimate
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 2: Customer Details */}
                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="max-w-2xl mx-auto"
                        >
                            <div className="bg-white p-8 sm:p-10 rounded-2xl border border-primary-200 shadow-md">
                                <div className="mb-8 text-center">
                                    <div className="w-16 h-16 bg-accent-primary/10 border border-accent-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <User className="w-8 h-8 text-accent-primary" />
                                    </div>
                                    <h2 className="text-3xl font-display font-bold text-primary-950 mb-2">Customer Information</h2>
                                    <p className="text-primary-600 text-sm">Please provide details to attach to your official quotation.</p>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-primary-600 ml-1">Full Name (Optional)</label>
                                        <div className="relative">
                                            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                                            <input
                                                type="text"
                                                value={customerName}
                                                onChange={e => setCustomerName(e.target.value)}
                                                placeholder="e.g. John Doe"
                                                className="input pl-12"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-primary-600 ml-1">Phone Number (Optional)</label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                                            <input
                                                type="tel"
                                                value={customerPhone}
                                                onChange={e => setCustomerPhone(e.target.value)}
                                                placeholder="e.g. 0917 123 4567"
                                                className="input pl-12"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-primary-600 ml-1">Vehicle Make/Model (Optional)</label>
                                        <div className="relative">
                                            <Car className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                                            <input
                                                type="text"
                                                value={vehicleInfo}
                                                onChange={e => setVehicleInfo(e.target.value)}
                                                placeholder="e.g. Mitsubishi Montero 2021"
                                                className="input pl-12"
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-8 flex flex-col sm:flex-row gap-4">
                                        <button
                                            onClick={() => setStep(1)}
                                            className="btn btn-outline border-primary-300 text-primary-600 hover:bg-primary-50 hover:text-primary-950 flex-1"
                                        >
                                            <ArrowLeft className="w-4 h-4" /> Back to Selection
                                        </button>
                                        <button
                                            onClick={handleViewOfficialQuote}
                                            className="btn btn-primary flex-1"
                                        >
                                            View Official Quote <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 3: Result/Quotation */}
                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="max-w-3xl mx-auto"
                        >
                            {/* --- LIGHT MODE UI (WEB ONLY) --- */}
                            <div className="bg-white p-1 rounded-2xl border border-primary-200 shadow-md print:hidden">
                                <div className="bg-white rounded-xl overflow-hidden">

                                    {/* Success Banner (Web Only) */}
                                    <div className="bg-primary-50 p-6 flex items-center justify-between border-b border-primary-200 print:hidden">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-accent-success/10 rounded-full flex items-center justify-center border border-accent-success/20">
                                                <Check className="w-6 h-6 text-accent-success" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-primary-950">Quotation Ready</h3>
                                                <p className="text-sm text-primary-600 font-medium">Valid for 7 days from generation.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={() => setShowPrintPreview(true)} className="btn btn-primary px-4 py-2 text-sm shadow-none">
                                                <Printer className="w-4 h-4" /> Print
                                            </button>
                                            <button onClick={resetForm} className="btn bg-primary-100 text-primary-700 hover:bg-primary-200 px-4 py-2 text-sm">
                                                New
                                            </button>
                                        </div>
                                    </div>

                                    {/* Actual Document Content */}
                                    <div className="p-8 sm:p-12 text-primary-900 font-sans" id="estimate-receipt">
                                        {/* Company Header */}
                                        <div className="flex justify-between items-start border-b-2 border-primary-950 pb-8 mb-8">
                                            <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-8 h-8 bg-accent-primary rounded flex items-center justify-center">
                                                        <span className="text-white font-display font-bold leading-none">L</span>
                                                    </div>
                                                    <h2 className="text-2xl font-display font-bold tracking-tight text-primary-950">LIMEN</h2>
                                                </div>
                                                <p className="text-sm text-primary-600 font-medium">Genuine Auto Parts Center</p>
                                            </div>
                                            <div className="text-right text-sm text-primary-600">
                                                <p className="font-semibold text-primary-950">OFFICIAL QUOTATION</p>
                                                <p>Date: {quoteMeta.issuedAt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' })}</p>
                                                <p className="font-mono text-xs mt-1">REF: {quoteMeta.reference}</p>
                                            </div>
                                        </div>

                                        {/* Customer Info Box */}
                                        <div className="bg-primary-50 rounded-lg p-5 mb-8 border border-primary-200 text-sm">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-primary-500 font-medium mb-1">Prepared For:</p>
                                                    <p className="font-semibold text-primary-950">{customerName || 'Walk-in Customer'}</p>
                                                    {customerPhone && <p className="text-primary-600">{customerPhone}</p>}
                                                </div>
                                                <div>
                                                    <p className="text-primary-500 font-medium mb-1">Vehicle Data:</p>
                                                    <p className="font-semibold text-primary-950">{vehicleInfo || 'N/A'}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Table Headers */}
                                        <div className="grid grid-cols-12 gap-4 border-b border-primary-300 pb-2 mb-4 text-xs font-bold text-primary-500 uppercase tracking-wider">
                                            <div className="col-span-6 selection">Description</div>
                                            <div className="col-span-2 text-center">Qty</div>
                                            <div className="col-span-2 text-right">Unit Price</div>
                                            <div className="col-span-2 text-right">Amount</div>
                                        </div>

                                        <div className="space-y-6">
                                            {/* Hardware */}
                                            {selectedParts.length > 0 && (
                                                <div>
                                                    <p className="font-bold text-sm text-primary-950 mb-2">Genuine Components</p>
                                                    <div className="space-y-2">
                                                        {selectedParts.map(p => (
                                                            <div key={p.id} className="grid grid-cols-12 gap-4 text-sm items-center border-b border-primary-100 pb-2">
                                                                <div className="col-span-6 font-medium text-primary-900">{p.name} <span className="text-xs text-primary-500 block font-normal">SKU: {p.sku}</span></div>
                                                                <div className="col-span-2 text-center text-primary-600">{p.quantity}</div>
                                                                <div className="col-span-2 text-right text-primary-600">{formatCurrency(p.price)}</div>
                                                                <div className="col-span-2 text-right font-semibold text-primary-950">{formatCurrency(p.price * p.quantity)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Services */}
                                            {selectedServices.length > 0 && (
                                                <div>
                                                    <p className="font-bold text-sm text-primary-950 mb-2 mt-4">Labor & Services</p>
                                                    <div className="space-y-2">
                                                        {selectedServices.map(s => (
                                                            <div key={s.id} className="grid grid-cols-12 gap-4 text-sm items-center border-b border-primary-100 pb-2">
                                                                <div className="col-span-6 font-medium text-primary-900">{s.name}</div>
                                                                <div className="col-span-2 text-center text-primary-600">1</div>
                                                                <div className="col-span-2 text-right text-primary-600">{formatCurrency(s.price)}</div>
                                                                <div className="col-span-2 text-right font-semibold text-primary-950">{formatCurrency(s.price)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Totals Section */}
                                        <div className="border-t-2 border-primary-300 mt-8 pt-6 flex justify-end">
                                            <div className="w-full sm:w-1/2 md:w-1/3 space-y-3 font-sans">
                                                <div className="flex justify-between text-sm text-primary-600">
                                                    <span>Subtotal</span><span className="text-primary-950 font-medium">{formatCurrency(subtotal)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm text-primary-600">
                                                    <span>VAT (12%)</span><span className="text-primary-950 font-medium">{formatCurrency(vat)}</span>
                                                </div>
                                                <div className="flex justify-between text-lg font-bold text-primary-950 pt-3 border-t border-primary-200">
                                                    <span>Total Due</span><span className="text-accent-blue">{formatCurrency(total)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Footer Note */}
                                        <div className="mt-16 pt-8 border-t border-primary-200 text-xs text-center text-primary-500">
                                            <p className="font-medium mb-1">Thank you for choosing Limen Auto Parts Center.</p>
                                            <p>This quotation is an estimate and prices may vary depending on actual physical inspection.</p>
                                            <p>1308, 264 Epifanio de los Santos Ave, Pasay City, 1308 Metro Manila | +63 917 123 4567</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </section>

            <Modal
                isOpen={showPrintPreview}
                onClose={() => setShowPrintPreview(false)}
                title="Print Preview"
                size="lg"
            >
                <div className="receipt-preview" style={{ fontFamily: 'Inter, Arial, sans-serif' }}>
                    <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '12px', marginBottom: '12px' }}>
                        <img src="/LogoLimen.jpg" alt="Limen Logo" style={{ height: '48px', margin: '0 auto 6px', display: 'block', filter: 'grayscale(1) contrast(1.3)' }} />
                        <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>LIMEN AUTO PARTS CENTER</h2>
                        <p style={{ fontSize: '11px', margin: '2px 0 0', color: '#555' }}>1308, 264 Epifanio de los Santos Ave, Pasay City, 1308 Metro Manila</p>
                        <p style={{ fontSize: '11px', margin: '1px 0 0', color: '#555' }}>Tel: +63 917 123 4567 | TIN: 000-123-456-000</p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                        <div>
                            <div>
                                <span style={{ fontWeight: '600' }}>Prepared for: </span>
                                <span style={{ borderBottom: '1px solid #aaa', display: 'inline-block', minWidth: '180px', paddingBottom: '1px' }}>
                                    {customerName || 'Walk-in Customer'}
                                </span>
                            </div>
                            {customerPhone && (
                                <div style={{ marginTop: '2px' }}>
                                    <span style={{ fontWeight: '600' }}>Phone: </span>
                                    <span>{customerPhone}</span>
                                </div>
                            )}
                            <div style={{ marginTop: '2px' }}>
                                <span style={{ fontWeight: '600' }}>Vehicle: </span>
                                <span>{vehicleInfo || 'N/A'}</span>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div><span style={{ fontWeight: '600' }}>Date: </span><span>{quoteMeta.issuedAt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' })}</span></div>
                            <div><span style={{ fontWeight: '600' }}>Ref No: </span><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{quoteMeta.reference}</span></div>
                        </div>
                    </div>

                    <h3 style={{ textAlign: 'center', fontSize: '20px', fontWeight: '800', margin: '12px 0 14px', letterSpacing: '2px' }}>QUOTATION</h3>

                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'left', textTransform: 'uppercase' }}>Qty</th>
                                <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'left', textTransform: 'uppercase' }}>Item</th>
                                <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'right', textTransform: 'uppercase' }}>Price/Unit</th>
                                <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'right', textTransform: 'uppercase' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {selectedParts.map((part) => (
                                <tr key={part.id}>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>{part.quantity}</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>
                                        {part.name}
                                        <span style={{ display: 'block', fontSize: '10px', color: '#888', fontFamily: 'monospace' }}>{part.sku}</span>
                                    </td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right' }}>{formatCurrency(part.price)}</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(part.price * part.quantity)}</td>
                                </tr>
                            ))}
                            {selectedServices.map((service) => (
                                <tr key={service.id}>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>1</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>
                                        {service.name}
                                        <span style={{ display: 'block', fontSize: '10px', color: '#888' }}>Service / Labor</span>
                                    </td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right' }}>{formatCurrency(service.price)}</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(service.price)}</td>
                                </tr>
                            ))}
                            {(selectedParts.length + selectedServices.length) < 8 && Array.from({ length: 8 - selectedParts.length - selectedServices.length }).map((_, index) => (
                                <tr key={`empty-${index}`}>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>&nbsp;</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}></td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}></td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                        <div style={{ width: '220px', fontSize: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #ddd' }}>
                                <span style={{ fontWeight: '600' }}>Subtotal</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #ddd' }}>
                                <span style={{ fontWeight: '600' }}>VAT (12%)</span>
                                <span>{formatCurrency(vat)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '2px solid black', marginTop: '4px', fontWeight: '800', fontSize: '14px' }}>
                                <span>Total</span>
                                <span>{formatCurrency(total)}</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '28px', paddingTop: '12px', borderTop: '1px solid #ccc' }}>
                        <p style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>This is a quotation only. Actual costs may vary upon service.</p>
                        <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>Validity: 7 Days from issue date</p>
                    </div>
                </div>
                <div className="mt-4 flex gap-3 print:hidden">
                    <Button variant="secondary" fullWidth onClick={() => setShowPrintPreview(false)}>
                        Close
                    </Button>
                    <Button variant="primary" fullWidth leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
                        Print
                    </Button>
                </div>
            </Modal>
        </div >
    );
};

export default PublicEstimate;


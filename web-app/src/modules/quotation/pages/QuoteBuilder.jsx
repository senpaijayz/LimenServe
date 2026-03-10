import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, Trash2, Printer, Save, FileText, User, Phone } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import { formatCurrency } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import useDataStore from '../../../store/useDataStore';

// Services (labor charges)
const availableServices = [
    { id: 's1', name: 'Oil Change Service', price: 500 },
    { id: 's2', name: 'Brake Pad Replacement (Labor)', price: 800 },
    { id: 's3', name: 'Engine Tune-up', price: 1500 },
    { id: 's4', name: 'Filter Replacement (Labor)', price: 200 },
    { id: 's5', name: 'Wheel Alignment', price: 1000 },
    { id: 's6', name: 'Tire Rotation & Balancing', price: 600 },
    { id: 's7', name: 'Battery Replacement (Labor)', price: 300 },
    { id: 's8', name: 'Suspension Inspection', price: 700 },
];

/**
 * Quote Builder Page
 * Create cost estimates and quotations
 */
const QuoteBuilder = () => {
    const { success } = useToast();
    const { products: storeProducts, loading } = useDataStore();
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [selectedParts, setSelectedParts] = useState([]);
    const [selectedServices, setSelectedServices] = useState([]);
    const [notes, setNotes] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Add part to quote
    const addPart = (product) => {
        const existing = selectedParts.find(p => p.id === product.id);
        if (existing) {
            setSelectedParts(parts =>
                parts.map(p => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p)
            );
        } else {
            setSelectedParts([...selectedParts, { ...product, quantity: 1 }]);
        }
    };

    // Remove part
    const removePart = (id) => {
        setSelectedParts(parts => parts.filter(p => p.id !== id));
    };

    // Update part quantity
    const updatePartQuantity = (id, quantity) => {
        if (quantity < 1) {
            removePart(id);
            return;
        }
        setSelectedParts(parts =>
            parts.map(p => p.id === id ? { ...p, quantity } : p)
        );
    };

    // Toggle service
    const toggleService = (service) => {
        const existing = selectedServices.find(s => s.id === service.id);
        if (existing) {
            setSelectedServices(services => services.filter(s => s.id !== service.id));
        } else {
            setSelectedServices([...selectedServices, service]);
        }
    };

    // Calculate totals
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

    // Filter products
    const filteredProducts = availableProducts.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Handle save quote
    const handleSave = () => {
        success('Quotation saved successfully!');
    };

    // Handle print
    const handlePrint = () => {
        setShowPreview(true);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel - Parts & Services Selection */}
            <div className="lg:col-span-2 space-y-6">
                {/* Customer Info */}
                <Card title="Customer Information">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                            label="Customer Name"
                            placeholder="Enter customer name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            leftIcon={<User className="w-4 h-4" />}
                        />
                        <Input
                            label="Phone Number"
                            placeholder="09XX XXX XXXX"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            leftIcon={<Phone className="w-4 h-4" />}
                        />
                    </div>
                </Card>

                {/* Parts Selection */}
                <Card title="Select Parts">
                    {/* Search */}
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                        <input
                            type="text"
                            placeholder="Search parts..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-primary-200 rounded-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm"
                        />
                    </div>

                    {/* Parts Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {filteredProducts.map((product) => {
                            const isSelected = selectedParts.some(p => p.id === product.id);
                            return (
                                <motion.button
                                    key={product.id}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => addPart(product)}
                                    className={`p-3 rounded-lg border text-left transition-all ${isSelected
                                        ? 'border-accent-blue bg-accent-blue/5 shadow-sm'
                                        : 'border-primary-200 bg-white hover:border-primary-300 hover:shadow-sm'
                                        }`}
                                >
                                    <p className="text-sm font-semibold text-primary-950 line-clamp-2 mb-1">
                                        {product.name}
                                    </p>
                                    <p className="text-xs text-primary-500 font-mono mb-2">
                                        {product.sku || 'NO PN'}
                                    </p>
                                    <p className="text-sm font-bold text-accent-blue">
                                        {formatCurrency(product.price)}
                                    </p>
                                </motion.button>
                            );
                        })}
                    </div>
                </Card>

                {/* Services Selection */}
                <Card title="Select Services">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {availableServices.map((service) => {
                            const isSelected = selectedServices.some(s => s.id === service.id);
                            return (
                                <button
                                    key={service.id}
                                    onClick={() => toggleService(service)}
                                    className={`p-4 rounded-lg border flex items-center justify-between transition-all ${isSelected
                                        ? 'border-accent-blue bg-accent-blue/5 shadow-sm'
                                        : 'border-primary-200 bg-white hover:border-primary-300 hover:shadow-sm'
                                        }`}
                                >
                                    <span className="text-sm font-semibold text-primary-950">
                                        {service.name}
                                    </span>
                                    <span className="text-sm font-bold text-accent-blue">
                                        {formatCurrency(service.price)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </Card>

                {/* Notes */}
                <Card title="Additional Notes">
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any special instructions or notes..."
                        rows={3}
                        className="w-full px-4 py-3 bg-white border border-primary-200 rounded-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm resize-none"
                    />
                </Card>
            </div>

            {/* Right Panel - Quote Summary */}
            <div className="lg:col-span-1">
                <div className="bg-white border border-primary-200 rounded-xl shadow-sm p-4 sticky top-20">
                    <h3 className="text-lg font-display font-bold text-primary-950 mb-4 pb-3 border-b border-primary-100">
                        Quote Summary
                    </h3>

                    {/* Selected Parts */}
                    {selectedParts.length > 0 && (
                        <div className="mb-4">
                            <p className="text-sm font-semibold text-primary-500 uppercase tracking-widest mb-2">Parts</p>
                            <div className="space-y-2">
                                {selectedParts.map((part) => (
                                    <div key={part.id} className="flex items-center justify-between p-2 bg-primary-50 rounded-lg border border-primary-100">
                                        <div className="flex-1 min-w-0 mr-2">
                                            <p className="text-sm font-semibold text-primary-950 truncate">{part.name}</p>
                                            <p className="text-[10px] text-primary-500 font-mono">{part.sku || 'NO PN'}</p>
                                            <p className="text-xs font-bold text-accent-blue mt-1">{formatCurrency(part.price)} × {part.quantity}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={part.quantity}
                                                onChange={(e) => updatePartQuantity(part.id, parseInt(e.target.value) || 0)}
                                                className="w-14 px-2 py-1 bg-white border border-primary-200 rounded text-sm text-center font-bold text-primary-950 focus:outline-none focus:border-accent-blue shadow-sm"
                                                min="1"
                                            />
                                            <button
                                                onClick={() => removePart(part.id)}
                                                className="p-1 text-accent-danger hover:bg-accent-danger/10 rounded-md transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Selected Services */}
                    {selectedServices.length > 0 && (
                        <div className="mb-4">
                            <p className="text-sm font-semibold text-primary-500 uppercase tracking-widest mb-2">Services</p>
                            <div className="space-y-2">
                                {selectedServices.map((service) => (
                                    <div key={service.id} className="flex items-center justify-between p-2 bg-primary-50 rounded-lg border border-primary-100">
                                        <p className="text-sm font-semibold text-primary-950">{service.name}</p>
                                        <p className="text-sm font-bold text-accent-blue">{formatCurrency(service.price)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Empty State */}
                    {selectedParts.length === 0 && selectedServices.length === 0 && (
                        <div className="text-center py-8">
                            <FileText className="w-12 h-12 text-primary-300 mx-auto mb-3" />
                            <p className="text-primary-500 font-bold tracking-wide">No items selected</p>
                            <p className="text-sm text-primary-400 mt-1">Add parts and services to create a quote</p>
                        </div>
                    )}

                    {/* Totals */}
                    {(selectedParts.length > 0 || selectedServices.length > 0) && (
                        <div className="border-t border-primary-200 pt-4 mt-4 space-y-2">
                            <div className="flex justify-between text-sm text-primary-600 font-medium">
                                <span>Parts Subtotal</span>
                                <span>{formatCurrency(partsTotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-primary-600 font-medium">
                                <span>Services Subtotal</span>
                                <span>{formatCurrency(servicesTotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-primary-600 font-medium">
                                <span>VAT (12%)</span>
                                <span>{formatCurrency(vat)}</span>
                            </div>
                            <div className="flex justify-between text-xl font-bold text-primary-950 pt-3 mt-1 border-t border-primary-200">
                                <span>Total Estimate</span>
                                <span className="text-accent-blue">{formatCurrency(total)}</span>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="mt-6 space-y-3">
                        <Button
                            variant="primary"
                            fullWidth
                            leftIcon={<Printer className="w-4 h-4" />}
                            onClick={handlePrint}
                            disabled={selectedParts.length === 0 && selectedServices.length === 0}
                        >
                            Print Quotation
                        </Button>
                        <Button
                            variant="secondary"
                            fullWidth
                            leftIcon={<Save className="w-4 h-4" />}
                            onClick={handleSave}
                            disabled={selectedParts.length === 0 && selectedServices.length === 0}
                        >
                            Save Quote
                        </Button>
                    </div>
                </div>
            </div>

            {/* Print Preview Modal */}
            <Modal
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                title="Print Preview"
                size="lg"
            >
                <div className="receipt-preview" style={{ fontFamily: 'Inter, Arial, sans-serif' }}>
                    {/* Company Header */}
                    <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '12px', marginBottom: '12px' }}>
                        <img src="/LogoLimen.jpg" alt="Limen Logo" style={{ height: '48px', margin: '0 auto 6px', display: 'block', filter: 'grayscale(1) contrast(1.3)' }} />
                        <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>LIMEN AUTO PARTS CENTER</h2>
                        <p style={{ fontSize: '11px', margin: '2px 0 0', color: '#555' }}>1308, 264 Epifanio de los Santos Ave, Pasay City, 1308 Metro Manila</p>
                        <p style={{ fontSize: '11px', margin: '1px 0 0', color: '#555' }}>Tel: +63 917 123 4567 | TIN: 000-123-456-000</p>
                    </div>

                    {/* Prepared For / Date / Ref No */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                        <div>
                            <div>
                                <span style={{ fontWeight: '600' }}>Prepared for: </span>
                                <span style={{ borderBottom: '1px solid #aaa', display: 'inline-block', minWidth: '180px', paddingBottom: '1px' }}>{customerName || 'Walk-in Customer'}</span>
                            </div>
                            {customerPhone && (
                                <div style={{ marginTop: '2px' }}>
                                    <span style={{ fontWeight: '600' }}>Phone: </span>
                                    <span>{customerPhone}</span>
                                </div>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div><span style={{ fontWeight: '600' }}>Date: </span><span>{new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' })}</span></div>
                            <div><span style={{ fontWeight: '600' }}>Ref No: </span><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>QT-{Date.now().toString().slice(-6)}</span></div>
                        </div>
                    </div>

                    {/* Title */}
                    <h3 style={{ textAlign: 'center', fontSize: '20px', fontWeight: '800', margin: '12px 0 14px', letterSpacing: '2px' }}>QUOTATION</h3>

                    {/* Items Table */}
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
                            {/* Parts */}
                            {selectedParts.map(p => (
                                <tr key={p.id}>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>{p.quantity}</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>
                                        {p.name}
                                        <span style={{ display: 'block', fontSize: '10px', color: '#888', fontFamily: 'monospace' }}>{p.sku || 'NO PN'}</span>
                                    </td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right' }}>{formatCurrency(p.price)}</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(p.price * p.quantity)}</td>
                                </tr>
                            ))}
                            {/* Services */}
                            {selectedServices.map(s => (
                                <tr key={s.id}>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>1</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>
                                        {s.name}
                                        <span style={{ display: 'block', fontSize: '10px', color: '#888' }}>Service / Labor</span>
                                    </td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right' }}>{formatCurrency(s.price)}</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(s.price)}</td>
                                </tr>
                            ))}
                            {/* Empty rows to fill space */}
                            {(selectedParts.length + selectedServices.length) < 8 && Array.from({ length: 8 - selectedParts.length - selectedServices.length }).map((_, i) => (
                                <tr key={`empty-${i}`}>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>&nbsp;</td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}></td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}></td>
                                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Totals - Right Aligned */}
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

                    {/* Footer */}
                    <div style={{ textAlign: 'center', marginTop: '28px', paddingTop: '12px', borderTop: '1px solid #ccc' }}>
                        <p style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>This is a quotation only. Actual costs may vary upon service.</p>
                        <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>Validity: 30 Days from issue date</p>
                    </div>
                </div>
                <div className="mt-4 flex gap-3">
                    <Button variant="secondary" fullWidth onClick={() => setShowPreview(false)}>
                        Close
                    </Button>
                    <Button variant="primary" fullWidth leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
                        Print
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default QuoteBuilder;

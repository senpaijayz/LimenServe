import { useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { X, Wrench, User, Phone, Car, FileText, Save, CheckCircle, ArrowRight, Archive, CreditCard, Package, CalendarDays, UserCheck } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { formatCurrency, formatRelativeTime } from '../../../utils/formatters';
import { StatusBadge } from '../../../components/ui/Badge';

/**
 * CreateServiceOrderModal
 * Modal for creating a new service order
 */
export const CreateServiceOrderModal = ({ isOpen, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        customerName: '',
        customerPhone: '',
        vehicleMake: 'Mitsubishi',
        vehicleModel: '',
        vehicleYear: '',
        vehiclePlate: '',
        description: '',
        estimatedCost: '',
        priority: 'normal',
    });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [submitError, setSubmitError] = useState('');

    const validate = () => {
        const newErrors = {};
        if (!formData.customerName.trim()) newErrors.customerName = 'Customer name is required';
        if (!formData.vehicleModel.trim()) newErrors.vehicleModel = 'Vehicle model is required';
        if (!formData.vehiclePlate.trim()) newErrors.vehiclePlate = 'Plate number is required';
        if (!formData.description.trim()) newErrors.description = 'Service description is required';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setSaving(true);
        setSubmitError('');

        try {
            await onSave?.({
                customerName: formData.customerName,
                customerPhone: formData.customerPhone,
                vehicleMake: formData.vehicleMake,
                vehicleModel: formData.vehicleModel,
                vehicleYear: parseInt(formData.vehicleYear, 10) || null,
                vehiclePlate: formData.vehiclePlate,
                description: formData.description,
                estimatedCost: parseFloat(formData.estimatedCost) || 0,
                status: 'pending',
                priority: formData.priority,
            });
            onClose();
        } catch (error) {
            setSubmitError(error.message || 'Failed to create service order.');
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <Motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <Motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white rounded-2xl border border-primary-200 shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary-100">
                                <Wrench className="w-5 h-5 text-primary-700" />
                            </div>
                            <h2 className="text-xl font-display font-bold text-primary-950">New Service Order</h2>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-primary-50 transition-colors">
                            <X className="w-5 h-5 text-primary-400" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Customer Info Section */}
                        <div>
                            <p className="text-sm font-semibold text-primary-300 mb-3 flex items-center gap-2">
                                <User className="w-4 h-4 text-accent-primary" /> Customer Information
                            </p>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Input
                                    label="Customer Name *"
                                    placeholder="Full name"
                                    value={formData.customerName}
                                    onChange={e => updateField('customerName', e.target.value)}
                                    error={errors.customerName}
                                />
                                <Input
                                    label="Phone Number"
                                    placeholder="09XX XXX XXXX"
                                    value={formData.customerPhone}
                                    onChange={e => updateField('customerPhone', e.target.value)}
                                    leftIcon={<Phone className="w-4 h-4" />}
                                />
                            </div>
                        </div>

                        {submitError && (
                            <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                                {submitError}
                            </div>
                        )}

                        {/* Vehicle Info Section */}
                        <div>
                            <p className="text-sm font-semibold text-primary-300 mb-3 flex items-center gap-2">
                                <Car className="w-4 h-4 text-accent-primary" /> Vehicle Information
                            </p>
                            <div className="grid grid-cols-1 gap-4 mb-3 sm:grid-cols-2">
                                <div>
                                    <label className="input-label mb-1 block">Make</label>
                                    <select value={formData.vehicleMake} onChange={e => updateField('vehicleMake', e.target.value)} className="input">
                                        <option value="Mitsubishi">Mitsubishi</option>
                                        <option value="Toyota">Toyota</option>
                                        <option value="Honda">Honda</option>
                                        <option value="Nissan">Nissan</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <Input
                                    label="Model *"
                                    placeholder="e.g. Montero Sport"
                                    value={formData.vehicleModel}
                                    onChange={e => updateField('vehicleModel', e.target.value)}
                                    error={errors.vehicleModel}
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Input
                                    label="Year"
                                    type="number"
                                    placeholder={String(new Date().getFullYear())}
                                    value={formData.vehicleYear}
                                    onChange={e => updateField('vehicleYear', e.target.value)}
                                />
                                <Input
                                    label="Plate Number *"
                                    placeholder="ABC 1234"
                                    value={formData.vehiclePlate}
                                    onChange={e => updateField('vehiclePlate', e.target.value)}
                                    error={errors.vehiclePlate}
                                />
                            </div>
                        </div>

                        {/* Service Details */}
                        <div>
                            <p className="text-sm font-semibold text-primary-300 mb-3 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-accent-primary" /> Service Details
                            </p>
                            <div>
                                <label className="input-label mb-1 block">Description of Service *</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => updateField('description', e.target.value)}
                                    placeholder="Describe the service needed..."
                                    rows={3}
                                    className="input resize-none"
                                />
                                {errors.description && <p className="text-xs text-accent-danger mt-1">{errors.description}</p>}
                            </div>
                            <div className="grid grid-cols-1 gap-4 mt-3 sm:grid-cols-2">
                                <Input
                                    label="Estimated Cost (₱)"
                                    type="number"
                                    placeholder="0.00"
                                    value={formData.estimatedCost}
                                    onChange={e => updateField('estimatedCost', e.target.value)}
                                    min="0"
                                    step="0.01"
                                />
                                <div>
                                    <label className="input-label mb-1 block">Priority</label>
                                    <select value={formData.priority} onChange={e => updateField('priority', e.target.value)} className="input">
                                        <option value="low">Low</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                        <option value="urgent">Urgent</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4 border-t border-primary-700">
                            <Button variant="secondary" fullWidth onClick={onClose} type="button">Cancel</Button>
                            <Button variant="primary" fullWidth type="submit" isLoading={saving} leftIcon={<Save className="w-4 h-4" />}>
                                Create Order
                            </Button>
                        </div>
                    </form>
                </Motion.div>
            </Motion.div>
        </AnimatePresence>
    );
};

/**
 * ServiceOrderDetailModal
 * Modal for viewing a service order's details and updating its status
 */
export const ServiceOrderDetailModal = ({ isOpen, onClose, order, onStatusUpdate, onComplete }) => {
    const [updating, setUpdating] = useState(false);
    const [completing, setCompleting] = useState(false);

    if (!isOpen || !order) return null;

    const statusFlow = ['pending', 'in_progress', 'completed'];
    const currentIndex = statusFlow.indexOf(order.status);
    const nextStatus = currentIndex < statusFlow.length - 1 ? statusFlow[currentIndex + 1] : null;
    const items = Array.isArray(order.items) ? order.items : Array.isArray(order.lineItems) ? order.lineItems : [];
    const serviceItems = items.filter((item) => (item.lineType ?? item.line_type) === 'service' || item.serviceId || item.service_id);
    const partItems = items.filter((item) => !serviceItems.includes(item));
    const orderTotal = Number(order.totalAmount ?? order.total_amount ?? order.estimatedCost ?? order.estimated_cost ?? 0);
    const completedAt = order.completedAt ?? order.completed_at ?? null;
    const mechanicName = order.mechanicName ?? order.assignedMechanicName ?? order.assigned_to_name ?? order.assignedToName ?? '';

    const statusLabels = {
        pending: 'Pending',
        in_progress: 'In Progress',
        completed: 'Completed',
    };

    const handleStatusUpdate = async (newStatus) => {
        setUpdating(true);
        try {
            await onStatusUpdate?.(order.id, newStatus);
        } finally {
            setUpdating(false);
        }
    };

    const handleComplete = async () => {
        setCompleting(true);
        try {
            await onComplete?.(order.id);
        } finally {
            setCompleting(false);
        }
    };

    const renderItemRow = (item, index) => {
        const name = item.itemName ?? item.item_name ?? item.displayName ?? item.display_name ?? item.name ?? `Line ${index + 1}`;
        const code = item.itemSku ?? item.item_sku ?? item.sku ?? item.code ?? '';
        const quantity = Number(item.quantity ?? 1);
        const unitPrice = Number(item.unitPrice ?? item.unit_price ?? item.price ?? 0);
        const lineTotal = Number(item.lineTotal ?? item.line_total ?? (quantity * unitPrice));

        return (
            <div key={item.id ?? `${name}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border border-primary-100 bg-white px-3 py-2.5">
                <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-semibold text-primary-950">{name}</p>
                    <p className="text-xs text-primary-500">
                        {code || 'No code'} · Qty {quantity} · {formatCurrency(unitPrice)}
                    </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-accent-blue">{formatCurrency(lineTotal)}</p>
            </div>
        );
    };

    return (
        <AnimatePresence>
            <Motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4"
                onClick={onClose}
            >
                <Motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="w-full max-w-4xl overflow-hidden rounded-2xl border border-primary-200 bg-white shadow-xl"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-4 border-b border-primary-100 bg-primary-50 px-5 py-4 sm:px-6">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary-500">{order.orderNumber || order.id}</p>
                                <StatusBadge status={order.status} />
                            </div>
                            <h2 className="mt-2 text-xl font-display font-bold text-primary-950 sm:text-2xl">Customer Service Order</h2>
                            <p className="mt-1 text-sm text-primary-500">Review customer, vehicle, services, parts, and completion record.</p>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white transition-colors">
                            <X className="w-5 h-5 text-primary-400" />
                        </button>
                    </div>

                    <div className="max-h-[78vh] overflow-y-auto p-5 sm:p-6">
                        <div className="mb-5 grid gap-3 rounded-2xl border border-primary-100 bg-white p-3 sm:grid-cols-3">
                            {statusFlow.map((status, i) => (
                                <div key={status} className={`rounded-xl border px-3 py-3 ${currentIndex >= i ? 'border-accent-primary/25 bg-accent-primary/5' : 'border-primary-100 bg-primary-50'}`}>
                                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${currentIndex >= i ? 'bg-accent-primary text-white' : 'bg-white text-primary-400'}`}>
                                        {currentIndex > i ? <CheckCircle className="w-4 h-4" /> : i + 1}
                                    </div>
                                    <p className={`mt-2 text-sm font-semibold ${currentIndex >= i ? 'text-primary-950' : 'text-primary-500'}`}>{statusLabels[status]}</p>
                                    <p className="mt-1 text-xs text-primary-500">
                                        {status === 'completed' ? 'Archived and posted to Sales' : status === 'in_progress' ? 'Workshop handling' : 'Awaiting review'}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <User className="h-4 w-4" /> Customer
                                        </div>
                                        <p className="text-base font-semibold text-primary-950">{order.customerName || 'Walk-in customer'}</p>
                                        {order.customerPhone && <p className="mt-1 text-sm text-primary-600">{order.customerPhone}</p>}
                                    </div>
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <Car className="h-4 w-4" /> Vehicle
                                        </div>
                                        <p className="text-base font-semibold text-primary-950">
                                            {[order.vehicle?.year, order.vehicle?.make, order.vehicle?.model].filter(Boolean).join(' ') || 'Vehicle not recorded'}
                                        </p>
                                        <p className="mt-1 text-sm text-primary-600">{order.vehicle?.plate || 'No plate recorded'}</p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-primary-100 bg-white p-4">
                                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                        <FileText className="h-4 w-4" /> Job notes
                                    </div>
                                    <p className="text-sm leading-6 text-primary-700">{order.description || order.note || 'No service notes recorded.'}</p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-2xl border border-primary-100 bg-white p-4">
                                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <Wrench className="h-4 w-4" /> Services
                                        </div>
                                        <div className="space-y-2">
                                            {serviceItems.length > 0 ? serviceItems.map(renderItemRow) : (
                                                <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50 px-3 py-4 text-sm text-primary-500">
                                                    No itemized services recorded. The job note is used as the sales service line.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-primary-100 bg-white p-4">
                                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <Package className="h-4 w-4" /> Parts used
                                        </div>
                                        <div className="space-y-2">
                                            {partItems.length > 0 ? partItems.map(renderItemRow) : (
                                                <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50 px-3 py-4 text-sm text-primary-500">
                                                    No parts were attached to this service order.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <aside className="space-y-4">
                                <div className="rounded-2xl border border-primary-100 bg-primary-950 p-5 text-white">
                                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Final amount</p>
                                    <p className="mt-2 text-3xl font-display font-bold">{formatCurrency(orderTotal)}</p>
                                    <p className="mt-2 text-sm text-white/60">Posted to Sales when marked complete.</p>
                                </div>

                                <div className="grid gap-3">
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <UserCheck className="h-4 w-4" /> Mechanic
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-primary-950">{mechanicName || 'Not assigned'}</p>
                                    </div>
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <CalendarDays className="h-4 w-4" /> Dates
                                        </div>
                                        <p className="mt-2 text-sm text-primary-700">Created {formatRelativeTime(order.createdAt)}</p>
                                        {completedAt && <p className="mt-1 text-sm text-primary-700">Completed {formatRelativeTime(completedAt)}</p>}
                                    </div>
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                                            <CreditCard className="h-4 w-4" /> Payment
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-primary-950">{order.paymentStatus || order.payment_status || (order.status === 'completed' ? 'Paid / posted' : 'Pending completion')}</p>
                                    </div>
                                </div>
                            </aside>
                        </div>

                        <div className="mt-5 flex flex-col gap-3 border-t border-primary-100 pt-4 sm:flex-row sm:justify-end">
                            <Button variant="secondary" onClick={onClose}>Close</Button>
                            {nextStatus === 'in_progress' && (
                                <Button
                                    variant="primary"
                                    isLoading={updating}
                                    leftIcon={<ArrowRight className="w-4 h-4" />}
                                    onClick={() => handleStatusUpdate(nextStatus)}
                                >
                                    Start Work
                                </Button>
                            )}
                            {order.status !== 'completed' && (
                                <Button
                                    variant="success"
                                    isLoading={completing}
                                    leftIcon={<Archive className="w-4 h-4" />}
                                    onClick={handleComplete}
                                >
                                    Finish, Archive, and Add to Sales
                                </Button>
                            )}
                            {order.status === 'completed' && (
                                <div className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-accent-success/20 bg-accent-success/10 px-4 text-accent-success">
                                    <CheckCircle className="w-5 h-5" />
                                    <span className="text-sm font-medium">Archived in completed service history</span>
                                </div>
                            )}
                        </div>
                    </div>
                </Motion.div>
            </Motion.div>
        </AnimatePresence>
    );
};

import { useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { X, Wrench, User, Phone, Car, FileText, Save, Clock, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
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
export const ServiceOrderDetailModal = ({ isOpen, onClose, order, onStatusUpdate }) => {
    const [updating, setUpdating] = useState(false);

    if (!isOpen || !order) return null;

    const statusFlow = ['pending', 'in_progress', 'completed'];
    const currentIndex = statusFlow.indexOf(order.status);
    const nextStatus = currentIndex < statusFlow.length - 1 ? statusFlow[currentIndex + 1] : null;

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
                    className="bg-white rounded-2xl border border-primary-200 shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="font-mono text-sm text-primary-500">{order.orderNumber || order.id}</p>
                            <h2 className="text-xl font-display font-bold text-primary-950">Service Order Details</h2>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-primary-50 transition-colors">
                            <X className="w-5 h-5 text-primary-400" />
                        </button>
                    </div>

                    {/* Status Progress */}
                    <div className="flex items-center gap-2 mb-6 p-3 bg-primary-50 rounded-xl">
                        {statusFlow.map((status, i) => (
                            <div key={status} className="flex items-center gap-2 flex-1">
                                <div className={`flex items-center gap-2 ${currentIndex >= i ? 'text-accent-primary' : 'text-primary-600'}`}>
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentIndex >= i ? 'bg-accent-primary text-white' : 'bg-primary-700 text-primary-500'}`}>
                                        {currentIndex > i ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                                    </div>
                                    <span className="text-xs hidden sm:inline">{statusLabels[status]}</span>
                                </div>
                                {i < statusFlow.length - 1 && (
                                    <div className={`flex-1 h-0.5 rounded ${currentIndex > i ? 'bg-accent-primary' : 'bg-primary-700'}`} />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Customer & Vehicle Info */}
                    <div className="grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2">
                        <div className="p-3 bg-primary-50 border border-primary-100 rounded-lg">
                            <p className="text-xs text-primary-500 mb-1">Customer</p>
                            <p className="text-sm font-semibold text-primary-950">{order.customerName}</p>
                            {order.customerPhone && <p className="text-xs text-primary-600">{order.customerPhone}</p>}
                        </div>
                        <div className="p-3 bg-primary-50 border border-primary-100 rounded-lg">
                            <p className="text-xs text-primary-500 mb-1">Vehicle</p>
                            <p className="text-sm font-semibold text-primary-950">
                                {[order.vehicle?.year, order.vehicle?.make, order.vehicle?.model].filter(Boolean).join(' ') || 'Vehicle not recorded'}
                            </p>
                            <p className="text-xs text-primary-600">{order.vehicle?.plate || 'N/A'}</p>
                        </div>
                    </div>

                    {/* Service Details */}
                    <div className="p-3 bg-primary-50 border border-primary-100 rounded-lg mb-4">
                        <p className="text-xs text-primary-500 mb-1">Service Description</p>
                        <p className="text-sm text-primary-800">{order.description}</p>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-3">
                        <div className="p-3 bg-primary-50 border border-primary-100 rounded-lg text-center">
                            <p className="text-xs text-primary-500 mb-1">Status</p>
                            <StatusBadge status={order.status} />
                        </div>
                        <div className="p-3 bg-primary-50 border border-primary-100 rounded-lg text-center">
                            <p className="text-xs text-primary-500 mb-1">Estimated Cost</p>
                            <p className="text-lg font-bold text-accent-blue">{formatCurrency(order.estimatedCost)}</p>
                        </div>
                        <div className="p-3 bg-primary-50 border border-primary-100 rounded-lg text-center">
                            <p className="text-xs text-primary-500 mb-1">Created</p>
                            <p className="text-sm text-primary-600">{formatRelativeTime(order.createdAt)}</p>
                        </div>
                    </div>

                    {/* Status Actions */}
                    <div className="flex flex-col gap-3 pt-4 border-t border-primary-200 sm:flex-row">
                        <Button variant="secondary" fullWidth onClick={onClose}>Close</Button>
                        {nextStatus && (
                            <Button
                                variant="primary"
                                fullWidth
                                isLoading={updating}
                                leftIcon={nextStatus === 'completed' ? <CheckCircle className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                                onClick={() => handleStatusUpdate(nextStatus)}
                            >
                                {nextStatus === 'in_progress' ? 'Start Work' : 'Mark Complete'}
                            </Button>
                        )}
                        {order.status === 'completed' && (
                            <div className="flex-1 flex items-center justify-center gap-2 text-accent-success">
                                <CheckCircle className="w-5 h-5" />
                                <span className="text-sm font-medium">Order Completed</span>
                            </div>
                        )}
                    </div>
                </Motion.div>
            </Motion.div>
        </AnimatePresence>
    );
};

import { useState } from 'react';
import { Wrench } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';

/**
 * Add Service Modal Component
 * Starts workshop intake for labor and any parts already in the POS cart.
 */
const AddServiceModal = ({ isOpen, onClose, onAddService, busy = false, problem = '', partCount = 0 }) => {
    const [serviceName, setServiceName] = useState('');
    const [servicePrice, setServicePrice] = useState('');
    const [error, setError] = useState('');

    const handleClose = () => {
        if (busy) return;
        setServiceName('');
        setServicePrice('');
        setError('');
        onClose();
    };

    const handleSave = async () => {
        const price = Number(servicePrice);
        if (!serviceName.trim()) {
            setError('Please enter a service name.');
            return;
        }
        if (!Number.isFinite(price) || price < 0.01) {
            setError('Please enter a valid price greater than 0.');
            return;
        }
        if (price > 100000000) {
            setError('Enter a service estimate of ₱100,000,000 or less.');
            return;
        }

        // Service estimates are not catalogue products or sale lines.
        const serviceItem = {
            id: `SRV-${crypto.randomUUID()}`,
            sku: 'SERVICE',
            name: serviceName.trim(),
            category: 'Service',
            lineType: 'service',
            productId: null,
            serviceId: null,
            price: Math.round((price + Number.EPSILON) * 100) / 100,
            quantity: 1,
        };

        if (await onAddService(serviceItem) === false) return;
        handleClose();
    };

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Add Service / Labor"
            size="sm"
        >
            <div className="space-y-4">
                <p className="text-sm text-primary-500">
                    This creates one service order for the labor{partCount ? ' and all parts currently in the cart' : ''}. No sale, payment, or stock release happens now.
                </p>

                <Input
                    label="Service Name"
                    placeholder="e.g., Change Oil Labor, Installation"
                    value={serviceName}
                    maxLength={250}
                    disabled={busy}
                    onChange={(e) => { setServiceName(e.target.value); setError(''); }}
                    error={error && !serviceName.trim() ? error : ''}
                    autoFocus
                />

                <Input
                    label="Price (₱)"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={servicePrice}
                    disabled={busy}
                    onChange={(e) => { setServicePrice(e.target.value); setError(''); }}
                    error={error && serviceName.trim() ? error : ''}
                />

                {problem && <p role="alert" className="text-sm font-medium text-red-700">{problem}</p>}
                <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-primary-100">
                    <Button variant="secondary" onClick={handleClose} isDisabled={busy}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleSave} isLoading={busy} leftIcon={<Wrench className="w-4 h-4" />}>
                        Create service order
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default AddServiceModal;

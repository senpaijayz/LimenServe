import { useState } from 'react';
import { Wrench } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';

/**
 * Add Service Modal Component
 * Allows adding custom service/labor items to the POS Cart.
 */
const AddServiceModal = ({ isOpen, onClose, onAddService, onAddToServiceOrder }) => {
    const [serviceName, setServiceName] = useState('');
    const [servicePrice, setServicePrice] = useState('');
    const [error, setError] = useState('');

    const handleClose = () => {
        setServiceName('');
        setServicePrice('');
        setError('');
        onClose();
    };

    const handleSave = (destination) => {
        const price = Number(servicePrice);
        if (!serviceName.trim()) {
            setError('Please enter a service name.');
            return;
        }
        if (!Number.isFinite(price) || price < 0.01) {
            setError('Please enter a valid price greater than 0.');
            return;
        }
        if (destination === onAddToServiceOrder && price > 100000000) {
            setError('Enter a service estimate of ₱100,000,000 or less.');
            return;
        }

        // Create a custom product object for the cart
        const serviceItem = {
            id: `SRV-${crypto.randomUUID()}`,
            sku: 'SERVICE',
            name: serviceName.trim(),
            category: 'Service',
            lineType: 'service',
            productId: null,
            serviceId: null,
            price: Math.round((price + Number.EPSILON) * 100) / 100,
            quantity: 999,
            maxQuantity: 999,
        };

        if (destination(serviceItem) === false) return;
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
                    Add a labor charge to this sale, or send it to Service Order intake as an estimate.
                </p>

                <Input
                    label="Service Name"
                    placeholder="e.g., Change Oil Labor, Installation"
                    value={serviceName}
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
                    onChange={(e) => { setServicePrice(e.target.value); setError(''); }}
                    error={error && serviceName.trim() ? error : ''}
                />

                <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-primary-100">
                    <Button variant="secondary" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button variant="secondary" onClick={() => handleSave(onAddService)}>
                        Add to sale
                    </Button>
                    <Button variant="primary" onClick={() => handleSave(onAddToServiceOrder)} leftIcon={<Wrench className="w-4 h-4" />}>
                        Add to service order
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default AddServiceModal;

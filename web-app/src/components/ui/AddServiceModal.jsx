import { useState } from 'react';
import { Wrench } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';

/**
 * Add Service Modal Component
 * Allows adding custom service/labor items to the POS Cart.
 */
const AddServiceModal = ({ isOpen, onClose, onAddService }) => {
    const [serviceName, setServiceName] = useState('');
    const [servicePrice, setServicePrice] = useState('');
    const [error, setError] = useState('');

    const handleClose = () => {
        setServiceName('');
        setServicePrice('');
        setError('');
        onClose();
    };

    const handleSave = () => {
        const price = parseFloat(servicePrice);
        if (!serviceName.trim()) {
            setError('Please enter a service name.');
            return;
        }
        if (isNaN(price) || price <= 0) {
            setError('Please enter a valid price greater than 0.');
            return;
        }

        // Create a custom product object for the cart
        const serviceItem = {
            id: `SRV-${Date.now()}`,
            sku: 'SERVICE',
            name: serviceName.trim(),
            category: 'Service',
            lineType: 'service',
            productId: null,
            serviceId: null,
            price: price,
            quantity: 999,
            maxQuantity: 999,
        };

        onAddService(serviceItem);
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
                    Add custom service, labor, or installation fees to the current transaction.
                </p>

                <Input
                    label="Service Name"
                    placeholder="e.g., Change Oil Labor, Installation"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    error={error && !serviceName.trim() ? error : ''}
                    autoFocus
                />

                <Input
                    label="Price (₱)"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="0.00"
                    value={servicePrice}
                    onChange={(e) => setServicePrice(e.target.value)}
                    error={error && (!servicePrice || parseFloat(servicePrice) <= 0) ? error : ''}
                />

                <div className="flex justify-end gap-3 pt-4 border-t border-primary-100">
                    <Button variant="secondary" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        leftIcon={<Wrench className="w-4 h-4" />}
                    >
                        Add Service
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default AddServiceModal;

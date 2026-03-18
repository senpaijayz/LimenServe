import { useState, useEffect } from 'react';
import { Camera, Search, Plus, Package } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import useDataStore from '../../../store/useDataStore';

/**
 * Add Stock Modal
 * Replaces the "Add Product" functionality. Staff must scan or enter an existing SKU to add stock.
 */
const AddStockModal = ({ isOpen, onClose, onSave }) => {
    const { findProduct } = useDataStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [showCameraScanner, setShowCameraScanner] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [quantityToAdd, setQuantityToAdd] = useState('');
    const [error, setError] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            setSelectedProduct(null);
            setQuantityToAdd('');
            setError('');
            setIsSearching(false);
        }
    }, [isOpen]);

    useEffect(() => {
        const identifier = searchQuery.trim();
        if (!identifier) {
            setSelectedProduct(null);
            setError('');
            setIsSearching(false);
            return;
        }

        let active = true;
        setIsSearching(true);

        void (async () => {
            const found = await findProduct(identifier);
            if (!active) {
                return;
            }

            if (found) {
                setSelectedProduct(found);
                setError('');
            } else {
                setSelectedProduct(null);
                setError('Part Number (SKU) not found in Master Catalog.');
            }

            setIsSearching(false);
        })();

        return () => {
            active = false;
        };
    }, [findProduct, searchQuery]);

    const handleCameraScan = (barcode) => {
        if (barcode) {
            setSearchQuery(barcode);
        }
    };

    const handleSave = () => {
        const qty = parseInt(quantityToAdd, 10);
        if (!selectedProduct) {
            setError('Please scan a valid Part Number first.');
            return;
        }
        if (isNaN(qty) || qty <= 0) {
            setError('Please enter a valid quantity greater than 0.');
            return;
        }

        const updatedProduct = {
            ...selectedProduct,
            quantity: selectedProduct.quantity + qty,
        };

        onSave(updatedProduct);
    };

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Receiving & Add Stock"
            size="md"
        >
            <div className="space-y-6">
                <p className="text-sm text-primary-500">
                    Scan a Mitsubishi Genuine Parts label or enter the Part Number (SKU) to receive new stock into inventory.
                </p>

                <div>
                    <label className="block text-sm font-semibold text-primary-700 mb-1">
                        Scan or enter Part Number (SKU)
                    </label>
                    <div className="relative flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                            <input
                                type="text"
                                placeholder="Scan barcode or type SKU..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={`w-full pl-10 pr-4 py-2.5 bg-white border rounded-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:ring-1 shadow-sm transition-all ${error ? 'border-accent-danger focus:border-accent-danger focus:ring-accent-danger' :
                                        selectedProduct ? 'border-accent-success focus:border-accent-success focus:ring-accent-success' :
                                            'border-primary-200 focus:border-accent-blue focus:ring-accent-blue'
                                    }`}
                                autoFocus
                            />
                        </div>
                        <Button
                            variant="secondary"
                            onClick={() => setShowCameraScanner(true)}
                            title="Scan with Camera"
                            type="button"
                        >
                            <Camera className="w-5 h-5 text-primary-600" />
                        </Button>
                    </div>
                    {isSearching ? (
                        <p className="text-xs text-primary-500 mt-1.5">Searching catalog...</p>
                    ) : error ? (
                        <p className="text-xs text-accent-danger mt-1.5">{error}</p>
                    ) : null}
                </div>

                {selectedProduct && (
                    <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 flex flex-col gap-3">
                        <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-lg bg-white border border-primary-200 flex items-center justify-center shrink-0">
                                <Package className="w-6 h-6 text-primary-400" />
                            </div>
                            <div>
                                <h4 className="font-bold text-primary-950">{selectedProduct.name}</h4>
                                <p className="text-sm font-mono text-primary-500">{selectedProduct.sku}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-primary-200">
                            <div>
                                <span className="text-xs text-primary-500 font-semibold uppercase block mb-0.5">Category</span>
                                <span className="text-sm font-medium text-primary-900">{selectedProduct.category}</span>
                            </div>
                            <div>
                                <span className="text-xs text-primary-500 font-semibold uppercase block mb-0.5">Current Stock</span>
                                <span className="text-sm font-bold text-primary-900">{selectedProduct.quantity} units</span>
                            </div>
                        </div>
                    </div>
                )}

                <div>
                    <Input
                        label="Quantity to Add"
                        type="number"
                        min="1"
                        placeholder="Enter amount received"
                        value={quantityToAdd}
                        onChange={(e) => setQuantityToAdd(e.target.value)}
                        disabled={!selectedProduct}
                        className={!selectedProduct ? 'opacity-50 cursor-not-allowed' : ''}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-primary-100">
                    <Button variant="secondary" onClick={onClose} type="button">
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        disabled={!selectedProduct || !quantityToAdd || quantityToAdd <= 0}
                        leftIcon={<Plus className="w-4 h-4" />}
                        type="button"
                    >
                        Add to Inventory
                    </Button>
                </div>
            </div>

            <CameraScannerModal
                isOpen={showCameraScanner}
                onClose={() => setShowCameraScanner(false)}
                onScan={handleCameraScan}
            />
        </Modal>
    );
};

export default AddStockModal;

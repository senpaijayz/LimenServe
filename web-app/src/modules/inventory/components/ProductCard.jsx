import { motion as Motion } from 'framer-motion';
import { useState } from 'react';
import { Box, MapPin, Edit2, Trash2, ScanLine } from 'lucide-react';
import { StockBadge } from '../../../components/ui/Badge';
import { formatCurrency } from '../../../utils/formatters';
import { getProductPartNumber } from '../../../utils/barcode';
import LargeBarcodeModal from '../../../components/ui/LargeBarcodeModal';
import MitsubishiGenuinePartsLabel from './MitsubishiGenuinePartsLabel';

function formatLocation(location = {}) {
    if (location?.label) {
        return location.label;
    }

    const aisle = location?.aisle ? String(location.aisle).replace(/^aisle\s+/i, '').toUpperCase() : '';
    const shelfNumber = location?.shelfNumber ?? location?.shelf_number ?? location?.shelf;
    const bin = location?.bin || location?.slot;
    const parts = aisle || shelfNumber || bin
        ? [
            aisle ? `Aisle ${aisle}` : null,
            shelfNumber ? `Shelf ${shelfNumber}` : null,
            bin ? `Bin ${bin}` : null,
        ].filter(Boolean)
        : [
            location?.floor ? `Floor ${location.floor}` : null,
            location?.section ? `Section ${location.section}` : null,
            location?.shelf ? `Shelf ${location.shelf}` : null,
        ].filter(Boolean);

    return parts.length > 0 ? parts.join(' • ') : 'Unassigned';
}

const ProductCard = ({ product, onEdit, onDelete, onLocate, onSelect }) => {
    const [showLargeBarcode, setShowLargeBarcode] = useState(false);

    const handleLocateClick = (event) => {
        event.stopPropagation();
        onLocate?.(product);
    };

    const openLargeBarcode = (event) => {
        event.stopPropagation();
        setShowLargeBarcode(true);
    };

    return (
        <>
            <Motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -4 }}
                onClick={() => onSelect?.(product)}
                className="bg-white border border-primary-200 rounded-xl p-4 shadow-sm group cursor-pointer transition-all duration-300 hover:border-accent-blue hover:shadow-md"
            >
                <div className="mb-4 relative overflow-hidden rounded-2xl border border-primary-200 bg-[#0b1320] p-3">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(216,23,36,0.18),transparent_34%)] pointer-events-none" />
                    <div className="relative flex min-h-[150px] items-center justify-center">
                        {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="max-h-[150px] w-full object-contain" />
                        ) : (
                            <MitsubishiGenuinePartsLabel product={product} size="compact" />
                        )}
                    </div>
                    {(onEdit || onDelete) && (
                        <div className="absolute inset-0 bg-white/92 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                            {onEdit && (
                                <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); onEdit(product); }}
                                    className="p-2 rounded-lg bg-accent-info/20 text-accent-info hover:bg-accent-info/30 transition-colors"
                                    aria-label={`Edit ${product.name}`}
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); onDelete(product); }}
                                    className="p-2 rounded-lg bg-accent-danger/20 text-accent-danger hover:bg-accent-danger/30 transition-colors"
                                    aria-label={`Delete ${product.name}`}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    <div>
                        <h3 className="font-semibold text-primary-950 line-clamp-2 mb-1">
                            {product.name}
                        </h3>
                        <p className="text-xs font-mono text-primary-500">{getProductPartNumber(product)}</p>
                    </div>

                    <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold font-display text-accent-blue">
                            {formatCurrency(product.price)}
                        </span>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-primary-100">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-primary-500 uppercase tracking-widest">Qty:</span>
                            <span className="font-bold text-primary-950">{product.quantity}</span>
                            <StockBadge quantity={product.quantity} />
                        </div>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-semibold text-primary-500">
                        <MapPin className="w-3 h-3" />
                        <span>{formatLocation(product.location)}</span>
                    </div>

                    <button
                        type="button"
                        aria-label={`Show large barcode for ${product.name}`}
                        onClick={openLargeBarcode}
                        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-primary-200 bg-white px-3 text-xs font-black text-primary-600 transition hover:border-accent-blue/50 hover:text-accent-blue"
                    >
                        <ScanLine className="h-4 w-4" />
                        Large Barcode
                    </button>

                    {onLocate && (
                        <button
                            type="button"
                            aria-label={`Locate ${product.name} in 3D`}
                            onClick={handleLocateClick}
                            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 text-xs font-black text-accent-blue transition hover:border-accent-blue/50 hover:bg-accent-blue/15"
                        >
                            <Box className="h-4 w-4" />
                            Locate in 3D
                        </button>
                    )}
                </div>
            </Motion.div>

            <LargeBarcodeModal
                isOpen={showLargeBarcode}
                onClose={() => setShowLargeBarcode(false)}
                barcodeValue={getProductPartNumber(product)}
                productName={product.name}
                title="Product Barcode"
            />
        </>
    );
};

export default ProductCard;

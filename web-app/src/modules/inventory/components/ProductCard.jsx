import { motion } from 'framer-motion';
import { MapPin, Edit2, Trash2 } from 'lucide-react';
import { StockBadge } from '../../../components/ui/Badge';
import { formatCurrency } from '../../../utils/formatters';
import MitsubishiGenuinePartsLabel from './MitsubishiGenuinePartsLabel';

/**
 * Product Card Component
 * Displays product info in a card format for grid view
 */
function formatLocation(location = {}) {
    const parts = [
        location?.floor ? `Floor ${location.floor}` : null,
        location?.section ? `Section ${location.section}` : null,
        location?.shelf ? `Shelf ${location.shelf}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' • ') : 'Unassigned';
}

const ProductCard = ({ product, onEdit, onDelete, onSelect }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -4 }}
            onClick={() => onSelect?.(product)}
            className="bg-white border border-primary-200 rounded-xl p-4 shadow-sm group cursor-pointer transition-all duration-300 hover:border-accent-blue hover:shadow-md"
        >
            <div className="mb-4 relative overflow-hidden rounded-2xl border border-primary-200 bg-[#0b1320] p-3">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(216,23,36,0.18),transparent_34%)] pointer-events-none" />
                <div className="relative">
                    <MitsubishiGenuinePartsLabel product={product} size="compact" />
                </div>
                {(onEdit || onDelete) && (
                    <div className="absolute inset-0 bg-white/92 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                        {onEdit && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onEdit(product); }}
                                className="p-2 rounded-lg bg-accent-info/20 text-accent-info hover:bg-accent-info/30 transition-colors"
                            >
                                <Edit2 className="w-4 h-4" />
                            </button>
                        )}
                        {onDelete && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(product); }}
                                className="p-2 rounded-lg bg-accent-danger/20 text-accent-danger hover:bg-accent-danger/30 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="space-y-3">
                {/* Name and SKU */}
                <div>
                    <h3 className="font-semibold text-primary-950 line-clamp-2 mb-1">
                        {product.name}
                    </h3>
                    <p className="text-xs font-mono text-primary-500">{product.sku}</p>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold font-display text-accent-blue">
                        {formatCurrency(product.price)}
                    </span>
                </div>

                {/* Stock and Location */}
                <div className="flex items-center justify-between pt-3 border-t border-primary-100">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-primary-500 uppercase tracking-widest">Qty:</span>
                        <span className="font-bold text-primary-950">{product.quantity}</span>
                        <StockBadge quantity={product.quantity} />
                    </div>
                </div>

                {/* Location */}
                <div className="flex items-center gap-1 text-xs text-primary-500">
                    <MapPin className="w-3 h-3" />
                    <span>{formatLocation(product.location)}</span>
                </div>
            </div>
        </motion.div>
    );
};

export default ProductCard;

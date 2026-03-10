import { motion } from 'framer-motion';
import { MapPin, Edit2, Trash2 } from 'lucide-react';
import { StockBadge } from '../../../components/ui/Badge';
import { formatCurrency } from '../../../utils/formatters';
import Barcode from 'react-barcode';

/**
 * Product Card Component
 * Displays product info in a card format for grid view
 */
const ProductCard = ({ product, onEdit, onDelete }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -4 }}
            className="bg-white border border-primary-200 rounded-xl p-4 shadow-sm group cursor-pointer transition-all duration-300 hover:border-accent-blue hover:shadow-md"
        >
            {/* Mitsubishi Genuine Parts Style Label */}
            <div className="h-40 bg-white rounded-lg border-2 border-primary-200 mb-4 flex flex-col relative overflow-hidden group/label">

                {/* Header (Black Bar) */}
                <div className="h-8 bg-[#1a1a1a] flex items-center justify-between px-3 w-full shrink-0">
                    <div className="flex items-center gap-1.5">
                        {/* Simple CSS-based Logo (3 red diamonds) */}
                        <div className="relative w-4 h-4 flex items-center justify-center top-0.5">
                            <div className="absolute w-[6px] h-[6px] bg-[#e60000] rotate-45 -top-[2px]"></div>
                            <div className="absolute w-[6px] h-[6px] bg-[#e60000] rotate-45 -left-[4px] top-[2px]"></div>
                            <div className="absolute w-[6px] h-[6px] bg-[#e60000] rotate-45 -right-[4px] top-[2px]"></div>
                        </div>
                        <span className="text-[6px] font-bold text-white leading-tight uppercase tracking-widest hidden sm:block">
                            Mitsubishi<br />Motors
                        </span>
                    </div>
                    <span className="text-[8px] font-bold text-white tracking-[0.2em]">GENUINE PARTS</span>
                    <span className="text-[6px] font-bold text-white">R</span>
                </div>

                {/* Sub-header (Part Name & Qty) */}
                <div className="flex justify-between items-end px-3 pt-1.5 pb-0">
                    <span className="text-[10px] text-gray-700 font-bold uppercase tracking-wide truncate pr-2 w-3/4">
                        {product.name}
                    </span>
                    <span className="text-[10px] text-gray-700 font-bold uppercase">
                        QTY: <span className="text-sm font-semibold">1</span>
                    </span>
                </div>

                {/* Part Number (SKU) Big Text */}
                <div className="text-center w-full">
                    <span className="text-xl font-medium tracking-[0.1em] text-gray-800 font-sans">
                        {product.sku || 'UNKNOWN'}
                    </span>
                </div>

                {/* Barcode Area */}
                <div className="w-full flex-1 flex flex-col items-center justify-start mix-blend-multiply opacity-90 px-2 mt-0.5">
                    <Barcode
                        value={product.sku || 'UNKNOWN'}
                        format="CODE128"
                        width={1.2}
                        height={28}
                        fontSize={8}
                        margin={0}
                        displayValue={false}
                        background="transparent"
                        lineColor="#222"
                    />
                </div>

                {/* Footer details */}
                <div className="absolute bottom-1 w-full px-3 flex justify-between items-center opacity-60">
                    <span className="text-[6px] tracking-wider text-gray-600">UG</span>
                    <span className="text-[7px] tracking-widest text-[#d00] uppercase font-semibold">
                        MADE IN PHILIPPINES
                    </span>
                </div>

                {/* Quick Actions overlay */}
                <div className="absolute inset-0 bg-white/90 opacity-0 group-hover/label:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit?.(product); }}
                        className="p-2 rounded-lg bg-accent-info/20 text-accent-info hover:bg-accent-info/30 transition-colors"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete?.(product); }}
                        className="p-2 rounded-lg bg-accent-danger/20 text-accent-danger hover:bg-accent-danger/30 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
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
                    <span>
                        Floor {product.location.floor} - Section {product.location.section}, Shelf {product.location.shelf}
                    </span>
                </div>
            </div>
        </motion.div>
    );
};

export default ProductCard;

import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { StockBadge } from '../../../components/ui/Badge';
import useDataStore from '../../../store/useDataStore';

/**
 * Low Stock Alert Component
 * Displays items with critically low stock levels
 */
const LowStockAlert = () => {
    const { products: storeProducts } = useDataStore();

    // Get actual low-stock items from the pricelist data
    const lowStockItems = storeProducts
        .filter(p => p.quantity <= 5)
        .map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            quantity: p.quantity,
            threshold: 10,
        }));

    return (
        <Card
            title="Low Stock Alert"
            subtitle={`${lowStockItems.length} items need attention`}
            headerAction={
                <Link to="/inventory?filter=low-stock" className="text-accent-blue text-sm hover:underline">
                    View All
                </Link>
            }
            className="h-full"
        >
            <div className="space-y-3">
                {lowStockItems.slice(0, 5).map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-primary-50 border border-primary-100 hover:border-accent-blue hover:shadow-sm transition-all group"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-lg bg-red-50">
                                <AlertTriangle className="w-4 h-4 text-accent-danger" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-primary-950 truncate">
                                    {item.name}
                                </p>
                                <p className="text-xs text-primary-500 font-mono tracking-wider">{item.sku}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <p className="text-sm font-bold text-primary-950">{item.quantity}</p>
                                <p className="text-xs text-primary-500 uppercase tracking-widest">left</p>
                            </div>
                            <StockBadge quantity={item.quantity} />
                        </div>
                    </div>
                ))}
            </div>

            {lowStockItems.length > 5 && (
                <Link
                    to="/inventory?filter=low-stock"
                    className="mt-4 flex items-center justify-center gap-1 p-2 rounded-lg text-sm text-accent-blue font-medium hover:bg-primary-50 transition-colors"
                >
                    <span>View {lowStockItems.length - 5} more items</span>
                    <ChevronRight className="w-4 h-4" />
                </Link>
            )}
        </Card>
    );
};

export default LowStockAlert;

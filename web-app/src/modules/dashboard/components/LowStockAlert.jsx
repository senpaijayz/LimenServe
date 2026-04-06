import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../../../components/ui/Card';
import { StockBadge } from '../../../components/ui/Badge';
import useDataStore from '../../../store/useDataStore';

const LowStockAlert = () => {
    const { products: storeProducts } = useDataStore();

    const lowStockItems = storeProducts
        .filter((product) => Number(product.quantity ?? 0) <= 5)
        .map((product) => ({
            id: product.id,
            name: product.name,
            sku: product.sku,
            quantity: Number(product.quantity ?? 0),
        }));

    return (
        <Card
            title="Low stock watchlist"
            subtitle={`${lowStockItems.length} mapped items need attention`}
            headerAction={<Link to="/inventory?filter=low-stock" className="text-sm text-accent-info hover:text-white">Open queue</Link>}
            className="h-full"
        >
            <div className="space-y-3">
                {lowStockItems.slice(0, 5).map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4"
                    >
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent-warning/20 bg-accent-warning/10 text-accent-warning">
                                <AlertTriangle className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-primary-500">{item.sku}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-semibold text-white">{item.quantity}</p>
                            <div className="mt-2 flex justify-end">
                                <StockBadge quantity={item.quantity} />
                            </div>
                        </div>
                    </div>
                ))}

                {lowStockItems.length === 0 && (
                    <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center text-sm text-primary-400">
                        No critical stock alerts at the moment.
                    </div>
                )}
            </div>

            {lowStockItems.length > 5 && (
                <Link
                    to="/inventory?filter=low-stock"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent-info hover:text-white"
                >
                    View {lowStockItems.length - 5} more items
                    <ChevronRight className="h-4 w-4" />
                </Link>
            )}
        </Card>
    );
};

export default LowStockAlert;

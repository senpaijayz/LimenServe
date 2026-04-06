import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, FileText, Package, ShoppingCart, Wrench } from 'lucide-react';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import useDataStore from '../../store/useDataStore';
import useExperienceStore from '../../store/useExperienceStore';
import { listPosSales } from '../../services/posApi';
import { listEstimates } from '../../services/estimatesApi';

const mockServiceOrders = [
    {
        id: 'SVC-001',
        customerName: 'Juan Garcia',
        description: 'Oil change and brake inspection',
        status: 'in_progress',
        createdAt: new Date(Date.now() - (2 * 60 * 60000)).toISOString(),
    },
    {
        id: 'SVC-002',
        customerName: 'Maria Santos',
        description: 'Engine tune-up and air filter replacement',
        status: 'pending',
        createdAt: new Date(Date.now() - (4 * 60 * 60000)).toISOString(),
    },
];

const quickLinks = [
    { id: 'quick-estimate', label: 'New quote draft', route: '/quotation', icon: FileText },
    { id: 'quick-low-stock', label: 'Low stock items', route: '/inventory?filter=low-stock', icon: Package },
    { id: 'quick-service', label: 'Service queue', route: '/services', icon: Wrench },
];

const toneClassMap = {
    live: 'border-accent-info/20 bg-accent-info/10 text-accent-info',
    alert: 'border-accent-warning/20 bg-accent-warning/10 text-accent-warning',
    success: 'border-accent-success/20 bg-accent-success/10 text-accent-success',
    neutral: 'border-white/10 bg-white/[0.05] text-primary-300',
};

const ActivityRail = () => {
    const navigate = useNavigate();
    const { products, fetchProducts } = useDataStore();
    const { activityFeed, setActivityFeed } = useExperienceStore();
    const [sales, setSales] = useState([]);
    const [estimates, setEstimates] = useState([]);

    useEffect(() => {
        void fetchProducts();
    }, [fetchProducts]);

    useEffect(() => {
        let isMounted = true;

        const loadRailData = async () => {
            try {
                const [salesResponse, estimateResponse] = await Promise.all([
                    listPosSales({ limit: 4, page: 1 }),
                    listEstimates('', 4),
                ]);

                if (!isMounted) {
                    return;
                }

                setSales(salesResponse?.sales ?? []);
                setEstimates(estimateResponse ?? []);
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                setSales([]);
                setEstimates([]);
            }
        };

        void loadRailData();

        return () => {
            isMounted = false;
        };
    }, []);

    const compiledFeed = useMemo(() => {
        const lowStockItems = products
            .filter((product) => Number(product.quantity ?? 0) > 0 && Number(product.quantity ?? 0) <= 5)
            .slice(0, 2)
            .map((product) => ({
                id: `stock-${product.id}`,
                title: `${product.name} running low`,
                detail: `${product.sku} has ${product.quantity} units left in stock.`,
                tone: 'alert',
                route: '/inventory?filter=low-stock',
                tag: 'Inventory',
                timeLabel: 'Needs review',
                icon: AlertTriangle,
            }));

        const salesItems = sales.slice(0, 2).map((sale) => ({
            id: `sale-${sale.sale_id}`,
            title: sale.customer_name || 'Walk-in sale',
            detail: `${sale.item_count || 0} items processed for ${formatCurrency(Number(sale.total_amount ?? 0))}.`,
            tone: 'success',
            route: '/reports/sales',
            tag: 'Sale',
            timeLabel: formatRelativeTime(sale.created_at),
            icon: ShoppingCart,
        }));

        const estimateItems = estimates.slice(0, 2).map((estimate) => ({
            id: `estimate-${estimate.id}`,
            title: estimate.estimate_number || 'Draft quotation',
            detail: `${estimate.customer_name || 'Customer'} requested ${formatCurrency(Number(estimate.grand_total ?? 0))}.`,
            tone: 'live',
            route: '/quotation',
            tag: 'Quote',
            timeLabel: estimate.updated_at ? formatRelativeTime(estimate.updated_at) : 'Updated recently',
            icon: FileText,
        }));

        const serviceItems = mockServiceOrders.map((order) => ({
            id: order.id,
            title: `${order.customerName} service order`,
            detail: order.description,
            tone: order.status === 'in_progress' ? 'live' : 'neutral',
            route: '/services',
            tag: order.status === 'in_progress' ? 'Active bay' : 'Pending',
            timeLabel: formatRelativeTime(order.createdAt),
            icon: Wrench,
        }));

        return [...lowStockItems, ...salesItems, ...estimateItems, ...serviceItems].slice(0, 8);
    }, [products, sales, estimates]);

    useEffect(() => {
        setActivityFeed(compiledFeed);
    }, [compiledFeed, setActivityFeed]);

    return (
        <aside className="shell-panel sticky top-28 hidden h-fit overflow-hidden xl:block">
            <div className="border-b border-white/8 px-5 py-5">
                <div className="data-pill">Live operations</div>
                <h2 className="mt-4 text-lg font-semibold text-white">Signals across the floor</h2>
                <p className="mt-2 text-sm text-primary-400">
                    Stock pressure, sales flow, quotations, and active service cues in one place.
                </p>
            </div>

            <div className="space-y-3 px-4 py-4">
                {quickLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                        <button
                            key={link.id}
                            type="button"
                            onClick={() => navigate(link.route)}
                            className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left transition hover:border-accent-info/20 hover:bg-white/[0.06]"
                        >
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-accent-info">
                                    <Icon className="h-4 w-4" />
                                </span>
                                <span className="text-sm font-semibold text-white">{link.label}</span>
                            </div>
                            <ArrowRight className="h-4 w-4 text-primary-500" />
                        </button>
                    );
                })}
            </div>

            <div className="border-t border-white/8 px-4 py-4">
                <div className="space-y-3">
                    {activityFeed.map((item) => {
                        const Icon = item.icon || Package;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => navigate(item.route)}
                                className="w-full rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-left transition hover:border-accent-info/20 hover:bg-white/[0.06]"
                            >
                                <div className="flex items-start gap-3">
                                    <span className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border ${toneClassMap[item.tone] || toneClassMap.neutral}`}>
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                                            <span className="text-[10px] uppercase tracking-[0.2em] text-primary-500">{item.tag}</span>
                                        </div>
                                        <p className="mt-1 text-sm leading-relaxed text-primary-400">{item.detail}</p>
                                        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-primary-500">{item.timeLabel}</p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </aside>
    );
};

export default ActivityRail;

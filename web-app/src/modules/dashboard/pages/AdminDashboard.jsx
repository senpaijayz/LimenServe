import { useEffect, useState } from 'react';
import {
    DollarSign,
    Package,
    RefreshCw,
    AlertTriangle,
    Sparkles,
    TrendingUp,
} from 'lucide-react';
import Card, { KPICard } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import SalesChart from '../components/SalesChart';
import LowStockAlert from '../components/LowStockAlert';
import RecentTransactions from '../components/RecentTransactions';
import { useAuth } from '../../../context/useAuth';
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import { getAnalyticsDashboardSnapshot, runFullAnalyticsRefresh } from '../../../services/analyticsApi';

const AdminDashboard = () => {
    const { user } = useAuth();
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };

    const loadSnapshot = async () => {
        setLoading(true);
        setError('');

        try {
            const data = await getAnalyticsDashboardSnapshot({
                startDate: new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().slice(0, 10),
                endDate: new Date().toISOString().slice(0, 10),
            });
            setSnapshot(data);
        } catch (snapshotError) {
            setError(snapshotError.message || 'Unable to load analytics snapshot.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadSnapshot();
    }, []);

    const handleAnalyticsRefresh = async () => {
        setRefreshing(true);
        setError('');

        try {
            await runFullAnalyticsRefresh('Manual refresh from dashboard');
            await loadSnapshot();
        } catch (refreshError) {
            setError(refreshError.message || 'Unable to refresh analytics.');
        } finally {
            setRefreshing(false);
        }
    };

    const latestRefresh = snapshot?.latestRefresh;
    const topProductForecasts = snapshot?.topProductForecasts || [];
    const topServiceForecasts = snapshot?.topServiceForecasts || [];
    const topUpsellOpportunities = snapshot?.topUpsellOpportunities || [];
    const predictedLowStockRisk = snapshot?.predictedLowStockRisk || [];
    const topSellingItems = snapshot?.topSellingItems || [];
    const itemTrend = snapshot?.itemTrend || [];
    const peakPeriods = snapshot?.peakPeriods || [];

    const predictedRevenue = topProductForecasts.reduce((sum, item) => sum + Number(item.predicted_revenue || 0), 0);
    const forecastedProductCount = topProductForecasts.reduce((sum, item) => sum + Number(item.predicted_quantity || 0), 0);
    const topSellingLeader = topSellingItems[0];
    const peakLeader = peakPeriods[0];

    return (
        <div className="space-y-6">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 p-6 text-white sm:p-8">
                <div className="absolute top-0 right-0 h-72 w-72 -translate-y-1/2 translate-x-1/3 rounded-full bg-accent-danger/10 blur-[100px]" />
                <div className="absolute bottom-0 left-0 h-48 w-48 translate-y-1/2 -translate-x-1/4 rounded-full bg-accent-blue/10 blur-[80px]" />
                <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="mb-1 text-sm font-medium text-primary-400">
                            {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                        <h1 className="text-2xl font-display font-bold tracking-tight text-white sm:text-3xl">
                            {getGreeting()}, {user?.firstName || 'there'}!
                        </h1>
                        <p className="mt-1 text-sm text-primary-300">
                            Track demand, top-selling items, and upsell signals from the warehouse and quotation pipeline.
                        </p>
                        {latestRefresh?.endedAt && (
                            <p className="mt-3 text-xs text-primary-400">
                                Last analytics refresh: {new Date(latestRefresh.endedAt).toLocaleString()}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            variant="secondary"
                            className="border-white/10 bg-white/10 text-white hover:bg-white/20"
                            leftIcon={<RefreshCw className="w-4 h-4" />}
                            isLoading={refreshing}
                            onClick={handleAnalyticsRefresh}
                        >
                            Refresh Analytics
                        </Button>
                        <a href="/reports" className="inline-flex items-center gap-2 rounded-lg bg-accent-danger px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent-danger/20 transition-all hover:bg-accent-danger/90">
                            <TrendingUp className="h-4 w-4" /> Open Reports
                        </a>
                    </div>
                </div>
            </div>

            {error && (
                <Card className="border border-accent-danger/20 bg-accent-danger/5" padding="sm">
                    <div className="flex items-start gap-3 text-sm text-accent-danger">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <p className="font-semibold">Analytics unavailable</p>
                            <p>{error}</p>
                        </div>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard title="Predicted Revenue" value={loading ? 'Loading...' : formatCurrency(predictedRevenue)} icon={<DollarSign className="w-6 h-6" />} trend="up" trendValue={`${topProductForecasts.length} top products`} accentColor="border-accent-blue" iconBg="bg-blue-50 text-accent-blue" />
                <KPICard title="Forecasted Units" value={loading ? 'Loading...' : formatNumber(forecastedProductCount)} icon={<Package className="w-6 h-6" />} trend="up" trendValue="Next month demand" accentColor="border-indigo-500" iconBg="bg-indigo-50 text-indigo-600" />
                <KPICard title="Top Selling Items" value={loading ? 'Loading...' : formatNumber(topSellingItems.length)} icon={<TrendingUp className="w-6 h-6" />} trend="up" trendValue={topSellingLeader?.product_name || 'No item leader yet'} accentColor="border-emerald-500" iconBg="bg-emerald-50 text-emerald-600" />
                <KPICard title="Upsell Opportunities" value={loading ? 'Loading...' : formatNumber(topUpsellOpportunities.length)} icon={<Sparkles className="w-6 h-6" />} trend="up" trendValue="Curated and mined rules" accentColor="border-amber-500" iconBg="bg-amber-50 text-amber-600" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <SalesChart data={itemTrend} title="Item Sales Trend" subtitle="Monthly product-level sales trend for the last six months" />
                </div>

                <div>
                    <Card title="Item Highlights" subtitle="Which products are moving fastest right now">
                        <div className="space-y-5">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-400">Top Seller In Range</p>
                                <p className="mt-1 font-semibold text-primary-950">{topSellingLeader?.product_name || 'No item data yet'}</p>
                                {topSellingLeader && (
                                    <p className="text-sm text-primary-500">{formatNumber(topSellingLeader.quantity)} units · {formatCurrency(topSellingLeader.revenue)}</p>
                                )}
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-400">Peak Demand Month</p>
                                <p className="mt-1 font-semibold text-primary-950">{peakLeader?.product_name || 'No peak data yet'}</p>
                                {peakLeader && (
                                    <p className="text-sm text-primary-500">Best month: {new Date(peakLeader.peak_month).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })}</p>
                                )}
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-400">Top Service Forecast</p>
                                <p className="mt-1 font-semibold text-primary-950">{topServiceForecasts[0]?.service_name || 'No service forecast data yet'}</p>
                                {topServiceForecasts[0] && (
                                    <p className="text-sm text-primary-500">{formatNumber(topServiceForecasts[0].predicted_quantity)} projected jobs next month</p>
                                )}
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <Card title="Top-Selling Items" subtitle="Best-performing products in the selected dashboard range">
                        <div className="space-y-3">
                            {topSellingItems.slice(0, 6).map((item) => (
                                <div key={item.product_id} className="rounded-xl border border-primary-200 bg-white p-4 flex items-center justify-between gap-4">
                                    <div>
                                        <p className="font-semibold text-primary-950">{item.product_name}</p>
                                        <p className="text-xs font-mono text-primary-500">{item.sku}</p>
                                        <p className="text-xs text-primary-400 mt-1">{item.category}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-accent-blue">{formatNumber(item.quantity)} units</p>
                                        <p className="text-xs text-primary-500">{formatCurrency(item.revenue)}</p>
                                    </div>
                                </div>
                            ))}
                            {!loading && topSellingItems.length === 0 && (
                                <p className="text-sm text-primary-500">No item-level sales analytics have been produced yet.</p>
                            )}
                        </div>
                    </Card>
                </div>
                <div>
                    <LowStockAlert />
                </div>
            </div>

            <RecentTransactions />
        </div>
    );
};

export default AdminDashboard;

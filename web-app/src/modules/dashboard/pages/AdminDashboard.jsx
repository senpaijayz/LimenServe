import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowRight,
    DollarSign,
    Package,
    RefreshCw,
    Sparkles,
    TrendingUp,
    Wrench,
} from 'lucide-react';
import Card, { KPICard } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import SalesChart from '../components/SalesChart';
import LowStockAlert from '../components/LowStockAlert';
import RecentTransactions from '../components/RecentTransactions';
import { useAuth } from '../../../context/useAuth';
import useExperienceStore from '../../../store/useExperienceStore';
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import { getAnalyticsDashboardSnapshot, runFullAnalyticsRefresh } from '../../../services/analyticsApi';

const AdminDashboard = () => {
    const { user } = useAuth();
    const { activityFeed } = useExperienceStore();
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    }, []);

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
            await runFullAnalyticsRefresh('Manual refresh from premium dashboard');
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
    const leadingService = topServiceForecasts[0];

    return (
        <div className="space-y-6">
            <section className="shell-panel relative overflow-hidden px-6 py-7 sm:px-8">
                <div className="absolute right-[-6rem] top-[-6rem] h-64 w-64 rounded-full bg-accent-info/16 blur-[110px]" />
                <div className="absolute bottom-[-9rem] left-[-4rem] h-72 w-72 rounded-full bg-accent-blue/18 blur-[120px]" />

                <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-3xl">
                        <div className="data-pill">Operations overview</div>
                        <h1 className="mt-5 text-3xl font-semibold sm:text-[2.7rem]">
                            <span className="text-gradient-cyan">{greeting}, {user?.firstName || 'team'}.</span>
                        </h1>
                        <p className="mt-4 max-w-2xl text-base leading-relaxed text-primary-300">
                            Revenue signals, stock pressure, and workshop momentum are layered here so the next operational decision is always visible.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <span className="badge badge-info">Live cues {activityFeed.length}</span>
                            <span className="badge badge-neutral">
                                Last refresh {latestRefresh?.endedAt ? new Date(latestRefresh.endedAt).toLocaleString() : 'pending'}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            variant="secondary"
                            leftIcon={<RefreshCw className="h-4 w-4" />}
                            isLoading={refreshing}
                            onClick={handleAnalyticsRefresh}
                        >
                            Refresh analytics
                        </Button>
                        <Link to="/reports" className="btn btn-primary">
                            Open reports
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </section>

            {error && (
                <Card className="border border-accent-danger/20 bg-accent-danger/10" padding="sm">
                    <div className="flex items-start gap-3 text-sm text-accent-danger">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <p className="font-semibold">Analytics unavailable</p>
                            <p>{error}</p>
                        </div>
                    </div>
                </Card>
            )}

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KPICard
                    title="Predicted revenue"
                    value={loading ? 'Loading...' : formatCurrency(predictedRevenue)}
                    icon={<DollarSign className="h-6 w-6" />}
                    trend="up"
                    trendValue={`${topProductForecasts.length} forecasted products`}
                />
                <KPICard
                    title="Forecasted units"
                    value={loading ? 'Loading...' : formatNumber(forecastedProductCount)}
                    icon={<Package className="h-6 w-6" />}
                    trend="up"
                    trendValue="Next month demand"
                />
                <KPICard
                    title="Upsell signals"
                    value={loading ? 'Loading...' : formatNumber(topUpsellOpportunities.length)}
                    icon={<Sparkles className="h-6 w-6" />}
                    trend="up"
                    trendValue="Curated recommendations"
                />
                <KPICard
                    title="At-risk stock lines"
                    value={loading ? 'Loading...' : formatNumber(predictedLowStockRisk.length)}
                    icon={<TrendingUp className="h-6 w-6" />}
                    trend={predictedLowStockRisk.length > 0 ? 'neutral' : 'up'}
                    trendValue={predictedLowStockRisk.length > 0 ? 'Reorder review needed' : 'Healthy stock posture'}
                />
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
                <SalesChart
                    data={itemTrend}
                    title="Revenue and unit momentum"
                    subtitle="Six months of item sales trend across the monitored catalog"
                />

                <Card title="Decision surface" subtitle="High-signal cues to act on next">
                    <div className="space-y-4">
                        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-primary-500">Top seller in range</p>
                            <p className="mt-3 text-lg font-semibold text-white">{topSellingLeader?.product_name || 'No item data yet'}</p>
                            {topSellingLeader && (
                                <p className="mt-2 text-sm text-primary-400">
                                    {formatNumber(topSellingLeader.quantity)} units for {formatCurrency(topSellingLeader.revenue)}
                                </p>
                            )}
                        </div>

                        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-primary-500">Peak demand month</p>
                            <p className="mt-3 text-lg font-semibold text-white">{peakLeader?.product_name || 'No peak data yet'}</p>
                            {peakLeader && (
                                <p className="mt-2 text-sm text-primary-400">
                                    Peak in {new Date(peakLeader.peak_month).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })}
                                </p>
                            )}
                        </div>

                        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-primary-500">Leading service forecast</p>
                            <p className="mt-3 text-lg font-semibold text-white">{leadingService?.service_name || 'No service forecast data yet'}</p>
                            {leadingService && (
                                <p className="mt-2 text-sm text-primary-400">
                                    {formatNumber(leadingService.predicted_quantity)} projected jobs next month
                                </p>
                            )}
                        </div>

                        <Link to="/quotation" className="btn btn-secondary w-full justify-between">
                            Open quotation workspace
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </Card>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
                <Card title="Top-selling items" subtitle="Best-performing products in the active dashboard range">
                    <div className="space-y-3">
                        {topSellingItems.slice(0, 6).map((item) => (
                            <div
                                key={item.product_id}
                                className="flex items-center justify-between gap-4 rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white">{item.product_name}</p>
                                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-primary-500">{item.sku}</p>
                                    <p className="mt-2 text-sm text-primary-400">{item.category}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-semibold text-accent-info">{formatNumber(item.quantity)} units</p>
                                    <p className="mt-1 text-sm text-primary-300">{formatCurrency(item.revenue)}</p>
                                </div>
                            </div>
                        ))}

                        {!loading && topSellingItems.length === 0 && (
                            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-primary-400">
                                No item-level sales analytics have been produced yet.
                            </div>
                        )}
                    </div>
                </Card>

                <div className="space-y-6">
                    <LowStockAlert />

                    <Card title="Service outlook" subtitle="Forecast-backed workshop attention points">
                        <div className="space-y-3">
                            {topServiceForecasts.slice(0, 3).map((service) => (
                                <div key={service.service_name} className="rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent-info/20 bg-accent-info/10 text-accent-info">
                                                <Wrench className="h-4 w-4" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-white">{service.service_name}</p>
                                                <p className="mt-1 text-sm text-primary-400">Projected maintenance workload</p>
                                            </div>
                                        </div>
                                        <span className="badge badge-info">{formatNumber(service.predicted_quantity)} jobs</span>
                                    </div>
                                </div>
                            ))}

                            {topServiceForecasts.length === 0 && (
                                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-primary-400">
                                    No service forecast data is available yet.
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </section>

            <RecentTransactions />
        </div>
    );
};

export default AdminDashboard;

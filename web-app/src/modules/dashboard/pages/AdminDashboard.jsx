import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Box,
    DollarSign,
    AlertTriangle,
    FileText,
    Package,
    RefreshCw,
    Sparkles,
    TrendingUp,
    Wrench,
} from 'lucide-react';
import Card, { KPICard } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { useAuth } from '../../../context/useAuth';
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import { getAnalyticsDashboardSnapshot, runFullAnalyticsRefresh } from '../../../services/analyticsApi';

const SalesChart = lazy(() => import('../components/SalesChart'));
const LowStockAlert = lazy(() => import('../components/LowStockAlert'));
const RecentTransactions = lazy(() => import('../components/RecentTransactions'));

const quickActions = [
    {
        title: 'Continue Quotation',
        description: 'Open the quote builder and price the next customer request.',
        to: '/quotation',
        icon: FileText,
    },
    {
        title: 'Open Inventory',
        description: 'Check live parts quantities and low-stock attention items.',
        to: '/inventory',
        icon: Package,
    },
    {
        title: 'Service Orders',
        description: 'Review active jobs, intake, and service status updates.',
        to: '/services',
        icon: Wrench,
    },
    {
        title: 'Open Stockroom',
        description: 'Jump to the locator and warehouse visualization flow.',
        to: '/stockroom',
        icon: Box,
    },
];

function DashboardPanelFallback({ title }) {
    return (
        <div className="rounded-2xl border border-primary-200 bg-white p-6 shadow-sm">
            <div className="h-4 w-32 animate-pulse rounded-full bg-primary-200" />
            <div className="mt-6 h-48 animate-pulse rounded-2xl bg-primary-100" />
            <p className="mt-4 text-sm text-primary-500">{title}</p>
        </div>
    );
}

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

const AdminDashboard = () => {
    const { user, isProfileReady, profileWarning } = useAuth();
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const loadSnapshot = async ({ preserveCurrent = false } = {}) => {
        if (!preserveCurrent) {
            setLoading(true);
        }

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
        let cancelled = false;

        const scheduleLoad = () => {
            if (cancelled) {
                return;
            }

            void loadSnapshot();
        };

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(scheduleLoad, { timeout: 700 });
            return () => {
                cancelled = true;
                window.cancelIdleCallback(idleId);
            };
        }

        const timer = window.setTimeout(scheduleLoad, 0);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, []);

    const handleAnalyticsRefresh = async () => {
        setRefreshing(true);
        setError('');

        try {
            await runFullAnalyticsRefresh('Manual refresh from dashboard');
            await loadSnapshot({ preserveCurrent: true });
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
                            {getGreeting()}, {user?.firstName || user?.email || 'team'}!
                        </h1>
                        <p className="mt-1 text-sm text-primary-300">
                            Open the next staff task immediately, then let analytics and summaries load in behind the shell.
                        </p>
                        {latestRefresh?.endedAt && (
                            <p className="mt-3 text-xs text-primary-400">
                                Last analytics refresh: {new Date(latestRefresh.endedAt).toLocaleString()}
                            </p>
                        )}
                        {!isProfileReady && (
                            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary-300">
                                Syncing staff profile in the background
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
                        <Link to="/reports" className="inline-flex items-center gap-2 rounded-lg bg-accent-danger px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent-danger/20 transition-all hover:bg-accent-danger/90">
                            <TrendingUp className="h-4 w-4" /> Open Reports
                        </Link>
                    </div>
                </div>
            </div>

            {profileWarning && (
                <Card className="border border-amber-200 bg-amber-50" padding="sm">
                    <div className="flex items-start gap-3 text-sm text-amber-700">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <p className="font-semibold">Profile sync warning</p>
                            <p>{profileWarning}</p>
                        </div>
                    </div>
                </Card>
            )}

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

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                        <Link
                            key={action.title}
                            to={action.to}
                            className="group rounded-2xl border border-primary-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-primary-300 hover:shadow-lg"
                        >
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-accent-primary">
                                <Icon className="h-5 w-5" />
                            </div>
                            <h2 className="mt-5 text-lg font-semibold text-primary-950">{action.title}</h2>
                            <p className="mt-2 text-sm leading-relaxed text-primary-500">{action.description}</p>
                            <p className="mt-4 text-sm font-semibold text-accent-blue transition group-hover:text-accent-blueDark">
                                Open now
                            </p>
                        </Link>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard title="Predicted Revenue" value={loading ? 'Loading...' : formatCurrency(predictedRevenue)} icon={<DollarSign className="w-6 h-6" />} trend="up" trendValue={`${topProductForecasts.length} top products`} accentColor="border-accent-blue" iconBg="bg-blue-50 text-accent-blue" />
                <KPICard title="Forecasted Units" value={loading ? 'Loading...' : formatNumber(forecastedProductCount)} icon={<Package className="w-6 h-6" />} trend="up" trendValue="Next month demand" accentColor="border-indigo-500" iconBg="bg-indigo-50 text-indigo-600" />
                <KPICard title="Top Selling Items" value={loading ? 'Loading...' : formatNumber(topSellingItems.length)} icon={<TrendingUp className="w-6 h-6" />} trend="up" trendValue={topSellingLeader?.product_name || 'No item leader yet'} accentColor="border-emerald-500" iconBg="bg-emerald-50 text-emerald-600" />
                <KPICard title="Upsell Opportunities" value={loading ? 'Loading...' : formatNumber(topUpsellOpportunities.length)} icon={<Sparkles className="w-6 h-6" />} trend="up" trendValue="Curated and mined rules" accentColor="border-amber-500" iconBg="bg-amber-50 text-amber-600" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <Suspense fallback={<DashboardPanelFallback title="Loading sales trend" />}>
                        <SalesChart data={itemTrend} title="Item Sales Trend" subtitle="Monthly product-level sales trend for the last six months" />
                    </Suspense>
                </div>

                <div>
                    <Card title="Item Highlights" subtitle="Which products are moving fastest right now">
                        <div className="space-y-5">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-400">Top Seller In Range</p>
                                <p className="mt-1 font-semibold text-primary-950">{topSellingLeader?.product_name || 'No item data yet'}</p>
                                {topSellingLeader && (
                                    <p className="text-sm text-primary-500">{formatNumber(topSellingLeader.quantity)} units - {formatCurrency(topSellingLeader.revenue)}</p>
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
                    <Suspense fallback={<DashboardPanelFallback title="Loading recent transactions" />}>
                        <RecentTransactions />
                    </Suspense>
                </div>
                <div>
                    <Suspense fallback={<DashboardPanelFallback title="Loading stock alerts" />}>
                        <LowStockAlert />
                    </Suspense>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;

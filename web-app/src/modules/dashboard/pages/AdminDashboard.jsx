import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
    DollarSign,
    AlertTriangle,
    ClipboardList,
    Package,
    RefreshCw,
    ShoppingCart,
    TrendingUp,
    Warehouse,
    Wrench,
    FileText,
} from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { useAuth } from '../../../context/useAuth';
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import { getAnalyticsDashboardSnapshot, runFullAnalyticsRefresh } from '../../../services/analyticsApi';
import { getDashboardOperationsSnapshot, summarizeDashboardOperations } from '../../../services/dashboardApi';

const SalesChart = lazy(() => import('../components/SalesChart'));
const InventoryMovementLedger = lazy(() => import('../components/InventoryMovementLedger'));
const RecentTransactions = lazy(() => import('../components/RecentTransactions'));

function DashboardPanelFallback({ title }) {
    return (
        <div className="rounded-2xl border border-primary-200 bg-white p-6 shadow-sm">
            <div className="h-4 w-32 animate-pulse rounded-full bg-primary-200" />
            <div className="mt-6 h-48 animate-pulse rounded-2xl bg-primary-100" />
            <p className="mt-4 text-sm text-primary-500">{title}</p>
        </div>
    );
}

function KPICard({ title, value, icon, trendValue }) {
    return (
        <div className="min-w-0 rounded-lg border border-primary-200 bg-white px-5 py-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-primary-600">{title}</p>
                <span className="shrink-0 text-primary-400" aria-hidden="true">{icon}</span>
            </div>
            <p className="mt-3 break-words text-2xl font-semibold tabular-nums tracking-tight text-primary-950">{value}</p>
            {trendValue && <p className="mt-2 text-xs text-primary-500">{trendValue}</p>}
        </div>
    );
}

const AdminDashboard = () => {
    const { isProfileReady, profileWarning } = useAuth();
    const [snapshot, setSnapshot] = useState(null);
    const [operations, setOperations] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const loadSnapshot = async ({ preserveCurrent = false } = {}) => {
        if (!preserveCurrent) {
            setLoading(true);
        }

        setError('');

        try {
            const [analyticsResult, operationsResult] = await Promise.allSettled([
                getAnalyticsDashboardSnapshot({
                    startDate: new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().slice(0, 10),
                    endDate: new Date().toISOString().slice(0, 10),
                }),
                getDashboardOperationsSnapshot(),
            ]);

            if (analyticsResult.status === 'fulfilled') {
                setSnapshot(analyticsResult.value);
            } else {
                setError(analyticsResult.reason?.message || 'Unable to load analytics snapshot.');
            }

            if (operationsResult.status === 'fulfilled') {
                setOperations(operationsResult.value);
            }
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
    const topSellingItems = snapshot?.topSellingItems || [];
    const itemTrend = snapshot?.itemTrend || [];
    const peakPeriods = snapshot?.peakPeriods || [];
    const operationalSummary = summarizeDashboardOperations(operations || {});

    const predictedRevenue = topProductForecasts.reduce((sum, item) => sum + Number(item.predicted_revenue || 0), 0);
    const forecastedProductCount = topProductForecasts.reduce((sum, item) => sum + Number(item.predicted_quantity || 0), 0);
    const topSellingLeader = topSellingItems[0];
    const peakLeader = peakPeriods[0];

    return (
        <div className="space-y-6">
            <div className="border-b border-primary-200 pb-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="mb-1 text-sm font-medium text-primary-400">
                            {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                        <h1 className="text-2xl font-semibold tracking-tight text-primary-950 sm:text-3xl">
                            Shop overview
                        </h1>
                        <p className="mt-1 text-sm text-primary-600">
                            Sales, stock and work in progress.
                        </p>
                        {latestRefresh?.endedAt && (
                            <p className="mt-2 text-xs text-primary-500">
                                Last analytics refresh: {new Date(latestRefresh.endedAt).toLocaleString()}
                            </p>
                        )}
                        {!isProfileReady && (
                            <p className="mt-2 text-xs text-primary-500">
                                Loading your profile…
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            variant="secondary"
                            className="border-primary-200 bg-white text-primary-700 hover:bg-primary-50"
                            leftIcon={<RefreshCw className="w-4 h-4" />}
                            isLoading={refreshing}
                            onClick={handleAnalyticsRefresh}
                        >
                            Refresh
                        </Button>
                        <Link to="/reports" className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-900">
                            <TrendingUp className="h-4 w-4" /> View reports
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

            {operationalSummary.errors.length > 0 && (
                <Card className="border border-amber-200 bg-amber-50" padding="sm">
                    <div className="flex items-start gap-3 text-sm text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <p className="font-semibold">Some live dashboard data is unavailable</p>
                            <p className="mt-1">{operationalSummary.errors.join(' · ')}</p>
                        </div>
                    </div>
                </Card>
            )}

            <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-base font-semibold text-primary-950">Current operations</h2>
                        <p className="mt-1 text-xs text-primary-500">Today's sales and current stock, orders and quotations</p>
                    </div>
                    <p className="text-xs text-primary-500">
                        {operationalSummary.loadedAt
                            ? `Updated ${new Date(operationalSummary.loadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                            : 'Loading live data...'}
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <KPICard title="Today's Sales" value={loading ? 'Loading...' : formatCurrency(operationalSummary.todaySalesTotal)} icon={<ShoppingCart className="h-6 w-6" />} accentColor="border-emerald-500" iconBg="bg-emerald-50 text-emerald-600" />
                    <KPICard title="Sales Count" value={loading ? 'Loading...' : formatNumber(operationalSummary.todaySalesCount)} icon={<DollarSign className="h-6 w-6" />} accentColor="border-accent-blue" iconBg="bg-blue-50 text-accent-blue" />
                    <KPICard title="Inventory Value" value={loading ? 'Loading...' : formatCurrency(operationalSummary.inventoryValue)} icon={<Warehouse className="h-6 w-6" />} accentColor="border-indigo-500" iconBg="bg-indigo-50 text-indigo-600" />
                    <KPICard title="Open Service Orders" value={loading ? 'Loading...' : formatNumber(operationalSummary.openServiceOrderCount)} icon={<Wrench className="h-6 w-6" />} accentColor="border-amber-500" iconBg="bg-amber-50 text-amber-700" />
                    <KPICard title="Pending Reservations" value={loading ? 'Loading...' : formatNumber(operationalSummary.pendingReservationCount)} icon={<ClipboardList className="h-6 w-6" />} accentColor="border-rose-500" iconBg="bg-rose-50 text-rose-600" />
                    <KPICard title="Active Quotations" value={loading ? 'Loading...' : formatNumber(operationalSummary.activeEstimateCount)} icon={<FileText className="h-6 w-6" />} accentColor="border-violet-500" iconBg="bg-violet-50 text-violet-600" />
                </div>
            </div>

            <section className="space-y-3" aria-label="Sales forecasts">
                <div>
                    <h2 className="text-base font-semibold text-primary-950">Sales outlook</h2>
                    <p className="mt-1 text-xs text-primary-500">Estimates based on recorded sales. Forecasts are not confirmed revenue.</p>
                </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <KPICard title="Predicted Revenue" value={loading ? 'Loading...' : formatCurrency(predictedRevenue)} icon={<DollarSign className="w-6 h-6" />} trend="up" trendValue={`${topProductForecasts.length} top products`} accentColor="border-accent-blue" iconBg="bg-blue-50 text-accent-blue" />
                <KPICard title="Forecasted Units" value={loading ? 'Loading...' : formatNumber(forecastedProductCount)} icon={<Package className="w-6 h-6" />} trend="up" trendValue="Next month demand" accentColor="border-indigo-500" iconBg="bg-indigo-50 text-indigo-600" />
                <KPICard title="Top Selling Items" value={loading ? 'Loading...' : formatNumber(topSellingItems.length)} icon={<TrendingUp className="w-6 h-6" />} trend="up" trendValue={topSellingLeader?.product_name || 'No item leader yet'} accentColor="border-emerald-500" iconBg="bg-emerald-50 text-emerald-600" />
            </div>
            </section>

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
                    <Suspense fallback={<DashboardPanelFallback title="Loading inventory movement ledger" />}>
                        <InventoryMovementLedger />
                    </Suspense>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;

import { useEffect, useState } from 'react';
import { Download, Package, TrendingUp, Wrench, RefreshCw, AlertTriangle } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card, { KPICard } from '../../../components/ui/Card';
import {
    getAnalyticsDashboardSnapshot,
    getMonthlyProductForecasts,
    getMonthlyServiceForecasts,
    runFullAnalyticsRefresh,
} from '../../../services/analyticsApi';
import { formatCurrency } from '../../../utils/formatters';

const SalesReport = () => {
    const [productForecasts, setProductForecasts] = useState([]);
    const [serviceForecasts, setServiceForecasts] = useState([]);
    const [dashboardSnapshot, setDashboardSnapshot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const loadAnalytics = async () => {
        setLoading(true);
        setError('');

        try {
            const [products, services, snapshot] = await Promise.all([
                getMonthlyProductForecasts(),
                getMonthlyServiceForecasts(),
                getAnalyticsDashboardSnapshot(),
            ]);

            setProductForecasts(products);
            setServiceForecasts(services);
            setDashboardSnapshot(snapshot);
        } catch (loadError) {
            setError(loadError.message || 'Unable to load analytics from Supabase.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAnalytics();
    }, []);

    const handleRefresh = async () => {
        setRefreshing(true);
        setError('');

        try {
            await runFullAnalyticsRefresh('Manual refresh from reports page');
            await loadAnalytics();
        } catch (refreshError) {
            setError(refreshError.message || 'Unable to refresh analytics.');
        } finally {
            setRefreshing(false);
        }
    };

    const totalPredictedProductRevenue = productForecasts.reduce(
        (sum, item) => sum + Number(item.predicted_revenue || 0),
        0
    );
    const totalPredictedProductQuantity = productForecasts.reduce(
        (sum, item) => sum + Number(item.predicted_quantity || 0),
        0
    );
    const totalPredictedServiceRevenue = serviceForecasts.reduce(
        (sum, item) => sum + Number(item.predicted_revenue || 0),
        0
    );
    const lowStockRiskCount = (dashboardSnapshot?.predictedLowStockRisk || []).length;
    const topUpsells = dashboardSnapshot?.topUpsellOpportunities || [];
    const latestRefresh = dashboardSnapshot?.latestRefresh;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-primary-950">
                        Predictive Analytics Report
                    </h1>
                    <p className="mt-1 text-primary-500">
                        Monthly demand forecasting, upsell mining, and stock-risk visibility from Supabase analytics.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Button
                        variant="secondary"
                        leftIcon={<RefreshCw className="w-4 h-4" />}
                        isLoading={refreshing}
                        onClick={handleRefresh}
                    >
                        Refresh Analytics
                    </Button>
                    <Button variant="outline" leftIcon={<Download className="w-4 h-4" />}>
                        Export
                    </Button>
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
                <KPICard
                    title="Predicted Product Revenue"
                    value={loading ? 'Loading...' : formatCurrency(totalPredictedProductRevenue)}
                    icon={<TrendingUp className="w-6 h-6" />}
                    trend="up"
                    trendValue={`${productForecasts.length} forecasted items`}
                />
                <KPICard
                    title="Predicted Product Units"
                    value={loading ? 'Loading...' : totalPredictedProductQuantity.toLocaleString()}
                    icon={<Package className="w-6 h-6" />}
                    trend="up"
                    trendValue="Next month demand"
                    accentColor="border-indigo-500"
                    iconBg="bg-indigo-50 text-indigo-600"
                />
                <KPICard
                    title="Predicted Service Revenue"
                    value={loading ? 'Loading...' : formatCurrency(totalPredictedServiceRevenue)}
                    icon={<Wrench className="w-6 h-6" />}
                    trend="up"
                    trendValue={`${serviceForecasts.length} forecasted services`}
                    accentColor="border-amber-500"
                    iconBg="bg-amber-50 text-amber-600"
                />
                <KPICard
                    title="Low Stock Risk"
                    value={loading ? 'Loading...' : String(lowStockRiskCount)}
                    icon={<AlertTriangle className="w-6 h-6" />}
                    trend={lowStockRiskCount > 0 ? 'down' : 'up'}
                    trendValue={lowStockRiskCount > 0 ? 'Needs restock review' : 'Healthy forecast'}
                    accentColor="border-rose-500"
                    iconBg="bg-rose-50 text-rose-600"
                />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card
                    title="Top Product Forecasts"
                    subtitle={latestRefresh?.endedAt ? `Last refresh: ${new Date(latestRefresh.endedAt).toLocaleString()}` : 'Forecast output'}
                    className="xl:col-span-2"
                >
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Month</th>
                                    <th className="text-right">Predicted Qty</th>
                                    <th className="text-right">Predicted Revenue</th>
                                    <th>Trend</th>
                                    <th>Confidence</th>
                                </tr>
                            </thead>
                            <tbody>
                                {productForecasts.slice(0, 8).map((item) => (
                                    <tr key={item.product_id}>
                                        <td>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-primary-950">{item.product_name}</span>
                                                <span className="text-xs font-mono text-primary-500">{item.sku}</span>
                                            </div>
                                        </td>
                                        <td>{new Date(item.target_month).toLocaleDateString('en-PH', { year: 'numeric', month: 'short' })}</td>
                                        <td className="text-right">{Number(item.predicted_quantity || 0).toLocaleString()}</td>
                                        <td className="text-right font-medium text-accent-blue">{formatCurrency(item.predicted_revenue || 0)}</td>
                                        <td className="capitalize">{item.trend_label}</td>
                                        <td className="capitalize">{item.confidence_label}</td>
                                    </tr>
                                ))}
                                {!loading && productForecasts.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="py-8 text-center text-primary-500">
                                            No product forecasts yet. Run the analytics refresh after seeding the warehouse.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card title="Top Upsell Opportunities" subtitle="Association-rule mining output">
                    <div className="space-y-3">
                        {topUpsells.slice(0, 6).map((item) => (
                            <div key={item.rule_id} className="rounded-xl border border-primary-200 bg-primary-50 p-4">
                                <p className="font-semibold text-primary-950">{item.product_name}</p>
                                <p className="mt-1 text-sm text-primary-600">
                                    Recommend:{' '}
                                    <span className="font-medium text-primary-900">
                                        {item.recommended_product_name || item.recommended_service_name}
                                    </span>
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-primary-500">
                                    <span className="rounded-full bg-white px-2 py-1">Lift {item.lift}</span>
                                    <span className="rounded-full bg-white px-2 py-1">Confidence {item.confidence}</span>
                                    <span className="rounded-full bg-white px-2 py-1">{item.sample_count} baskets</span>
                                </div>
                            </div>
                        ))}
                        {!loading && topUpsells.length === 0 && (
                            <p className="text-sm text-primary-500">
                                No upsell rules available yet. Seed transaction history and refresh analytics.
                            </p>
                        )}
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card title="Service Demand Forecast" subtitle="Next-month predicted service load">
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Service</th>
                                    <th className="text-right">Predicted Qty</th>
                                    <th className="text-right">Predicted Revenue</th>
                                    <th>Trend</th>
                                </tr>
                            </thead>
                            <tbody>
                                {serviceForecasts.slice(0, 8).map((item) => (
                                    <tr key={item.service_id}>
                                        <td>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-primary-950">{item.service_name}</span>
                                                <span className="text-xs font-mono text-primary-500">{item.service_code}</span>
                                            </div>
                                        </td>
                                        <td className="text-right">{Number(item.predicted_quantity || 0).toLocaleString()}</td>
                                        <td className="text-right font-medium text-accent-blue">{formatCurrency(item.predicted_revenue || 0)}</td>
                                        <td className="capitalize">{item.trend_label}</td>
                                    </tr>
                                ))}
                                {!loading && serviceForecasts.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="py-8 text-center text-primary-500">
                                            No service forecasts yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card title="Predicted Stock Risk" subtitle="Forecast vs available stock">
                    <div className="space-y-3">
                        {(dashboardSnapshot?.predictedLowStockRisk || []).slice(0, 6).map((item) => (
                            <div key={`${item.product_id}-${item.target_month}`} className="rounded-xl border border-primary-200 bg-white p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-primary-950">{item.product_name}</p>
                                        <p className="text-xs font-mono text-primary-500">{item.sku}</p>
                                    </div>
                                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold uppercase text-amber-700">
                                        {item.risk_level}
                                    </span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-primary-600">
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-primary-400">Forecast Qty</p>
                                        <p className="font-medium text-primary-950">{Number(item.predicted_quantity || 0).toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-primary-400">On Hand</p>
                                        <p className="font-medium text-primary-950">{Number(item.on_hand || 0).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {!loading && (dashboardSnapshot?.predictedLowStockRisk || []).length === 0 && (
                            <p className="text-sm text-primary-500">
                                No forecasted stock risks detected.
                            </p>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default SalesReport;

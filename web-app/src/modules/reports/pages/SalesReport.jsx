import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Filter, Receipt, RefreshCw, TrendingUp } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card, { KPICard } from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import SalesChart from '../../dashboard/components/SalesChart';
import {
    getAnalyticsDashboardSnapshot,
    getItemPeakPeriods,
    getItemSalesTrend,
    getTopSellingItems,
    runFullAnalyticsRefresh,
} from '../../../services/analyticsApi';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/formatters';
import { getPosSaleDetail, listPosSales } from '../../../services/posApi';
import { PAYMENT_LABELS } from '../../../utils/constants';
import SaleReceiptPreview from '../../pos/components/SaleReceiptPreview.jsx';

const SalesReport = () => {
    const [filters, setFilters] = useState({
        startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
        category: '',
        productId: '',
        location: 'Main Shop',
        granularity: 'month',
    });
    const [dashboardSnapshot, setDashboardSnapshot] = useState(null);
    const [topSellingItems, setTopSellingItems] = useState([]);
    const [itemTrend, setItemTrend] = useState([]);
    const [peakPeriods, setPeakPeriods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [salesHistory, setSalesHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [historyError, setHistoryError] = useState('');
    const [historySearch, setHistorySearch] = useState('');
    const [selectedSale, setSelectedSale] = useState(null);
    const [loadingSaleDetail, setLoadingSaleDetail] = useState(false);
    const activeSaleRequestRef = useRef(null);

    const loadAnalytics = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const params = {
                startDate: filters.startDate,
                endDate: filters.endDate,
                category: filters.category || null,
                productId: filters.productId || null,
                location: filters.location || null,
                granularity: filters.granularity,
            };

            const [snapshot, items, trend, periods] = await Promise.all([
                getAnalyticsDashboardSnapshot(params),
                getTopSellingItems(params),
                getItemSalesTrend(params),
                getItemPeakPeriods(params),
            ]);

            setDashboardSnapshot(snapshot);
            setTopSellingItems(items);
            setItemTrend(trend);
            setPeakPeriods(periods);
        } catch (loadError) {
            setError(loadError.message || 'Unable to load analytics from Supabase.');
        } finally {
            setLoading(false);
        }
    }, [filters.category, filters.endDate, filters.granularity, filters.location, filters.productId, filters.startDate]);

    const loadSalesHistory = useCallback(async () => {
        setHistoryLoading(true);
        setHistoryError('');

        try {
            const { sales } = await listPosSales({
                startDate: filters.startDate,
                endDate: filters.endDate,
                search: historySearch || null,
                limit: 20,
                page: 1,
            });

            setSalesHistory(sales);
        } catch (loadError) {
            setHistoryError(loadError.message || 'Unable to load sales history.');
        } finally {
            setHistoryLoading(false);
        }
    }, [filters.endDate, filters.startDate, historySearch]);

    useEffect(() => {
        void loadAnalytics();
    }, [loadAnalytics]);

    useEffect(() => {
        void loadSalesHistory();
    }, [loadSalesHistory]);

    const handleRefresh = async () => {
        setRefreshing(true);
        setError('');

        try {
            await runFullAnalyticsRefresh('Manual refresh from reports page');
            await loadAnalytics();
            await loadSalesHistory();
        } catch (refreshError) {
            setError(refreshError.message || 'Unable to refresh analytics.');
        } finally {
            setRefreshing(false);
        }
    };

    const handleOpenSale = async (saleId) => {
        activeSaleRequestRef.current = saleId;
        setLoadingSaleDetail(true);
        setSelectedSale(null);

        try {
            const detail = await getPosSaleDetail(saleId);
            if (activeSaleRequestRef.current === saleId) {
                setSelectedSale(detail);
            }
        } catch (detailError) {
            setHistoryError(detailError.message || 'Unable to load the selected receipt.');
        } finally {
            if (activeSaleRequestRef.current === saleId) {
                setLoadingSaleDetail(false);
            }
        }
    };

    const topLeader = topSellingItems[0];
    const peakLeader = peakPeriods[0];
    const trendRevenue = useMemo(() => itemTrend.reduce((sum, item) => sum + Number(item.revenue ?? 0), 0), [itemTrend]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-primary-950">Item Sales Analytics Report</h1>
                    <p className="mt-1 text-primary-500">Track top-selling Mitsubishi parts, identify peak periods, and review item-level sales trends.</p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Button variant="secondary" leftIcon={<RefreshCw className="w-4 h-4" />} isLoading={refreshing} onClick={handleRefresh}>Refresh Analytics</Button>
                    <Button variant="outline" leftIcon={<Download className="w-4 h-4" />}>Export</Button>
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

            <Card title="Report Filters" subtitle="Narrow the period, category, and trend granularity.">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <input type="date" value={filters.startDate} onChange={(e) => setFilters((current) => ({ ...current, startDate: e.target.value }))} className="input py-2.5 text-sm" />
                    <input type="date" value={filters.endDate} onChange={(e) => setFilters((current) => ({ ...current, endDate: e.target.value }))} className="input py-2.5 text-sm" />
                    <input type="text" value={filters.category} onChange={(e) => setFilters((current) => ({ ...current, category: e.target.value }))} placeholder="Category" className="input py-2.5 text-sm" />
                    <input type="text" value={filters.productId} onChange={(e) => setFilters((current) => ({ ...current, productId: e.target.value }))} placeholder="Product ID (optional)" className="input py-2.5 text-sm" />
                    <input type="text" value={filters.location} onChange={(e) => setFilters((current) => ({ ...current, location: e.target.value }))} placeholder="Location" className="input py-2.5 text-sm" />
                    <select value={filters.granularity} onChange={(e) => setFilters((current) => ({ ...current, granularity: e.target.value }))} className="input py-2.5 text-sm">
                        <option value="month">Monthly Trend</option>
                        <option value="day">Daily Trend</option>
                    </select>
                </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard title="Top Selling Item" value={loading ? 'Loading...' : (topLeader?.product_name || 'N/A')} icon={<TrendingUp className="w-6 h-6" />} trend="up" trendValue={topLeader ? `${formatNumber(topLeader.quantity)} units` : 'No data'} />
                <KPICard title="Item Trend Revenue" value={loading ? 'Loading...' : formatCurrency(trendRevenue)} icon={<Filter className="w-6 h-6" />} trend="up" trendValue={`${itemTrend.length} periods`} accentColor="border-indigo-500" iconBg="bg-indigo-50 text-indigo-600" />
                <KPICard title="Peak Month Leader" value={loading ? 'Loading...' : (peakLeader?.product_name || 'N/A')} icon={<TrendingUp className="w-6 h-6" />} trend="up" trendValue={peakLeader?.peak_month ? new Date(peakLeader.peak_month).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : 'No data'} accentColor="border-emerald-500" iconBg="bg-emerald-50 text-emerald-600" />
                <KPICard title="Low Stock Risks" value={loading ? 'Loading...' : String((dashboardSnapshot?.predictedLowStockRisk || []).length)} icon={<AlertTriangle className="w-6 h-6" />} trend="down" trendValue="Forecast-based risk watch" accentColor="border-amber-500" iconBg="bg-amber-50 text-amber-600" />
            </div>

            <SalesChart data={itemTrend} title="Item-Level Sales Trend" subtitle="Revenue and units sold over the selected period" />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card title="Top-Selling Items" subtitle="Best performing items in the selected time frame">
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Category</th>
                                    <th className="text-right">Units</th>
                                    <th className="text-right">Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topSellingItems.map((item) => (
                                    <tr key={item.product_id}>
                                        <td>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-primary-950">{item.product_name}</span>
                                                <span className="text-xs font-mono text-primary-500">{item.sku}</span>
                                            </div>
                                        </td>
                                        <td>{item.category}</td>
                                        <td className="text-right">{formatNumber(item.quantity)}</td>
                                        <td className="text-right font-medium text-accent-blue">{formatCurrency(item.revenue)}</td>
                                    </tr>
                                ))}
                                {!loading && topSellingItems.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="py-8 text-center text-primary-500">No item sales data matched the selected filters.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card title="Peak Periods" subtitle="When each product performed best">
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Peak Month</th>
                                    <th className="text-right">Peak Units</th>
                                    <th className="text-right">Peak Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {peakPeriods.map((item) => (
                                    <tr key={`${item.product_id}-${item.peak_month}`}>
                                        <td>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-primary-950">{item.product_name}</span>
                                                <span className="text-xs font-mono text-primary-500">{item.sku}</span>
                                            </div>
                                        </td>
                                        <td>{new Date(item.peak_month).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}</td>
                                        <td className="text-right">{formatNumber(item.peak_quantity)}</td>
                                        <td className="text-right font-medium text-accent-blue">{formatCurrency(item.peak_revenue)}</td>
                                    </tr>
                                ))}
                                {!loading && peakPeriods.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="py-8 text-center text-primary-500">No peak-period data matched the selected filters.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            <Card
                title="Sales History"
                subtitle="Receipt-level history for POS and converted sales."
                headerAction={(
                    <div className="w-72">
                        <input
                            type="text"
                            value={historySearch}
                            onChange={(e) => setHistorySearch(e.target.value)}
                            placeholder="Search receipt, customer, or cashier"
                            className="input py-2.5 text-sm"
                        />
                    </div>
                )}
            >
                {historyError && (
                    <div className="mb-4 rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                        {historyError}
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Receipt</th>
                                <th>Date / Time</th>
                                <th>Customer</th>
                                <th>Cashier</th>
                                <th className="text-right">Items</th>
                                <th>Payment</th>
                                <th>Status</th>
                                <th className="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {salesHistory.map((sale) => (
                                <tr
                                    key={sale.sale_id}
                                    onClick={() => handleOpenSale(sale.sale_id)}
                                    className="cursor-pointer transition-colors hover:bg-primary-50"
                                >
                                    <td>
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-primary-950">{sale.transaction_number}</span>
                                            <span className="text-xs text-primary-500">Business date {sale.business_date}</span>
                                        </div>
                                    </td>
                                    <td>{formatDateTime(sale.created_at)}</td>
                                    <td>{sale.customer_name}</td>
                                    <td>{sale.cashier_name}</td>
                                    <td className="text-right">{formatNumber(sale.item_count)}</td>
                                    <td>{PAYMENT_LABELS[sale.payment_method] || sale.payment_method}</td>
                                    <td>
                                        <span className="inline-flex rounded-full border border-accent-success/20 bg-accent-success/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-accent-success">
                                            {sale.status}
                                        </span>
                                    </td>
                                    <td className="text-right font-medium text-accent-blue">{formatCurrency(sale.total_amount)}</td>
                                </tr>
                            ))}
                            {!historyLoading && salesHistory.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="py-8 text-center text-primary-500">No sales matched the selected filters yet.</td>
                                </tr>
                            )}
                            {historyLoading && (
                                <tr>
                                    <td colSpan="8" className="py-8 text-center text-primary-500">Loading sales history...</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal
                isOpen={loadingSaleDetail || Boolean(selectedSale)}
                onClose={() => {
                    activeSaleRequestRef.current = null;
                    setLoadingSaleDetail(false);
                    setSelectedSale(null);
                }}
                title={selectedSale?.sale?.transactionNumber ? `Receipt ${selectedSale.sale.transactionNumber}` : 'Receipt'}
                size="xl"
            >
                {loadingSaleDetail && (
                    <div className="py-10 text-center text-sm text-primary-500">Loading receipt...</div>
                )}

                {!loadingSaleDetail && selectedSale?.receipt && (
                    <div className="space-y-4">
                        <SaleReceiptPreview receipt={selectedSale.receipt} printId="report-sale-receipt" />

                        <div className="flex justify-end gap-3 print:hidden">
                            <Button variant="secondary" onClick={() => setSelectedSale(null)}>
                                Close
                            </Button>
                            <Button variant="primary" leftIcon={<Receipt className="h-4 w-4" />} onClick={() => window.print()}>
                                Print Receipt
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default SalesReport;

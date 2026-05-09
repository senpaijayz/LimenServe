import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Download, FilePlus2, Filter, Receipt, RefreshCw, TrendingUp } from 'lucide-react';
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
import { useAuth } from '../../../context/useAuth';
import SaleReceiptPreview from '../../pos/components/SaleReceiptPreview.jsx';
import HistoricalSaleEditorModal from '../components/HistoricalSaleEditorModal.jsx';

function toReportNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildReportStamp(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function isDemoSale(sale) {
    const transactionNumber = String(sale?.transaction_number ?? sale?.transactionNumber ?? '');
    const customerName = String(sale?.customer_name ?? sale?.customerName ?? '');
    const originalReference = String(sale?.original_reference ?? sale?.originalReference ?? '');

    return transactionNumber.startsWith('SALE-DEMO-')
        || customerName.toLowerCase().startsWith('demo customer')
        || originalReference.toUpperCase().startsWith('DEMO-');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderReportTable(headers, rows, emptyMessage = 'No records') {
    const safeRows = rows.length > 0 ? rows : [[emptyMessage, ...Array(Math.max(headers.length - 1, 0)).fill('')]];

    return `
        <table>
            <thead>
                <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${safeRows.map((row) => `
                    <tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] ?? '')}</td>`).join('')}</tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function buildPrintableSalesReport({
    filters,
    generatedAt,
    generatedBy,
    historySearch,
    topSellingItems,
    itemTrend,
    peakPeriods,
    exportedSales,
    trendRevenue,
    lowStockRiskCount,
}) {
    const topLeader = topSellingItems[0];
    const peakLeader = peakPeriods[0];
    const topItemRows = topSellingItems.map((item) => [
        item.product_name || '',
        item.sku || '',
        item.category || '',
        formatNumber(toReportNumber(item.quantity)),
        formatCurrency(toReportNumber(item.revenue)),
    ]);
    const trendRows = itemTrend.map((item) => [
        item.period_label || item.period || item.bucket || item.month || item.sale_period || '',
        formatNumber(toReportNumber(item.quantity ?? item.units)),
        formatCurrency(toReportNumber(item.revenue)),
    ]);
    const peakRows = peakPeriods.map((item) => [
        item.product_name || '',
        item.sku || '',
        item.peak_month ? new Date(item.peak_month).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : '',
        formatNumber(toReportNumber(item.peak_quantity)),
        formatCurrency(toReportNumber(item.peak_revenue)),
    ]);
    const ledgerRows = exportedSales.map((sale) => [
        sale.transaction_number || '',
        formatDateTime(sale.saleAt || sale.sale_at || sale.created_at),
        sale.customer_name || '',
        sale.cashier_name || '',
        sale.sourceType === 'historical_encoded' || sale.source_type === 'historical_encoded' ? 'Historical' : 'POS',
        formatNumber(toReportNumber(sale.item_count)),
        PAYMENT_LABELS[sale.payment_method] || sale.payment_method || '',
        sale.status || '',
        sale.originalReference || sale.original_reference || '',
        formatCurrency(toReportNumber(sale.total_amount)),
    ]);

    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <title>LimenServe Sales Report ${escapeHtml(filters.startDate)} to ${escapeHtml(filters.endDate)}</title>
    <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            color: #101828;
            background: #ffffff;
            font-family: "Segoe UI", Arial, sans-serif;
            font-size: 10.5px;
            line-height: 1.45;
        }
        .report-shell { width: 100%; }
        .report-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            border-bottom: 2px solid #172554;
            padding-bottom: 12px;
            margin-bottom: 14px;
        }
        .brand-kicker {
            color: #1d4ed8;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 0.16em;
            text-transform: uppercase;
        }
        h1 {
            margin: 3px 0 0;
            color: #0f172a;
            font-size: 22px;
            line-height: 1.1;
        }
        .company {
            margin-top: 4px;
            color: #475569;
            font-size: 10.5px;
        }
        .meta-box {
            min-width: 170px;
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 10px;
            text-align: right;
        }
        .meta-box strong {
            display: block;
            color: #0f172a;
            font-size: 12px;
        }
        .meta-box span {
            display: block;
            margin-top: 2px;
            color: #64748b;
        }
        .filter-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 12px;
        }
        .filter-card, .kpi-card {
            border: 1px solid #dbe3ef;
            border-radius: 10px;
            padding: 8px 10px;
            background: #f8fafc;
            break-inside: avoid;
        }
        .label {
            color: #64748b;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
        }
        .value {
            margin-top: 3px;
            color: #0f172a;
            font-size: 11px;
            font-weight: 700;
        }
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 14px;
        }
        .kpi-card {
            background: #ffffff;
        }
        .kpi-card .value {
            font-size: 12px;
        }
        section {
            margin-top: 14px;
            break-inside: avoid;
        }
        h2 {
            margin: 0 0 7px;
            color: #0f172a;
            font-size: 13px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            border: 1px solid #cbd5e1;
        }
        th {
            background: #eaf0f8;
            color: #334155;
            font-size: 8.5px;
            font-weight: 800;
            letter-spacing: 0.06em;
            text-align: left;
            text-transform: uppercase;
        }
        th, td {
            border-bottom: 1px solid #e2e8f0;
            padding: 5px 6px;
            vertical-align: top;
            overflow-wrap: anywhere;
        }
        tr:nth-child(even) td {
            background: #fbfdff;
        }
        .signatures {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 40px;
            margin-top: 28px;
            page-break-inside: avoid;
        }
        .signature-line {
            border-top: 1px solid #334155;
            padding-top: 7px;
            text-align: center;
            color: #475569;
            font-weight: 700;
        }
        .print-actions {
            position: sticky;
            top: 0;
            z-index: 10;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 10px 0;
            background: #ffffff;
        }
        .print-actions button {
            border: 1px solid #cbd5e1;
            border-radius: 999px;
            background: #172554;
            color: #ffffff;
            cursor: pointer;
            font-weight: 800;
            padding: 8px 14px;
        }
        .print-actions button.secondary {
            background: #ffffff;
            color: #172554;
        }
        @media print {
            .print-actions { display: none; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="print-actions">
        <button class="secondary" onclick="window.close()">Close</button>
        <button onclick="window.print()">Print / Save PDF</button>
    </div>
    <main class="report-shell">
        <header class="report-header">
            <div>
                <div class="brand-kicker">LimenServe</div>
                <h1>Sales Analytics Report</h1>
                <div class="company">Limen Auto Supply and Services</div>
            </div>
            <div class="meta-box">
                <strong>${escapeHtml(filters.startDate)} to ${escapeHtml(filters.endDate)}</strong>
                <span>Generated ${escapeHtml(formatDateTime(generatedAt))}</span>
                <span>By ${escapeHtml(generatedBy)}</span>
            </div>
        </header>

        <div class="filter-grid">
            <div class="filter-card"><div class="label">Category</div><div class="value">${escapeHtml(filters.category || 'All')}</div></div>
            <div class="filter-card"><div class="label">Product ID</div><div class="value">${escapeHtml(filters.productId || 'All')}</div></div>
            <div class="filter-card"><div class="label">Location</div><div class="value">${escapeHtml(filters.location || 'All')}</div></div>
            <div class="filter-card"><div class="label">Search</div><div class="value">${escapeHtml(historySearch || 'All')}</div></div>
        </div>

        <div class="kpi-grid">
            <div class="kpi-card"><div class="label">Top Item</div><div class="value">${escapeHtml(topLeader?.product_name || 'N/A')}</div></div>
            <div class="kpi-card"><div class="label">Trend Revenue</div><div class="value">${escapeHtml(formatCurrency(trendRevenue))}</div></div>
            <div class="kpi-card"><div class="label">Peak Leader</div><div class="value">${escapeHtml(peakLeader?.product_name || 'N/A')}</div></div>
            <div class="kpi-card"><div class="label">Low Stock Risks</div><div class="value">${escapeHtml(formatNumber(lowStockRiskCount))}</div></div>
        </div>

        <section>
            <h2>Top-Selling Items</h2>
            ${renderReportTable(['Product', 'SKU', 'Category', 'Units', 'Revenue'], topItemRows)}
        </section>

        <section>
            <h2>Item Sales Trend</h2>
            ${renderReportTable(['Period', 'Units', 'Revenue'], trendRows)}
        </section>

        <section>
            <h2>Peak Periods</h2>
            ${renderReportTable(['Product', 'SKU', 'Peak Month', 'Peak Units', 'Peak Revenue'], peakRows)}
        </section>

        <section>
            <h2>Sales Ledger</h2>
            ${renderReportTable(['Receipt', 'Date / Time', 'Customer', 'Cashier', 'Source', 'Items', 'Payment', 'Status', 'Original Reference', 'Total'], ledgerRows)}
        </section>

        <div class="signatures">
            <div class="signature-line">Prepared by</div>
            <div class="signature-line">Checked by</div>
        </div>
    </main>
</body>
</html>`;
}

const SalesReport = () => {
    const { isAdmin, user } = useAuth();
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
    const [isHistoricalEditorOpen, setIsHistoricalEditorOpen] = useState(false);
    const [editingHistoricalSale, setEditingHistoricalSale] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
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

    const handleHistoricalSaved = async (saved) => {
        await loadSalesHistory();

        if (saved?.saleId) {
            await handleOpenSale(saved.saleId);
        } else if (saved?.sale?.id) {
            await handleOpenSale(saved.sale.id);
        }
    };

    const handleExport = useCallback(async () => {
        setIsExporting(true);
        setError('');

        try {
            const reportWindow = window.open('', '_blank');
            if (!reportWindow) {
                throw new Error('Please allow pop-ups to print or save the PDF report.');
            }

            reportWindow.document.write('<p style="font-family:Arial,sans-serif;padding:24px;">Preparing LimenServe report...</p>');
            const exportedSales = [];
            let page = 1;
            let hasMore = true;

            while (hasMore && page <= 20) {
                const { sales, pagination } = await listPosSales({
                    startDate: filters.startDate,
                    endDate: filters.endDate,
                    search: historySearch || null,
                    limit: 100,
                    page,
                });

                exportedSales.push(...(sales ?? []).filter((sale) => !isDemoSale(sale)));
                hasMore = Boolean(pagination?.hasMore);
                page += 1;
            }

            const generatedAt = new Date();
            const generatedBy = user?.fullName || user?.email || 'LimenServe user';
            const reportHtml = buildPrintableSalesReport({
                filters,
                generatedAt,
                generatedBy,
                historySearch,
                topSellingItems,
                itemTrend,
                peakPeriods,
                exportedSales,
                trendRevenue,
                lowStockRiskCount: toReportNumber(dashboardSnapshot?.predictedLowStockRisk?.length),
            });

            reportWindow.document.open();
            reportWindow.document.write(reportHtml);
            reportWindow.document.close();
            reportWindow.document.title = `limenserve-sales-report-${filters.startDate}-to-${filters.endDate}-${buildReportStamp(generatedAt)}`;
            reportWindow.focus();
            window.setTimeout(() => reportWindow.print(), 400);
        } catch (exportError) {
            setError(exportError.message || 'Unable to export the report.');
        } finally {
            setIsExporting(false);
        }
    }, [
        filters,
        historySearch,
        itemTrend,
        peakPeriods,
        topSellingItems,
        trendRevenue,
        user?.email,
        user?.fullName,
        dashboardSnapshot?.predictedLowStockRisk?.length,
    ]);

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
                    {isAdmin && (
                        <Button
                            variant="primary"
                            leftIcon={<FilePlus2 className="w-4 h-4" />}
                            onClick={() => {
                                setEditingHistoricalSale(null);
                                setIsHistoricalEditorOpen(true);
                            }}
                        >
                            Encode Historical Sale
                        </Button>
                    )}
                    <Button variant="secondary" leftIcon={<RefreshCw className="w-4 h-4" />} isLoading={refreshing} onClick={handleRefresh}>Refresh Analytics</Button>
                    <Button
                        variant="outline"
                        leftIcon={<Download className="w-4 h-4" />}
                        isLoading={isExporting}
                        onClick={handleExport}
                    >
                        Print PDF
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-accent-blue/30 bg-accent-blue/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-blue">Current Report</p>
                    <p className="mt-1 text-lg font-display font-bold text-primary-950">Sales Analytics</p>
                    <p className="mt-1 text-sm text-primary-600">Revenue, item movement, encoded historical sales, and printable sales reports.</p>
                </div>
                <Link
                    to="/reports/inventory"
                    className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm transition hover:border-accent-blue/40 hover:shadow-md"
                >
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">Switch Report</p>
                    <p className="mt-1 text-lg font-display font-bold text-primary-950">Inventory Summary</p>
                    <p className="mt-1 text-sm text-primary-600">Catalog totals, movement ledger, archived items, and inventory audit PDF.</p>
                </Link>
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
                    <div className="grid gap-3 md:hidden">
                        {topSellingItems.map((item) => (
                            <div key={item.product_id} className="rounded-xl border border-primary-200 bg-white px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-primary-950">{item.product_name}</p>
                                        <p className="text-xs font-mono text-primary-500">{item.sku}</p>
                                        <p className="mt-1 text-xs text-primary-500">{item.category}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-accent-blue">{formatCurrency(item.revenue)}</p>
                                        <p className="text-xs text-primary-500">{formatNumber(item.quantity)} units</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {!loading && topSellingItems.length === 0 && (
                            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-center text-sm text-primary-500">
                                No item sales data matched the selected filters.
                            </div>
                        )}
                        {loading && (
                            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-center text-sm text-primary-500">
                                Loading top-selling items...
                            </div>
                        )}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
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
                    <div className="grid gap-3 md:hidden">
                        {peakPeriods.map((item) => (
                            <div key={`${item.product_id}-${item.peak_month}`} className="rounded-xl border border-primary-200 bg-white px-4 py-3">
                                <p className="font-semibold text-primary-950">{item.product_name}</p>
                                <p className="text-xs font-mono text-primary-500">{item.sku}</p>
                                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-primary-400">Peak Month</p>
                                        <p className="font-semibold text-primary-900">{new Date(item.peak_month).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs uppercase tracking-wide text-primary-400">Revenue</p>
                                        <p className="font-semibold text-accent-blue">{formatCurrency(item.peak_revenue)}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {!loading && peakPeriods.length === 0 && (
                            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-center text-sm text-primary-500">
                                No peak-period data matched the selected filters.
                            </div>
                        )}
                        {loading && (
                            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-center text-sm text-primary-500">
                                Loading peak-period data...
                            </div>
                        )}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
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
                subtitle="Receipt-level ledger of live POS and admin-encoded historical sales."
                headerAction={(
                    <div className="w-full sm:w-72">
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

                <div className="grid gap-3 md:hidden">
                    {salesHistory.map((sale) => (
                        <button
                            type="button"
                            key={sale.sale_id}
                            onClick={() => handleOpenSale(sale.sale_id)}
                            className="rounded-xl border border-primary-200 bg-white px-4 py-3 text-left shadow-sm"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-primary-950">{sale.transaction_number}</p>
                                    <p className="mt-1 text-sm text-primary-500">{sale.customer_name}</p>
                                    <p className="text-xs text-primary-400">{formatDateTime(sale.saleAt || sale.sale_at || sale.created_at)}</p>
                                </div>
                                <p className="font-semibold text-accent-blue">{formatCurrency(sale.total_amount)}</p>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full border border-primary-200 px-2.5 py-1 font-semibold uppercase tracking-wide text-primary-500">
                                    {sale.item_count} items
                                </span>
                                <span className="rounded-full border border-primary-200 px-2.5 py-1 font-semibold uppercase tracking-wide text-primary-500">
                                    {PAYMENT_LABELS[sale.payment_method] || sale.payment_method}
                                </span>
                                <span className={`rounded-full border px-2.5 py-1 font-semibold uppercase tracking-wide ${sale.sourceType === 'historical_encoded'
                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                    : 'border-accent-success/20 bg-accent-success/10 text-accent-success'
                                    }`}>
                                    {sale.sourceType === 'historical_encoded' ? 'Historical' : 'POS'}
                                </span>
                            </div>
                        </button>
                    ))}
                    {!historyLoading && salesHistory.length === 0 && (
                        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-center text-sm text-primary-500">
                            No sales matched the selected filters yet.
                        </div>
                    )}
                    {historyLoading && (
                        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-center text-sm text-primary-500">
                            Loading sales history...
                        </div>
                    )}
                </div>

                <div className="hidden overflow-x-auto md:block">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Receipt</th>
                                <th>Date / Time</th>
                                <th>Customer</th>
                                <th>Cashier</th>
                                <th>Source</th>
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
                                            <span className="text-xs text-primary-500">
                                                {sale.originalReference ? `Ref ${sale.originalReference}` : `Business date ${sale.business_date}`}
                                            </span>
                                        </div>
                                    </td>
                                    <td>{formatDateTime(sale.saleAt || sale.sale_at || sale.created_at)}</td>
                                    <td>{sale.customer_name}</td>
                                    <td>{sale.cashier_name}</td>
                                    <td>
                                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${sale.sourceType === 'historical_encoded'
                                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                                            : 'border-accent-success/20 bg-accent-success/10 text-accent-success'
                                            }`}>
                                            {sale.sourceType === 'historical_encoded' ? 'Historical' : 'POS'}
                                        </span>
                                    </td>
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
                                    <td colSpan="9" className="py-8 text-center text-primary-500">No sales matched the selected filters yet.</td>
                                </tr>
                            )}
                            {historyLoading && (
                                <tr>
                                    <td colSpan="9" className="py-8 text-center text-primary-500">Loading sales history...</td>
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
                            {isAdmin && selectedSale?.sale?.sourceType === 'historical_encoded' && (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setEditingHistoricalSale(selectedSale);
                                        setSelectedSale(null);
                                        setIsHistoricalEditorOpen(true);
                                    }}
                                >
                                    Edit Historical Entry
                                </Button>
                            )}
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

            {isAdmin && (
                <HistoricalSaleEditorModal
                    isOpen={isHistoricalEditorOpen}
                    onClose={() => {
                        setIsHistoricalEditorOpen(false);
                        setEditingHistoricalSale(null);
                    }}
                    onSaved={(saved) => void handleHistoricalSaved(saved)}
                    saleDetail={editingHistoricalSale}
                />
            )}
        </div>
    );
};

export default SalesReport;

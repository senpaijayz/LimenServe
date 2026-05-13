import { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Boxes, ClipboardList, Download, PackageCheck, Printer, RefreshCw, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card, { KPICard } from '../../../components/ui/Card';
import { getArchivedCatalogProducts, getCatalogSummary, getInventoryMovements } from '../../../services/catalogApi';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/formatters';

const MOVEMENT_LABELS = {
    stock_in: 'Stock In', stock_out: 'Stock Out', adjustment: 'Adjustment',
    reservation: 'Reservation', release: 'Release', sale: 'Sale', service_usage: 'Service Usage',
};

const MOVEMENT_COLORS = {
    stock_in: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    stock_out: 'bg-red-50 text-red-700 border-red-200',
    sale: 'bg-blue-50 text-blue-700 border-blue-200',
    adjustment: 'bg-amber-50 text-amber-700 border-amber-200',
    service_usage: 'bg-purple-50 text-purple-700 border-purple-200',
};

const DATE_RANGE_OPTIONS = [
    { value: '7d', label: 'Last 7 Days' }, { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' }, { value: 'all', label: 'All Time' },
];

function isWithinRange(dateStr, range) {
    if (range === 'all') return true;
    const date = new Date(dateStr);
    if (isNaN(date)) return true;
    const ms = { '7d': 604800000, '30d': 2592000000, '90d': 7776000000 };
    return Date.now() - date.getTime() <= ms[range];
}

function exportMovementsCsv(movements) {
    const headers = ['Product', 'SKU', 'Action', 'Qty', 'Reference', 'Staff', 'Date', 'Notes'];
    const rows = movements.map((m) => [
        m.productName || '', m.sku || '', MOVEMENT_LABELS[m.movementType] || m.movementType || '',
        m.quantity ?? '', m.referenceType || '', m.performedBy || '', formatDateTime(m.createdAt), m.notes || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `inventory-movements-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
}

/* ── Inline printable report section ─────────────────────────── */
function PrintableReport({ summary, movements, archivedProducts, dateRangeLabel }) {
    const generatedAt = formatDateTime(new Date());
    const movedQty = movements.reduce((s, m) => s + Number(m.quantity ?? 0), 0);
    const uniqueProducts = new Set(movements.map((m) => m.productId).filter(Boolean)).size;
    const stockInQty = movements.filter(m => m.movementType === 'stock_in').reduce((s, m) => s + Number(m.quantity ?? 0), 0);
    const stockOutQty = movements.filter(m => ['stock_out', 'sale', 'service_usage'].includes(m.movementType)).reduce((s, m) => s + Number(m.quantity ?? 0), 0);

    return (
        <div id="printable-report" className="print-report bg-white rounded-2xl border border-primary-200 shadow-sm overflow-hidden">
            {/* Report Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-8 py-6 print:bg-slate-900">
                <div className="flex items-start justify-between gap-6">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">LimenServe Inventory Control</p>
                        <h1 className="mt-2 text-2xl font-bold tracking-tight">Inventory Audit Report</h1>
                        <p className="mt-1 text-sm text-slate-300">Limen Auto Supply and Services</p>
                        <p className="text-xs text-slate-400 mt-1">Contact: (0915) 522 5629 | Landline: 0285513518</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Report Generated</p>
                        <p className="mt-1 text-sm font-semibold text-white">{generatedAt}</p>
                        <p className="mt-1 text-xs text-slate-400">Period: {dateRangeLabel}</p>
                    </div>
                </div>
            </div>

            {/* KPI Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-b border-primary-200">
                {[
                    { label: 'Catalog Products', value: formatNumber(summary?.totalProducts ?? 0), accent: 'text-blue-600' },
                    { label: 'Unique SKUs', value: formatNumber(summary?.uniqueProducts ?? 0), accent: 'text-indigo-600' },
                    { label: 'Active Prices', value: formatNumber(summary?.currentPrices ?? 0), accent: 'text-cyan-600' },
                    { label: 'Movement Records', value: formatNumber(movements.length), accent: 'text-amber-600' },
                    { label: 'Total Stock In', value: `+${formatNumber(stockInQty)}`, accent: 'text-emerald-600' },
                    { label: 'Total Stock Out', value: formatNumber(stockOutQty), accent: 'text-red-600' },
                ].map((kpi, i) => (
                    <div key={i} className="px-5 py-4 border-r border-primary-100 last:border-r-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-400">{kpi.label}</p>
                        <p className={`mt-1 text-xl font-bold ${kpi.accent}`}>{kpi.value}</p>
                    </div>
                ))}
            </div>

            {/* Movement Ledger Table */}
            <div className="px-8 py-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-base font-bold text-primary-950">Inventory Movement Ledger</h2>
                        <p className="text-xs text-primary-500 mt-0.5">{formatNumber(movements.length)} records · {formatNumber(uniqueProducts)} products · {formatNumber(movedQty)} units moved</p>
                    </div>
                </div>

                {movements.length === 0 ? (
                    <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">
                        No inventory movement records found for this period.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-primary-200">
                        <table className="min-w-full divide-y divide-primary-100 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500 w-8">#</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Product</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Action</th>
                                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Qty</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Reference</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Performed By</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Date</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-primary-100 bg-white">
                                {movements.map((m, idx) => (
                                    <tr key={m.id} className="hover:bg-primary-50/40 print:hover:bg-transparent">
                                        <td className="px-3 py-2 text-primary-400 text-xs">{idx + 1}</td>
                                        <td className="px-3 py-2">
                                            <p className="font-semibold text-primary-950">{m.productName}</p>
                                            <p className="font-mono text-[11px] text-primary-400">{m.sku || 'NO SKU'}</p>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${MOVEMENT_COLORS[m.movementType] || 'bg-primary-50 text-primary-600 border-primary-200'}`}>
                                                {MOVEMENT_LABELS[m.movementType] || m.movementType}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-bold text-primary-950">{formatNumber(m.quantity)}</td>
                                        <td className="px-3 py-2 text-primary-600 text-xs">{m.referenceType || '—'}</td>
                                        <td className="px-3 py-2 text-primary-700 text-xs">{m.performedBy || 'System'}</td>
                                        <td className="px-3 py-2 text-primary-600 text-xs whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                                        <td className="px-3 py-2 text-primary-500 text-xs max-w-[180px] truncate">{m.notes || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Archived Products */}
            {archivedProducts.length > 0 && (
                <div className="px-8 py-6 border-t border-primary-200">
                    <h2 className="text-base font-bold text-primary-950 mb-1">Archived Products</h2>
                    <p className="text-xs text-primary-500 mb-4">{archivedProducts.length} products removed from active catalog</p>
                    <div className="overflow-x-auto rounded-xl border border-primary-200">
                        <table className="min-w-full divide-y divide-primary-100 text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Product</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">SKU</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Category</th>
                                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Qty</th>
                                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Price</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-primary-500">Archived</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-primary-100 bg-white">
                                {archivedProducts.map((p) => (
                                    <tr key={p.id}>
                                        <td className="px-3 py-2 font-semibold text-primary-950">{p.name}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-primary-500">{p.sku || 'NO SKU'}</td>
                                        <td className="px-3 py-2 text-primary-600 text-xs">{p.category || '—'}</td>
                                        <td className="px-3 py-2 text-right font-bold text-primary-950">{formatNumber(p.stock ?? 0)}</td>
                                        <td className="px-3 py-2 text-right text-primary-700">{formatCurrency(p.price ?? 0)}</td>
                                        <td className="px-3 py-2 text-primary-500 text-xs">{formatDateTime(p.archivedAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Signatures */}
            <div className="px-8 py-8 border-t border-primary-200">
                <div className="grid grid-cols-3 gap-12">
                    {['Prepared By', 'Checked By', 'Approved By'].map((label) => (
                        <div key={label} className="text-center">
                            <div className="h-12" />
                            <div className="border-t border-primary-900 pt-2">
                                <p className="text-xs font-bold text-primary-600">{label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-3 bg-slate-50 border-t border-primary-200 text-center">
                <p className="text-[10px] text-primary-400">
                    This report is generated from LimenServe inventory movement records and should be reconciled with physical stock counts during audit.
                </p>
            </div>
        </div>
    );
}

/* ── Print CSS injected via style tag ────────────────────────── */
const PRINT_STYLES = `
@media print {
    body * { visibility: hidden !important; }
    #printable-report, #printable-report * { visibility: visible !important; }
    #printable-report {
        position: absolute !important; left: 0 !important; top: 0 !important;
        width: 100% !important; border: none !important; border-radius: 0 !important;
        box-shadow: none !important; margin: 0 !important;
    }
    @page { size: A4 landscape; margin: 8mm; }
    .no-print { display: none !important; }
}
`;

export default function InventoryReport() {
    const [summary, setSummary] = useState(null);
    const [movements, setMovements] = useState([]);
    const [archivedProducts, setArchivedProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [dateRange, setDateRange] = useState('30d');
    const [showReport, setShowReport] = useState(false);

    const filteredMovements = useMemo(() => movements.filter((m) => isWithinRange(m.createdAt, dateRange)), [movements, dateRange]);
    const dateRangeLabel = DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label || dateRange;

    const movementStats = useMemo(() => {
        const movedQuantity = filteredMovements.reduce((sum, m) => sum + Number(m.quantity ?? 0), 0);
        const types = new Set(filteredMovements.map((m) => m.movementType).filter(Boolean)).size;
        return { movedQuantity, types };
    }, [filteredMovements]);

    const loadReportData = async () => {
        setLoading(true); setError('');
        try {
            const [s, m, a] = await Promise.all([getCatalogSummary(), getInventoryMovements(100), getArchivedCatalogProducts(20)]);
            setSummary(s); setMovements(m); setArchivedProducts(a);
        } catch (e) { setError(e.message || 'Unable to load inventory report data.'); }
        finally { setLoading(false); }
    };

    useEffect(() => { void loadReportData(); }, []);

    const handlePrint = () => {
        setShowReport(true);
        setTimeout(() => window.print(), 300);
    };

    return (
        <div className="space-y-6">
            <style>{PRINT_STYLES}</style>

            {/* Header toolbar — hidden in print */}
            <div className="no-print flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-blue">Inventory Reports</p>
                    <h2 className="mt-2 text-2xl font-display font-bold text-primary-950">Inventory Summary & Audit</h2>
                    <p className="mt-1 max-w-3xl text-sm text-primary-500">
                        Live catalog totals, movement ledger, and archived-product visibility with inline printable report.
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
                        className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-700 focus:outline-none focus:border-accent-blue shadow-sm">
                        {DATE_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} isLoading={loading} onClick={loadReportData}>Refresh</Button>
                    <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />} onClick={() => exportMovementsCsv(filteredMovements)} disabled={filteredMovements.length === 0}>Export CSV</Button>
                    <Button variant="secondary" leftIcon={showReport ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        onClick={() => setShowReport(!showReport)}>{showReport ? 'Hide Report' : 'Preview Report'}</Button>
                    <Button variant="primary" leftIcon={<Printer className="h-4 w-4" />} onClick={handlePrint}>Print Report</Button>
                </div>
            </div>

            {error && <div className="no-print rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">{error}</div>}

            {/* Report switch cards — hidden in print */}
            <div className="no-print grid gap-3 md:grid-cols-2">
                <Link to="/reports/sales" className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm transition hover:border-accent-blue/40 hover:shadow-md">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">Switch Report</p>
                    <p className="mt-1 text-lg font-display font-bold text-primary-950">Sales Analytics</p>
                    <p className="mt-1 text-sm text-primary-600">Revenue, item movement, encoded historical sales, and printable sales reports.</p>
                </Link>
                <div className="rounded-2xl border border-accent-blue/30 bg-accent-blue/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-blue">Current Report</p>
                    <p className="mt-1 text-lg font-display font-bold text-primary-950">Inventory Summary</p>
                    <p className="mt-1 text-sm text-primary-600">Catalog totals, movement ledger, archived items, and inventory audit.</p>
                </div>
            </div>

            {/* KPI Cards — hidden in print */}
            <div className="no-print grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KPICard title="Catalog Rows" value={formatNumber(summary?.totalProducts ?? 0)} icon={<Boxes className="h-6 w-6" />} />
                <KPICard title="Unique SKUs" value={formatNumber(summary?.uniqueProducts ?? 0)} icon={<PackageCheck className="h-6 w-6" />} />
                <KPICard title="Movement Rows" value={formatNumber(movements.length)} icon={<ClipboardList className="h-6 w-6" />} />
                <KPICard title="Archived Products" value={formatNumber(archivedProducts.length)} icon={<Archive className="h-6 w-6" />} />
            </div>

            {/* Quick movement preview — hidden in print, hidden when full report is shown */}
            {!showReport && (
                <div className="no-print grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
                    <Card title="Recent Inventory Movements" subtitle={`Total moved: ${formatNumber(movementStats.movedQuantity)} across ${formatNumber(movementStats.types)} action types.`}>
                        {loading ? (
                            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">Loading...</div>
                        ) : filteredMovements.length === 0 ? (
                            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">No movement records in selected range.</div>
                        ) : (
                            <div className="overflow-x-auto rounded-2xl border border-primary-200">
                                <table className="min-w-full divide-y divide-primary-100 bg-white text-sm">
                                    <thead className="bg-primary-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Product</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Action</th>
                                            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Qty</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Staff</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-primary-100">
                                        {filteredMovements.slice(0, 12).map((m) => (
                                            <tr key={m.id} className="hover:bg-primary-50/60">
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-primary-950">{m.productName}</p>
                                                    <p className="font-mono text-xs text-primary-500">{m.sku || 'NO SKU'}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${MOVEMENT_COLORS[m.movementType] || 'bg-primary-50 text-primary-600 border-primary-200'}`}>
                                                        {MOVEMENT_LABELS[m.movementType] || m.movementType}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-primary-950">{formatNumber(m.quantity)}</td>
                                                <td className="px-4 py-3 text-primary-600">{m.performedBy}</td>
                                                <td className="px-4 py-3 text-primary-600">{formatDateTime(m.createdAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {filteredMovements.length > 12 && (
                            <p className="mt-3 text-center text-xs text-primary-400">
                                Showing 12 of {filteredMovements.length} records. Click "Preview Report" to see all.
                            </p>
                        )}
                    </Card>

                    <Card title="Archived Products" subtitle="Products hidden from active selling flows.">
                        {loading ? (
                            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">Loading...</div>
                        ) : archivedProducts.length === 0 ? (
                            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">No archived products found.</div>
                        ) : (
                            <div className="space-y-3">
                                {archivedProducts.slice(0, 8).map((p) => (
                                    <div key={p.id} className="rounded-2xl border border-primary-200 bg-white p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-primary-950">{p.name}</p>
                                                <p className="mt-1 font-mono text-xs text-primary-500">{p.sku || 'NO SKU'}</p>
                                            </div>
                                            <p className="text-sm font-bold text-accent-blue">{formatCurrency(p.price ?? 0)}</p>
                                        </div>
                                        <p className="mt-2 text-xs text-primary-500">Qty {formatNumber(p.stock ?? 0)} | Archived {formatDateTime(p.archivedAt)}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {/* Full inline printable report — shown when preview is toggled or always visible for print */}
            {showReport && !loading && (
                <PrintableReport summary={summary} movements={filteredMovements} archivedProducts={archivedProducts} dateRangeLabel={dateRangeLabel} />
            )}
        </div>
    );
}

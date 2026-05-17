import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Boxes, ClipboardList, Download, PackageCheck, Printer, RefreshCw } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card, { KPICard } from '../../../components/ui/Card';
import { getArchivedCatalogProducts, getCatalogSummary, getInventoryMovements } from '../../../services/catalogApi';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/formatters';
import { useAuth } from '../../../context/useAuth';

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
    const headers = ['Product', 'Part Number', 'Action', 'Qty', 'Reference', 'Staff', 'Date', 'Notes'];
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
                <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${safeRows.map((row) => `
                    <tr>${headers.map((_, i) => `<td>${escapeHtml(row[i] ?? '')}</td>`).join('')}</tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

/* ── Build full-page printable HTML (same pattern as SalesReport) ── */
function buildPrintableInventoryReport({
    summary,
    movements,
    archivedProducts,
    dateRangeLabel,
    generatedAt,
    generatedBy,
}) {
    const stockInQty = movements.filter(m => m.movementType === 'stock_in').reduce((s, m) => s + Number(m.quantity ?? 0), 0);
    const stockOutQty = movements.filter(m => ['stock_out', 'sale', 'service_usage'].includes(m.movementType)).reduce((s, m) => s + Number(m.quantity ?? 0), 0);
    const movedQty = movements.reduce((s, m) => s + Number(m.quantity ?? 0), 0);
    const uniqueProducts = new Set(movements.map((m) => m.productId).filter(Boolean)).size;

    const movementRows = movements.map((m, idx) => [
        String(idx + 1),
        m.productName || '',
        m.sku || 'No part number',
        MOVEMENT_LABELS[m.movementType] || m.movementType || '',
        formatNumber(m.quantity),
        m.referenceType || '—',
        m.performedBy || 'System',
        formatDateTime(m.createdAt),
        m.notes || '—',
    ]);

    const archivedRows = archivedProducts.map((p) => [
        p.name || '',
        p.sku || 'No part number',
        p.category || '—',
        formatNumber(p.stock ?? 0),
        formatCurrency(p.price ?? 0),
        formatDateTime(p.archivedAt),
    ]);

    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <title>LimenServe Inventory Audit Report — ${escapeHtml(dateRangeLabel)}</title>
    <style>
        @page { size: A4 landscape; margin: 10mm; }
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
        .contact {
            margin-top: 2px;
            color: #94a3b8;
            font-size: 9px;
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
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 8px;
            margin-bottom: 14px;
        }
        .kpi-card {
            border: 1px solid #dbe3ef;
            border-radius: 10px;
            padding: 8px 10px;
            background: #ffffff;
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
            font-size: 12px;
            font-weight: 700;
        }
        .value.green { color: #059669; }
        .value.red { color: #dc2626; }
        section {
            margin-top: 14px;
            break-inside: avoid;
        }
        h2 {
            margin: 0 0 4px;
            color: #0f172a;
            font-size: 13px;
        }
        .section-sub {
            color: #64748b;
            font-size: 9px;
            margin: 0 0 7px;
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
            grid-template-columns: repeat(3, 1fr);
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
        .footer-note {
            margin-top: 16px;
            padding: 8px;
            text-align: center;
            color: #94a3b8;
            font-size: 9px;
            border-top: 1px solid #e2e8f0;
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
                <div class="brand-kicker">LimenServe Inventory Control</div>
                <h1>Inventory Audit Report</h1>
                <div class="company">Limen Auto Supply and Services</div>
                <div class="contact">Contact: (0915) 522 5629 | Landline: 0285513518</div>
            </div>
            <div class="meta-box">
                <strong>Period: ${escapeHtml(dateRangeLabel)}</strong>
                <span>Generated ${escapeHtml(formatDateTime(generatedAt))}</span>
                <span>By ${escapeHtml(generatedBy)}</span>
            </div>
        </header>

        <div class="kpi-grid">
            <div class="kpi-card"><div class="label">Catalog Products</div><div class="value">${escapeHtml(formatNumber(summary?.totalProducts ?? 0))}</div></div>
            <div class="kpi-card"><div class="label">Unique Part Numbers</div><div class="value">${escapeHtml(formatNumber(summary?.uniqueProducts ?? 0))}</div></div>
            <div class="kpi-card"><div class="label">Active Prices</div><div class="value">${escapeHtml(formatNumber(summary?.currentPrices ?? 0))}</div></div>
            <div class="kpi-card"><div class="label">Movement Records</div><div class="value">${escapeHtml(formatNumber(movements.length))}</div></div>
            <div class="kpi-card"><div class="label">Total Stock In</div><div class="value green">+${escapeHtml(formatNumber(stockInQty))}</div></div>
            <div class="kpi-card"><div class="label">Total Stock Out</div><div class="value red">${escapeHtml(formatNumber(stockOutQty))}</div></div>
        </div>

        <section>
            <h2>Inventory Movement Ledger</h2>
            <div class="section-sub">${escapeHtml(formatNumber(movements.length))} records · ${escapeHtml(formatNumber(uniqueProducts))} products · ${escapeHtml(formatNumber(movedQty))} units moved</div>
            ${renderReportTable(['#', 'Product', 'Part Number', 'Action', 'Qty', 'Reference', 'Performed By', 'Date', 'Notes'], movementRows, 'No inventory movement records found for this period.')}
        </section>

        ${archivedProducts.length > 0 ? `
        <section>
            <h2>Archived Products</h2>
            <div class="section-sub">${escapeHtml(String(archivedProducts.length))} products removed from active catalog</div>
            ${renderReportTable(['Product', 'Part Number', 'Category', 'Qty', 'Price', 'Archived'], archivedRows)}
        </section>
        ` : ''}

        <div class="signatures">
            <div class="signature-line">Prepared By</div>
            <div class="signature-line">Checked By</div>
            <div class="signature-line">Approved By</div>
        </div>

        <div class="footer-note">
            This report is generated from LimenServe inventory movement records and should be reconciled with physical stock counts during audit.
        </div>
    </main>
</body>
</html>`;
}

export default function InventoryReport() {
    const { user } = useAuth();
    const [summary, setSummary] = useState(null);
    const [movements, setMovements] = useState([]);
    const [archivedProducts, setArchivedProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [dateRange, setDateRange] = useState('30d');
    const [isExporting, setIsExporting] = useState(false);

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

    const handlePrint = useCallback(() => {
        setIsExporting(true);
        setError('');

        try {
            const reportWindow = window.open('', '_blank');
            if (!reportWindow) {
                throw new Error('Please allow pop-ups to print or save the PDF report.');
            }

            reportWindow.document.write('<p style="font-family:Arial,sans-serif;padding:24px;">Preparing LimenServe inventory report...</p>');

            const generatedAt = new Date();
            const generatedBy = user?.fullName || user?.email || 'LimenServe user';
            const reportHtml = buildPrintableInventoryReport({
                summary,
                movements: filteredMovements,
                archivedProducts,
                dateRangeLabel,
                generatedAt,
                generatedBy,
            });

            reportWindow.document.open();
            reportWindow.document.write(reportHtml);
            reportWindow.document.close();
            reportWindow.document.title = `limenserve-inventory-report-${dateRangeLabel.replace(/\s+/g, '-').toLowerCase()}-${generatedAt.toISOString().slice(0, 10)}`;
            reportWindow.focus();
            window.setTimeout(() => reportWindow.print(), 400);
        } catch (exportError) {
            setError(exportError.message || 'Unable to export the report.');
        } finally {
            setIsExporting(false);
        }
    }, [summary, filteredMovements, archivedProducts, dateRangeLabel, user?.fullName, user?.email]);

    return (
        <div className="space-y-6">
            {/* Header toolbar */}
            <div className="flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-blue">Inventory Reports</p>
                    <h2 className="mt-2 text-2xl font-display font-bold text-primary-950">Inventory Summary & Audit</h2>
                    <p className="mt-1 max-w-3xl text-sm text-primary-500">
                        Live catalog totals, movement ledger, and archived-product visibility with printable report.
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
                        className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-700 focus:outline-none focus:border-accent-blue shadow-sm">
                        {DATE_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} isLoading={loading} onClick={loadReportData}>Refresh</Button>
                    <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />} onClick={() => exportMovementsCsv(filteredMovements)} disabled={filteredMovements.length === 0}>Export CSV</Button>
                    <Button variant="primary" leftIcon={<Printer className="h-4 w-4" />} isLoading={isExporting} onClick={handlePrint}>Print Report</Button>
                </div>
            </div>

            {error && <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">{error}</div>}

            {/* Report switch cards */}
            <div className="grid gap-3 md:grid-cols-2">
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

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KPICard title="Catalog Rows" value={formatNumber(summary?.totalProducts ?? 0)} icon={<Boxes className="h-6 w-6" />} />
                <KPICard title="Unique Part Numbers" value={formatNumber(summary?.uniqueProducts ?? 0)} icon={<PackageCheck className="h-6 w-6" />} />
                <KPICard title="Movement Rows" value={formatNumber(movements.length)} icon={<ClipboardList className="h-6 w-6" />} />
                <KPICard title="Archived Products" value={formatNumber(archivedProducts.length)} icon={<Archive className="h-6 w-6" />} />
            </div>

            {/* Quick movement preview */}
            <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
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
                                                <p className="font-mono text-xs text-primary-500">{m.sku || 'No part number'}</p>
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
                            Showing 12 of {filteredMovements.length} records. Click &quot;Print Report&quot; to see all.
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
                                            <p className="mt-1 font-mono text-xs text-primary-500">{p.sku || 'No part number'}</p>
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
        </div>
    );
}

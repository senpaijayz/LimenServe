import { useDeferredValue, useEffect, useMemo, useState, useCallback } from 'react';
import { ClipboardList, Download, Printer, RefreshCw, Search, X } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Dropdown from '../../../components/ui/Dropdown';
import { getInventoryMovements } from '../../../services/catalogApi';
import { formatDateTime, formatNumber } from '../../../utils/formatters';

const MOVEMENT_LABELS = {
    stock_in: 'Stock In',
    stock_out: 'Stock Out',
    adjustment: 'Adjustment',
    reservation: 'Reservation',
    release: 'Release',
    sale: 'Sale',
    service_usage: 'Service Usage',
    archive: 'Archived',
    restore: 'Restored',
};

const MOVEMENT_BADGE = {
    stock_in: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    sale: 'bg-red-100 text-red-700 border-red-200',
    stock_out: 'bg-red-100 text-red-700 border-red-200',
    service_usage: 'bg-orange-100 text-orange-700 border-orange-200',
    adjustment: 'bg-blue-100 text-blue-700 border-blue-200',
    archive: 'bg-gray-100 text-gray-700 border-gray-200',
    restore: 'bg-purple-100 text-purple-700 border-purple-200',
    reservation: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    release: 'bg-teal-100 text-teal-700 border-teal-200',
};

const TYPE_OPTIONS = [
    { value: 'all', label: 'All Types' },
    ...Object.entries(MOVEMENT_LABELS).map(([v, l]) => ({ value: v, label: l })),
];

const DATE_RANGE_OPTIONS = [
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: 'all', label: 'All Time' },
];

function escapeHtml(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isWithinRange(dateStr, range) {
    if (range === 'all') return true;
    const date = new Date(dateStr);
    if (isNaN(date)) return true;
    const now = Date.now();
    const ms = { '24h': 86400000, '7d': 604800000, '30d': 2592000000, '90d': 7776000000 };
    return now - date.getTime() <= ms[range];
}

function exportToExcel(movements) {
    const headers = ['#', 'Product', 'Part Number', 'Action', 'Prev Stock', 'Change', 'New Stock', 'Supplier', 'Reference', 'Staff', 'Date/Time', 'Notes'];
    const rows = movements.map((m, i) => [
        i + 1,
        m.productName || 'Unknown',
        m.sku || '',
        MOVEMENT_LABELS[m.movementType] || m.movementType || '',
        m.previousStock ?? '',
        m.quantity ?? '',
        m.newStock ?? '',
        m.supplierName || m.supplier || '',
        m.referenceNumber || m.referenceType || '',
        m.performedBy || '',
        formatDateTime(m.createdAt),
        m.notes || '',
    ]);

    const csvLines = [headers, ...rows].map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function printLogs(movements) {
    const win = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=800');
    if (!win) return;
    const rows = movements.map((m, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${escapeHtml(m.productName)}</strong><br/><span class="mono">${escapeHtml(m.sku)}</span></td>
            <td>${escapeHtml(MOVEMENT_LABELS[m.movementType] || m.movementType)}</td>
            <td>${escapeHtml(m.previousStock ?? '—')}</td>
            <td>${escapeHtml(m.quantity)}</td>
            <td>${escapeHtml(m.newStock ?? '—')}</td>
            <td>${escapeHtml(m.supplierName || m.supplier || '—')}</td>
            <td class="mono">${escapeHtml(m.referenceNumber || m.referenceType || '—')}</td>
            <td>${escapeHtml(m.performedBy)}</td>
            <td>${escapeHtml(formatDateTime(m.createdAt))}</td>
        </tr>`).join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
    <title>Inventory Logs — LimenServe</title>
    <style>
        @page{size:A4 landscape;margin:12mm}
        *{box-sizing:border-box}
        body{margin:0;font-family:"Segoe UI",Arial,sans-serif;font-size:10px;color:#0f172a}
        header{display:flex;justify-content:space-between;padding-bottom:10px;border-bottom:2px solid #1d4ed8;margin-bottom:14px}
        h1{margin:0;font-size:20px}
        p{margin:3px 0;color:#475569}
        table{width:100%;border-collapse:collapse;font-size:9px}
        th{background:#eaf0f8;text-align:left;padding:5px 6px;font-size:8px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #cbd5e1}
        td{padding:5px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}
        tr:nth-child(even) td{background:#f8fafc}
        .mono{font-family:monospace;font-size:8px;color:#64748b}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <header><div><h1>Inventory Movement Logs</h1><p>Limen Auto Supply and Services</p><p>Generated: ${formatDateTime(new Date())}</p></div><div style="text-align:right"><p><strong>${movements.length}</strong> records</p></div></header>
    <table><thead><tr><th>#</th><th>Product / Part Number</th><th>Action</th><th>Prev</th><th>Change</th><th>New</th><th>Supplier</th><th>Reference</th><th>Staff</th><th>Date</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=()=>{window.focus();window.print();}</script></body></html>`);
    win.document.close();
}

export default function InventoryLogs() {
    const [allMovements, setAllMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [dateRange, setDateRange] = useState('30d');
    const deferredSearch = useDeferredValue(search);

    const loadData = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const data = await getInventoryMovements(500);
            setAllMovements(data ?? []);
        } catch (e) {
            setError(e.message || 'Failed to load inventory logs.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void loadData(); }, [loadData]);

    const movementModel = useMemo(() => {
        const q = deferredSearch.trim().toLowerCase();
        const filtered = [];
        let stockInCount = 0;
        let salesCount = 0;
        let totalQtyIn = 0;
        let totalQtySold = 0;

        for (const m of allMovements) {
            if (!isWithinRange(m.createdAt, dateRange)) continue;
            if (typeFilter !== 'all' && m.movementType !== typeFilter) continue;
            if (q) {
                const hay = [m.productName, m.sku, m.performedBy, m.referenceNumber, m.referenceType, m.notes, m.supplierName, m.supplier]
                    .filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(q)) continue;
            }

            filtered.push(m);

            if (m.movementType === 'stock_in') {
                stockInCount += 1;
                totalQtyIn += Number(m.quantity ?? 0);
            } else if (m.movementType === 'sale') {
                salesCount += 1;
                totalQtySold += Number(m.quantity ?? 0);
            }
        }

        return {
            filteredMovements: filtered,
            salesCount,
            stockInCount,
            totalQtyIn,
            totalQtySold,
        };
    }, [allMovements, deferredSearch, typeFilter, dateRange]);

    const {
        filteredMovements,
        salesCount,
        stockInCount,
        totalQtyIn,
        totalQtySold,
    } = movementModel;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent-blue">Inventory</p>
                    <h1 className="text-2xl font-bold font-display text-primary-950 tracking-tight mt-0.5">
                        Inventory Logs
                    </h1>
                    <p className="text-sm text-primary-500 mt-0.5">
                        Full audit trail of all stock movements — receiving, sales, adjustments, and more.
                    </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    <Button variant="secondary" leftIcon={<RefreshCw className="w-4 h-4" />} isLoading={loading} onClick={loadData}>
                        Refresh
                    </Button>
                    <Button variant="secondary" leftIcon={<Download className="w-4 h-4" />} onClick={() => exportToExcel(filteredMovements)} disabled={filteredMovements.length === 0}>
                        Export CSV
                    </Button>
                    <Button variant="primary" leftIcon={<Printer className="w-4 h-4" />} onClick={() => printLogs(filteredMovements)} disabled={filteredMovements.length === 0}>
                        Print PDF
                    </Button>
                </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    { label: 'Total Records', value: formatNumber(filteredMovements.length), color: 'text-primary-950' },
                    { label: 'Stock Received', value: `${formatNumber(stockInCount)} entries (${formatNumber(totalQtyIn)} units)`, color: 'text-emerald-700' },
                    { label: 'Sales', value: `${formatNumber(salesCount)} entries (${formatNumber(totalQtySold)} units)`, color: 'text-red-600' },
                    { label: 'Date Range', value: DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label ?? dateRange, color: 'text-accent-blue' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white border border-primary-200 rounded-2xl p-4 shadow-sm">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-400 mb-1">{label}</p>
                        <p className={`text-sm font-bold ${color}`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <Card padding="none">
                <div className="flex flex-wrap gap-3 p-4 border-b border-primary-100 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                        <input
                            type="text"
                            placeholder="Search product, part number, staff, reference..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-primary-200 rounded-xl text-sm text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 shadow-sm"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex-shrink-0 w-44">
                        <Dropdown options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} />
                    </div>
                    <div className="flex-shrink-0 w-44">
                        <Dropdown options={DATE_RANGE_OPTIONS} value={dateRange} onChange={setDateRange} />
                    </div>
                    <p className="text-sm text-primary-400 flex-shrink-0">
                        {formatNumber(filteredMovements.length)} records
                    </p>
                </div>

                {/* Table */}
                {error ? (
                    <div className="px-4 py-8 text-center text-sm text-red-600">{error}</div>
                ) : loading ? (
                    <div className="px-4 py-12 text-center text-sm text-primary-400">Loading inventory logs...</div>
                ) : filteredMovements.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                        <ClipboardList className="w-12 h-12 text-primary-300 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-primary-500">No movement records found</p>
                        <p className="text-xs text-primary-400 mt-1">Try adjusting your search or filters</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-primary-50 border-b border-primary-100">
                                <tr>
                                    {['#', 'Product / Part Number', 'Action', 'Prev Stock', 'Change', 'New Stock', 'Supplier', 'Reference', 'Staff', 'Date & Time', 'Notes'].map((h) => (
                                        <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.12em] text-primary-400 whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-primary-50">
                                {filteredMovements.map((m, i) => {
                                    const badgeClass = MOVEMENT_BADGE[m.movementType] || 'bg-gray-100 text-gray-700 border-gray-200';
                                    const qty = Number(m.quantity ?? 0);
                                    const isPositive = ['stock_in', 'release', 'restore'].includes(m.movementType);
                                    return (
                                        <tr key={m.id ?? i} className="hover:bg-primary-50/60 transition-colors">
                                            <td className="px-4 py-3 text-primary-400 text-xs">{i + 1}</td>
                                            <td className="px-4 py-3 max-w-[200px]">
                                                <p className="font-bold text-primary-950 truncate">{m.productName || 'Unknown'}</p>
                                                <p className="font-mono text-xs text-primary-400">{m.sku || '—'}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeClass}`}>
                                                    {MOVEMENT_LABELS[m.movementType] || m.movementType}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-primary-500 font-mono text-xs">
                                                {m.previousStock != null ? formatNumber(m.previousStock) : '—'}
                                            </td>
                                            <td className="px-4 py-3 font-bold font-mono text-xs">
                                                <span className={isPositive ? 'text-emerald-600' : 'text-red-600'}>
                                                    {isPositive ? '+' : '-'}{formatNumber(Math.abs(qty))}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-primary-700 font-mono text-xs font-bold">
                                                {m.newStock != null ? formatNumber(m.newStock) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-primary-600 text-xs max-w-[120px] truncate">
                                                {m.supplierName || m.supplier || '—'}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-primary-500">
                                                {m.referenceNumber || m.referenceType || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-primary-700 text-xs">
                                                {m.performedBy || 'System'}
                                            </td>
                                            <td className="px-4 py-3 text-primary-500 text-xs whitespace-nowrap">
                                                {formatDateTime(m.createdAt)}
                                            </td>
                                            <td className="px-4 py-3 text-primary-400 text-xs max-w-[160px] truncate">
                                                {m.notes || '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}

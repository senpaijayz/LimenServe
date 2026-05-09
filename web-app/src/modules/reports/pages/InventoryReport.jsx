import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Archive, Boxes, ClipboardList, PackageCheck, Printer, RefreshCw } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card, { KPICard } from '../../../components/ui/Card';
import { getArchivedCatalogProducts, getCatalogSummary, getInventoryMovements } from '../../../services/catalogApi';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/formatters';

const MOVEMENT_LABELS = {
    stock_in: 'Stock In',
    stock_out: 'Stock Out',
    adjustment: 'Adjustment',
    reservation: 'Reservation',
    release: 'Release',
    sale: 'Sale',
    service_usage: 'Service Usage',
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderRows(headers, rows, emptyMessage) {
    const safeRows = rows.length > 0 ? rows : [[emptyMessage, ...Array(Math.max(headers.length - 1, 0)).fill('')]];

    return `
        <table>
            <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
            <tbody>
                ${safeRows.map((row) => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] ?? '')}</td>`).join('')}</tr>`).join('')}
            </tbody>
        </table>
    `;
}

function buildPrintableInventoryReport({ summary, movements, archivedProducts, generatedAt }) {
    const movementRows = movements.map((movement) => [
        movement.productName || 'Unknown product',
        movement.sku || 'NO SKU',
        MOVEMENT_LABELS[movement.movementType] || movement.movementType || 'Movement',
        formatNumber(movement.quantity ?? 0),
        movement.referenceType || '-',
        movement.performedBy || 'System',
        formatDateTime(movement.createdAt),
        movement.notes || '-',
    ]);
    const archiveRows = archivedProducts.map((product) => [
        product.name || 'Unknown product',
        product.sku || 'NO SKU',
        product.category || '-',
        formatNumber(product.stock ?? 0),
        formatCurrency(product.price ?? 0),
        formatDateTime(product.archivedAt),
    ]);
    const movedQuantity = movements.reduce((sum, movement) => sum + Number(movement.quantity ?? 0), 0);

    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <title>LimenServe Inventory Report</title>
    <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #0f172a; background: #fff; font-family: "Segoe UI", Arial, sans-serif; font-size: 10px; line-height: 1.45; }
        header { display: flex; justify-content: space-between; gap: 18px; border-bottom: 2px solid #172554; padding-bottom: 12px; margin-bottom: 12px; }
        .kicker { color: #1d4ed8; font-size: 8px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
        h1 { margin: 3px 0 0; font-size: 22px; color: #0f172a; }
        h2 { margin: 14px 0 7px; color: #0f172a; font-size: 13px; }
        p { margin: 4px 0 0; color: #475569; }
        .meta { min-width: 220px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; text-align: right; }
        .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
        .kpi { border: 1px solid #dbe3ef; border-radius: 10px; padding: 8px; background: #f8fafc; }
        .label { color: #64748b; font-size: 8px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
        .value { margin-top: 3px; color: #0f172a; font-size: 13px; font-weight: 800; }
        table { width: 100%; table-layout: fixed; border-collapse: collapse; border: 1px solid #cbd5e1; }
        th { background: #eaf0f8; color: #334155; font-size: 8px; font-weight: 800; letter-spacing: 0.06em; text-align: left; text-transform: uppercase; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; vertical-align: top; overflow-wrap: anywhere; }
        tr:nth-child(even) td { background: #fbfdff; }
        .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 36px; margin-top: 28px; page-break-inside: avoid; }
        .signature { border-top: 1px solid #334155; padding-top: 7px; text-align: center; color: #475569; font-weight: 700; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
</head>
<body>
    <header>
        <div>
            <div class="kicker">LimenServe Inventory Control</div>
            <h1>Inventory Report</h1>
            <p>Limen Auto Supply and Services</p>
            <p>Contact: (0915) 522 5629 | Landline: 0285513518</p>
        </div>
        <div class="meta">
            <strong>Generated ${escapeHtml(formatDateTime(generatedAt))}</strong>
            <p>Live catalog summary, movement ledger, and archived inventory preview.</p>
        </div>
    </header>

    <section class="kpis">
        <div class="kpi"><div class="label">Catalog Rows</div><div class="value">${escapeHtml(formatNumber(summary?.totalProducts ?? 0))}</div></div>
        <div class="kpi"><div class="label">Unique SKUs</div><div class="value">${escapeHtml(formatNumber(summary?.uniqueProducts ?? 0))}</div></div>
        <div class="kpi"><div class="label">Current Prices</div><div class="value">${escapeHtml(formatNumber(summary?.currentPrices ?? 0))}</div></div>
        <div class="kpi"><div class="label">Movement Rows</div><div class="value">${escapeHtml(formatNumber(movements.length))}</div></div>
        <div class="kpi"><div class="label">Qty Moved</div><div class="value">${escapeHtml(formatNumber(movedQuantity))}</div></div>
    </section>

    <section>
        <h2>Recent Inventory Movements</h2>
        ${renderRows(['Product', 'SKU', 'Action', 'Qty', 'Reference', 'Performed By', 'Date', 'Notes'], movementRows, 'No movement records found.')}
    </section>

    <section>
        <h2>Archived Products Preview</h2>
        ${renderRows(['Product', 'SKU', 'Category', 'Qty', 'Price', 'Archived At'], archiveRows, 'No archived products found.')}
    </section>

    <section class="signatures">
        <div class="signature">Prepared By</div>
        <div class="signature">Checked By</div>
        <div class="signature">Approved By</div>
    </section>
    <script>window.onload = () => { window.focus(); window.print(); };</script>
</body>
</html>`;
}

export default function InventoryReport() {
    const [summary, setSummary] = useState(null);
    const [movements, setMovements] = useState([]);
    const [archivedProducts, setArchivedProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [printing, setPrinting] = useState(false);
    const [error, setError] = useState('');

    const movementStats = useMemo(() => {
        const movedQuantity = movements.reduce((sum, movement) => sum + Number(movement.quantity ?? 0), 0);
        const movementTypes = new Set(movements.map((movement) => movement.movementType).filter(Boolean)).size;

        return { movedQuantity, movementTypes };
    }, [movements]);

    const loadReportData = async () => {
        setLoading(true);
        setError('');
        try {
            const [nextSummary, nextMovements, nextArchives] = await Promise.all([
                getCatalogSummary(),
                getInventoryMovements(100),
                getArchivedCatalogProducts(20),
            ]);
            setSummary(nextSummary);
            setMovements(nextMovements);
            setArchivedProducts(nextArchives);
        } catch (loadError) {
            setError(loadError.message || 'Unable to load inventory report data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadReportData();
    }, []);

    const handlePrint = async () => {
        setPrinting(true);
        setError('');
        try {
            const reportWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=760');
            if (!reportWindow) {
                throw new Error('Please allow pop-ups to print or save the inventory PDF report.');
            }
            reportWindow.document.write('<p style="font-family:Arial,sans-serif;padding:24px;">Preparing LimenServe inventory report...</p>');

            const [freshSummary, freshMovements, freshArchives] = await Promise.all([
                getCatalogSummary(),
                getInventoryMovements(100),
                getArchivedCatalogProducts(20),
            ]);
            const html = buildPrintableInventoryReport({
                summary: freshSummary,
                movements: freshMovements,
                archivedProducts: freshArchives,
                generatedAt: new Date(),
            });
            reportWindow.document.open();
            reportWindow.document.write(html);
            reportWindow.document.close();
        } catch (printError) {
            setError(printError.message || 'Unable to prepare inventory report.');
        } finally {
            setPrinting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-blue">Inventory Reports</p>
                    <h2 className="mt-2 text-2xl font-display font-bold text-primary-950">Inventory Summary and Audit</h2>
                    <p className="mt-1 max-w-3xl text-sm text-primary-500">
                        Live catalog totals, archived-product visibility, and movement accountability for printable audit documentation.
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} isLoading={loading} onClick={loadReportData}>
                        Refresh
                    </Button>
                    <Button variant="primary" leftIcon={<Printer className="h-4 w-4" />} isLoading={printing} onClick={handlePrint}>
                        Print PDF
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                    {error}
                </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
                <Link
                    to="/reports/sales"
                    className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm transition hover:border-accent-blue/40 hover:shadow-md"
                >
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">Switch Report</p>
                    <p className="mt-1 text-lg font-display font-bold text-primary-950">Sales Analytics</p>
                    <p className="mt-1 text-sm text-primary-600">Revenue, item movement, encoded historical sales, and printable sales reports.</p>
                </Link>
                <div className="rounded-2xl border border-accent-blue/30 bg-accent-blue/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-blue">Current Report</p>
                    <p className="mt-1 text-lg font-display font-bold text-primary-950">Inventory Summary</p>
                    <p className="mt-1 text-sm text-primary-600">Catalog totals, movement ledger, archived items, and inventory audit PDF.</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KPICard title="Catalog Rows" value={formatNumber(summary?.totalProducts ?? 0)} icon={<Boxes className="h-6 w-6" />} />
                <KPICard title="Unique SKUs" value={formatNumber(summary?.uniqueProducts ?? 0)} icon={<PackageCheck className="h-6 w-6" />} />
                <KPICard title="Movement Rows" value={formatNumber(movements.length)} icon={<ClipboardList className="h-6 w-6" />} />
                <KPICard title="Archived Products" value={formatNumber(archivedProducts.length)} icon={<Archive className="h-6 w-6" />} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
                <Card title="Recent Inventory Movements" subtitle={`Total moved quantity in report window: ${formatNumber(movementStats.movedQuantity)} across ${formatNumber(movementStats.movementTypes)} action types.`}>
                    {loading ? (
                        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">Loading movement records...</div>
                    ) : movements.length === 0 ? (
                        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">No movement records found.</div>
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
                                    {movements.slice(0, 12).map((movement) => (
                                        <tr key={movement.id} className="hover:bg-primary-50/60">
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-primary-950">{movement.productName}</p>
                                                <p className="font-mono text-xs text-primary-500">{movement.sku || 'NO SKU'}</p>
                                            </td>
                                            <td className="px-4 py-3 text-primary-700">{MOVEMENT_LABELS[movement.movementType] || movement.movementType}</td>
                                            <td className="px-4 py-3 text-right font-bold text-primary-950">{formatNumber(movement.quantity)}</td>
                                            <td className="px-4 py-3 text-primary-600">{movement.performedBy}</td>
                                            <td className="px-4 py-3 text-primary-600">{formatDateTime(movement.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                <Card title="Archived Products" subtitle="Products hidden from active selling flows.">
                    {loading ? (
                        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">Loading archived products...</div>
                    ) : archivedProducts.length === 0 ? (
                        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">No archived products found.</div>
                    ) : (
                        <div className="space-y-3">
                            {archivedProducts.slice(0, 8).map((product) => (
                                <div key={product.id} className="rounded-2xl border border-primary-200 bg-white p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-primary-950">{product.name}</p>
                                            <p className="mt-1 font-mono text-xs text-primary-500">{product.sku || 'NO SKU'}</p>
                                        </div>
                                        <p className="text-sm font-bold text-accent-blue">{formatCurrency(product.price ?? 0)}</p>
                                    </div>
                                    <p className="mt-2 text-xs text-primary-500">Qty {formatNumber(product.stock ?? 0)} | Archived {formatDateTime(product.archivedAt)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}

/**
 * Demo Data Seeder
 * Seeds realistic service orders and inventory stock movements
 * for presentation purposes. Run once from the Admin Dashboard.
 */
import { useState } from 'react';
import { Database, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { receiveInventoryStock } from '../../../services/catalogApi';
import { createServiceOrder, updateServiceOrder } from '../../../services/serviceOrdersApi';
import useDataStore from '../../../store/useDataStore';

// ── Demo stock movements ────────────────────────────────────────────────────
// These use real SKUs from the Mitsubishi catalog
const DEMO_STOCK_ENTRIES = [
    { sku: 'MD977394', qty: 24, supplier: 'Mitsubishi Motors Philippines', contact: '02-8575-1111', address: 'EDSA cor. Shaw Blvd, Mandaluyong', ref: 'DR-2024-0412', reason: 'Regular monthly restock' },
    { sku: 'MZ690066', qty: 12, supplier: 'Auto Accessories Depot', contact: '0917-800-1234', address: '123 Mindanao Ave, QC', ref: 'INV-8821', reason: 'Customer demand restock' },
    { sku: 'MR979850', qty: 30, supplier: 'PhilMoto Distributors', contact: '0908-555-9988', address: '45 F. Castillo St, Manila', ref: 'DR-0033-24', reason: 'Workshop stock-up' },
    { sku: 'MZ315203', qty: 8, supplier: 'Mitsubishi Motors Philippines', contact: '02-8575-1111', address: 'EDSA cor. Shaw Blvd, Mandaluyong', ref: 'DR-2024-0413', reason: 'Low stock replenishment' },
    { sku: 'MB906743', qty: 15, supplier: 'Auto Accessories Depot', contact: '0917-800-1234', address: '123 Mindanao Ave, QC', ref: 'INV-8840', reason: 'Regular monthly restock' },
    { sku: 'MN700765', qty: 6, supplier: 'PhilMoto Distributors', contact: '0908-555-9988', address: '45 F. Castillo St, Manila', ref: 'DR-0044-24', reason: 'Emergency restock' },
];

// ── Demo service orders ─────────────────────────────────────────────────────
const DEMO_SERVICE_ORDERS = [
    {
        customerName: 'Juan dela Cruz', customerPhone: '0917-234-5678',
        vehicleMake: 'Mitsubishi', vehicleModel: 'Montero Sport GLS', vehicleYear: 2021, vehiclePlate: 'AAB 1234',
        description: 'PMS — 30,000km service. Oil change, filter replacement, brake inspection, tire rotation.',
        estimatedCost: 4500, priority: 'normal', status: 'in_progress',
    },
    {
        customerName: 'Maria Santos', customerPhone: '0918-765-4321',
        vehicleMake: 'Mitsubishi', vehicleModel: 'Strada GT 4x4', vehicleYear: 2020, vehiclePlate: 'BAC 5678',
        description: 'Replace front brake pads and resurface rotors. Brake fluid flush.',
        estimatedCost: 7200, priority: 'high', status: 'pending',
    },
    {
        customerName: 'Rodrigo Ferrer', customerPhone: '0919-999-1122',
        vehicleMake: 'Mitsubishi', vehicleModel: 'Pajero Sport', vehicleYear: 2019, vehiclePlate: 'CBD 9012',
        description: 'Engine oil leak diagnosis. Suspected valve cover gasket. Coolant top-up.',
        estimatedCost: 5800, priority: 'high', status: 'pending',
    },
    {
        customerName: 'Ana Reyes', customerPhone: '0916-444-3322',
        vehicleMake: 'Mitsubishi', vehicleModel: 'Outlander PHEV', vehicleYear: 2022, vehiclePlate: 'DCE 3456',
        description: 'Aircon check and re-gas. Cabin filter replacement.',
        estimatedCost: 3200, priority: 'low', status: 'in_progress',
    },
    {
        customerName: 'Carlos Mendez', customerPhone: '0912-777-8899',
        vehicleMake: 'Mitsubishi', vehicleModel: 'Mirage G4 GLS', vehicleYear: 2023, vehiclePlate: 'EDF 7890',
        description: 'Transmission fluid change. CVT fluid flush. Inspect shifter linkage.',
        estimatedCost: 6500, priority: 'normal', status: 'pending',
    },
];

function SeedRow({ label, status }) {
    return (
        <div className="flex items-center justify-between py-1.5 border-b border-primary-50 last:border-0">
            <span className="text-sm text-primary-700">{label}</span>
            {status === 'pending' && <span className="text-xs text-primary-400">Waiting...</span>}
            {status === 'loading' && <Loader className="w-4 h-4 text-accent-blue animate-spin" />}
            {status === 'done' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
            {status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
        </div>
    );
}

export default function DemoDataSeeder() {
    const { findProduct } = useDataStore();
    const [seeding, setSeeding] = useState(false);
    const [done, setDone] = useState(false);
    const [stockStatuses, setStockStatuses] = useState([]);
    const [orderStatuses, setOrderStatuses] = useState([]);
    const [summary, setSummary] = useState('');

    const setStockStatus = (i, status) => setStockStatuses((s) => { const n = [...s]; n[i] = status; return n; });
    const setOrderStatus = (i, status) => setOrderStatuses((s) => { const n = [...s]; n[i] = status; return n; });

    const handleSeed = async () => {
        setSeeding(true);
        setStockStatuses(DEMO_STOCK_ENTRIES.map(() => 'loading'));
        setOrderStatuses(DEMO_SERVICE_ORDERS.map(() => 'pending'));

        let stockOk = 0, stockFail = 0, orderOk = 0, orderFail = 0;

        // Seed stock movements
        for (let i = 0; i < DEMO_STOCK_ENTRIES.length; i++) {
            const entry = DEMO_STOCK_ENTRIES[i];
            try {
                const product = await findProduct(entry.sku);
                if (!product?.id) throw new Error('SKU not found');
                await receiveInventoryStock({
                    productId: product.id,
                    quantity: entry.qty,
                    supplierName: entry.supplier,
                    supplierContact: entry.contact,
                    supplierAddress: entry.address,
                    referenceNumber: entry.ref,
                    receivedDate: new Date(Date.now() - i * 86400000 * 2).toISOString().slice(0, 10),
                    reason: entry.reason,
                });
                setStockStatus(i, 'done');
                stockOk++;
            } catch {
                setStockStatus(i, 'error');
                stockFail++;
            }
        }

        // Seed service orders
        setOrderStatuses(DEMO_SERVICE_ORDERS.map(() => 'loading'));
        for (let i = 0; i < DEMO_SERVICE_ORDERS.length; i++) {
            const order = DEMO_SERVICE_ORDERS[i];
            try {
                const created = await createServiceOrder({
                    customerName: order.customerName,
                    customerPhone: order.customerPhone,
                    vehicleMake: order.vehicleMake,
                    vehicleModel: order.vehicleModel,
                    vehicleYear: order.vehicleYear,
                    vehiclePlate: order.vehiclePlate,
                    description: order.description,
                    estimatedCost: order.estimatedCost,
                    status: 'pending',
                    priority: order.priority,
                });
                if (order.status !== 'pending' && created?.id) {
                    await updateServiceOrder(created.id, { status: order.status });
                }
                setOrderStatus(i, 'done');
                orderOk++;
            } catch {
                setOrderStatus(i, 'error');
                orderFail++;
            }
        }

        setSummary(`Done — ${stockOk} stock entries created (${stockFail} failed), ${orderOk} service orders created (${orderFail} failed).`);
        setDone(true);
        setSeeding(false);
    };

    return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-100">
                    <Database className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                    <h3 className="font-bold text-primary-950">Demo Data Seeder</h3>
                    <p className="text-sm text-primary-500">Seeds {DEMO_STOCK_ENTRIES.length} stock movements and {DEMO_SERVICE_ORDERS.length} service orders for presentation.</p>
                </div>
            </div>

            {!seeding && !done && (
                <Button variant="secondary" onClick={handleSeed} leftIcon={<Database className="w-4 h-4" />}>
                    Seed Demo Data
                </Button>
            )}

            {(seeding || done) && (
                <div className="bg-white rounded-xl border border-primary-200 p-4 space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary-400 mb-3">Stock Movements</p>
                    {DEMO_STOCK_ENTRIES.map((e, i) => (
                        <SeedRow key={e.sku} label={`${e.sku} — ${e.qty} units from ${e.supplier}`} status={stockStatuses[i] ?? 'pending'} />
                    ))}
                    <p className="text-xs font-bold uppercase tracking-wide text-primary-400 mt-4 mb-3">Service Orders</p>
                    {DEMO_SERVICE_ORDERS.map((o, i) => (
                        <SeedRow key={o.vehiclePlate} label={`${o.customerName} — ${o.vehicleModel} (${o.vehiclePlate})`} status={orderStatuses[i] ?? 'pending'} />
                    ))}
                </div>
            )}

            {summary && (
                <p className={`text-sm font-semibold ${done ? 'text-emerald-700' : 'text-primary-600'}`}>{summary}</p>
            )}
        </div>
    );
}

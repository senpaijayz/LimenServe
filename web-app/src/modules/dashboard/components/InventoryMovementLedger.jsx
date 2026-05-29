import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownCircle, ArrowUpCircle, ClipboardList, RefreshCw } from 'lucide-react';
import Card from '../../../components/ui/Card';
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

const OUTBOUND_TYPES = new Set(['stock_out', 'sale', 'service_usage', 'archive']);

function getMovementTone(type) {
    if (type === 'stock_in' || type === 'restore') {
        return {
            icon: <ArrowUpCircle className="h-4 w-4" />,
            className: 'bg-emerald-50 text-emerald-700',
            quantityPrefix: '+',
        };
    }

    if (OUTBOUND_TYPES.has(type)) {
        return {
            icon: <ArrowDownCircle className="h-4 w-4" />,
            className: 'bg-red-50 text-red-700',
            quantityPrefix: '-',
        };
    }

    return {
        icon: <ClipboardList className="h-4 w-4" />,
        className: 'bg-blue-50 text-blue-700',
        quantityPrefix: '',
    };
}

const InventoryMovementLedger = () => {
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;

        const loadMovements = async () => {
            setLoading(true);
            setError('');

            try {
                const data = await getInventoryMovements(8);
                if (active) {
                    setMovements(data ?? []);
                }
            } catch (loadError) {
                if (active) {
                    setError(loadError.message || 'Unable to load inventory movement ledger.');
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        void loadMovements();

        return () => {
            active = false;
        };
    }, []);

    return (
        <Card
            title="Inventory Movement Ledger"
            subtitle={loading ? 'Loading latest stock activity...' : `${formatNumber(movements.length)} latest movement${movements.length === 1 ? '' : 's'}`}
            headerAction={
                <Link to="/inventory/logs" className="text-sm font-medium text-accent-blue hover:underline">
                    View All
                </Link>
            }
            className="h-full"
        >
            {error ? (
                <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 p-4 text-sm text-accent-danger">
                    {error}
                </div>
            ) : loading ? (
                <div className="space-y-3">
                    {[0, 1, 2].map((item) => (
                        <div key={item} className="h-16 animate-pulse rounded-xl bg-primary-100" />
                    ))}
                </div>
            ) : movements.length === 0 ? (
                <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50 p-5 text-sm text-primary-500">
                    No inventory movement has been recorded yet.
                </div>
            ) : (
                <div className="space-y-3">
                    {movements.slice(0, 5).map((movement) => {
                        const tone = getMovementTone(movement.movementType);
                        return (
                            <Link
                                key={movement.id}
                                to="/inventory/logs"
                                className="flex items-center justify-between gap-3 rounded-xl border border-primary-100 bg-primary-50 p-3 transition hover:border-accent-blue hover:bg-white hover:shadow-sm"
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.className}`}>
                                        {tone.icon}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-primary-950">
                                            {movement.productName || 'Inventory item'}
                                        </p>
                                        <p className="truncate text-xs text-primary-500">
                                            {MOVEMENT_LABELS[movement.movementType] || movement.movementType || 'Movement'} · {movement.sku || 'No part number'} · {formatDateTime(movement.createdAt)}
                                        </p>
                                    </div>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-sm font-bold text-primary-950">{tone.quantityPrefix}{formatNumber(Math.abs(Number(movement.quantity ?? 0)))}</p>
                                    <p className="text-xs text-primary-500">{movement.performedBy || 'System'}</p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </Card>
    );
};

export default InventoryMovementLedger;

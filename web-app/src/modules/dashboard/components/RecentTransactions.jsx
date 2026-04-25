import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { formatCurrency, formatRelativeTime } from '../../../utils/formatters';
import { listPosSales } from '../../../services/posApi';

/**
 * Recent Transactions Component
 * Displays the latest recorded sales from the live ledger.
 */
const RecentTransactions = () => {
    const [recentTransactions, setRecentTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadRecentTransactions = async () => {
            try {
                const { sales } = await listPosSales({
                    limit: 5,
                    page: 1,
                });

                setRecentTransactions(sales);
                setError('');
            } catch (error) {
                setRecentTransactions([]);
                setError(error.message || 'Unable to load recent transactions right now.');
            } finally {
                setLoading(false);
            }
        };

        void loadRecentTransactions();
    }, []);

    return (
        <Card
            title="Recent Transactions"
            subtitle="Latest recorded sales from the live ledger"
            headerAction={
                <Link to="/reports/sales" className="text-accent-blue text-sm hover:underline">
                    View All
                </Link>
            }
        >
            <div className="grid gap-3 md:hidden">
                {error && !loading && (
                    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <p className="font-semibold">Transactions temporarily unavailable</p>
                            <p className="mt-1">{error}</p>
                        </div>
                    </div>
                )}
                {loading && (
                    <div className="rounded-xl border border-primary-200 bg-white px-4 py-6 text-center text-primary-500">
                        Loading recent transactions...
                    </div>
                )}
                {!loading && !error && recentTransactions.map((txn) => (
                    <div key={txn.sale_id} className="rounded-xl border border-primary-200 bg-white px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-mono text-sm font-semibold text-primary-700">{txn.transaction_number}</p>
                                <p className="mt-1 text-sm text-primary-950">{txn.customer_name}</p>
                                <p className="text-xs text-primary-500">{txn.item_count} items</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-accent-blue">{formatCurrency(txn.total_amount)}</p>
                                <p className="text-xs text-primary-500">{formatRelativeTime(txn.saleAt || txn.sale_at || txn.created_at)}</p>
                            </div>
                        </div>
                    </div>
                ))}
                {!loading && !error && recentTransactions.length === 0 && (
                    <div className="rounded-xl border border-primary-200 bg-white px-4 py-6 text-center text-primary-500">
                        No recent sales found.
                    </div>
                )}
            </div>

            <div className="hidden overflow-x-auto md:block">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Transaction ID</th>
                            <th>Customer</th>
                            <th>Items</th>
                            <th className="text-right">Total</th>
                            <th>Type</th>
                            <th className="text-right">Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {error && !loading && (
                            <tr>
                                <td colSpan="6" className="px-4 py-8">
                                    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                        <div>
                                            <p className="font-semibold">Transactions temporarily unavailable</p>
                                            <p className="mt-1">{error}</p>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        )}
                        {loading && (
                            <tr>
                                <td colSpan="6" className="py-8 text-center text-primary-500">
                                    Loading recent transactions...
                                </td>
                            </tr>
                        )}
                        {!error && recentTransactions.map((txn) => (
                            <tr key={txn.sale_id} className="cursor-pointer hover:bg-primary-50 transition-colors">
                                <td className="py-3 px-4 border-b border-primary-100">
                                    <span className="font-mono text-sm text-primary-500">{txn.transaction_number}</span>
                                </td>
                                <td className="py-3 px-4 border-b border-primary-100 font-medium text-primary-950">{txn.customer_name}</td>
                                <td className="py-3 px-4 border-b border-primary-100 text-primary-600">{txn.item_count} items</td>
                                <td className="py-3 px-4 border-b border-primary-100 text-right font-bold text-accent-blue">{formatCurrency(txn.total_amount)}</td>
                                <td className="py-3 px-4 border-b border-primary-100">
                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold tracking-widest uppercase border ${txn.sourceType === 'historical_encoded'
                                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                                        : 'bg-accent-success/10 text-accent-success border-accent-success/20'
                                        }`}>
                                        {txn.sourceType === 'historical_encoded' ? 'Historical' : 'Sale'}
                                    </span>
                                </td>
                                <td className="py-3 px-4 border-b border-primary-100 text-right text-sm text-primary-500">
                                    {formatRelativeTime(txn.saleAt || txn.sale_at || txn.created_at)}
                                </td>
                            </tr>
                        ))}
                        {!loading && !error && recentTransactions.length === 0 && (
                            <tr>
                                <td colSpan="6" className="py-8 text-center text-primary-500">
                                    No recent sales found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

export default RecentTransactions;

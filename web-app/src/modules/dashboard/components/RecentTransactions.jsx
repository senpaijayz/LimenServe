import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../../components/ui/Card';
import { formatCurrency, formatRelativeTime } from '../../../utils/formatters';
import { listPosSales } from '../../../services/posApi';

/**
 * Recent Transactions Component
 * Displays latest sales and quotes
 */
const RecentTransactions = () => {
    const [recentTransactions, setRecentTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadRecentTransactions = async () => {
            try {
                const { sales } = await listPosSales({
                    limit: 5,
                    page: 1,
                });

                setRecentTransactions(sales);
            } catch (error) {
                console.error('Failed to load recent transactions:', error);
            } finally {
                setLoading(false);
            }
        };

        void loadRecentTransactions();
    }, []);

    return (
        <Card
            title="Recent Transactions"
            subtitle="Latest sales and quotations"
            headerAction={
                <Link to="/reports/sales" className="text-accent-blue text-sm hover:underline">
                    View All
                </Link>
            }
        >
            <div className="overflow-x-auto">
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
                        {loading && (
                            <tr>
                                <td colSpan="6" className="py-8 text-center text-primary-500">
                                    Loading recent transactions...
                                </td>
                            </tr>
                        )}
                        {recentTransactions.map((txn) => (
                            <tr key={txn.sale_id} className="cursor-pointer hover:bg-primary-50 transition-colors">
                                <td className="py-3 px-4 border-b border-primary-100">
                                    <span className="font-mono text-sm text-primary-500">{txn.transaction_number}</span>
                                </td>
                                <td className="py-3 px-4 border-b border-primary-100 font-medium text-primary-950">{txn.customer_name}</td>
                                <td className="py-3 px-4 border-b border-primary-100 text-primary-600">{txn.item_count} items</td>
                                <td className="py-3 px-4 border-b border-primary-100 text-right font-bold text-accent-blue">{formatCurrency(txn.total_amount)}</td>
                                <td className="py-3 px-4 border-b border-primary-100">
                                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold tracking-widest uppercase border bg-accent-success/10 text-accent-success border-accent-success/20">
                                        Sale
                                    </span>
                                </td>
                                <td className="py-3 px-4 border-b border-primary-100 text-right text-sm text-primary-500">
                                    {formatRelativeTime(txn.created_at)}
                                </td>
                            </tr>
                        ))}
                        {!loading && recentTransactions.length === 0 && (
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

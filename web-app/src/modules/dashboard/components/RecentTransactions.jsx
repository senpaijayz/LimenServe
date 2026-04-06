import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../../components/ui/Card';
import { formatCurrency, formatRelativeTime } from '../../../utils/formatters';
import { listPosSales } from '../../../services/posApi';

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
            title="Recent transactions"
            subtitle="The latest checkout activity across the sales terminal"
            headerAction={<Link to="/reports/sales" className="text-sm text-accent-info hover:text-white">Sales report</Link>}
        >
            <div className="overflow-x-auto">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Transaction</th>
                            <th>Customer</th>
                            <th>Items</th>
                            <th className="text-right">Total</th>
                            <th>Status</th>
                            <th className="text-right">Freshness</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan="6" className="py-10 text-center text-primary-400">
                                    Loading recent transactions...
                                </td>
                            </tr>
                        )}

                        {recentTransactions.map((transaction) => (
                            <tr key={transaction.sale_id}>
                                <td>
                                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary-400">
                                        {transaction.transaction_number}
                                    </span>
                                </td>
                                <td className="font-semibold text-white">{transaction.customer_name}</td>
                                <td>{transaction.item_count} items</td>
                                <td className="text-right font-semibold text-accent-info">
                                    {formatCurrency(transaction.total_amount)}
                                </td>
                                <td>
                                    <span className="badge badge-success">Sale</span>
                                </td>
                                <td className="text-right text-primary-400">
                                    {formatRelativeTime(transaction.created_at)}
                                </td>
                            </tr>
                        ))}

                        {!loading && recentTransactions.length === 0 && (
                            <tr>
                                <td colSpan="6" className="py-10 text-center text-primary-400">
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

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { formatCurrency, formatRelativeTime } from '../../../utils/formatters';

// Mock transactions
const recentTransactions = [
    { id: 'TXN-001', customer: 'Walk-in Customer', items: 3, total: 4500, time: new Date(Date.now() - 15 * 60000), type: 'sale' },
    { id: 'TXN-002', customer: 'Juan Garcia', items: 5, total: 12800, time: new Date(Date.now() - 45 * 60000), type: 'sale' },
    { id: 'TXN-003', customer: 'Maria Santos', items: 2, total: 3200, time: new Date(Date.now() - 90 * 60000), type: 'quote' },
    { id: 'TXN-004', customer: 'Walk-in Customer', items: 1, total: 1500, time: new Date(Date.now() - 120 * 60000), type: 'sale' },
    { id: 'TXN-005', customer: 'Pedro Cruz', items: 8, total: 25600, time: new Date(Date.now() - 180 * 60000), type: 'sale' },
];

/**
 * Recent Transactions Component
 * Displays latest sales and quotes
 */
const RecentTransactions = () => {
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
                        {recentTransactions.map((txn) => (
                            <tr key={txn.id} className="cursor-pointer hover:bg-primary-50 transition-colors">
                                <td className="py-3 px-4 border-b border-primary-100">
                                    <span className="font-mono text-sm text-primary-500">{txn.id}</span>
                                </td>
                                <td className="py-3 px-4 border-b border-primary-100 font-medium text-primary-950">{txn.customer}</td>
                                <td className="py-3 px-4 border-b border-primary-100 text-primary-600">{txn.items} items</td>
                                <td className="py-3 px-4 border-b border-primary-100 text-right font-bold text-accent-blue">{formatCurrency(txn.total)}</td>
                                <td className="py-3 px-4 border-b border-primary-100">
                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold tracking-widest uppercase border ${txn.type === 'sale'
                                        ? 'bg-accent-success/10 text-accent-success border-accent-success/20'
                                        : 'bg-primary-100 text-primary-700 border-primary-200'
                                        }`}>
                                        {txn.type === 'sale' ? 'Sale' : 'Quote'}
                                    </span>
                                </td>
                                <td className="py-3 px-4 border-b border-primary-100 text-right text-sm text-primary-500">
                                    {formatRelativeTime(txn.time)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

export default RecentTransactions;

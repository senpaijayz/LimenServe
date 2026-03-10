import { useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Calendar, Download, TrendingUp, DollarSign, ShoppingCart, Package } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card, { KPICard } from '../../../components/ui/Card';
import Dropdown from '../../../components/ui/Dropdown';
import Tabs from '../../../components/ui/Tabs';
import { formatCurrency } from '../../../utils/formatters';

// Mock data
const salesData = [
    { month: 'Jan', sales: 125000, transactions: 180 },
    { month: 'Feb', sales: 142000, transactions: 205 },
    { month: 'Mar', sales: 138000, transactions: 195 },
    { month: 'Apr', sales: 165000, transactions: 240 },
    { month: 'May', sales: 178000, transactions: 260 },
    { month: 'Jun', sales: 192000, transactions: 285 },
];

const categoryData = [
    { name: 'Filters', value: 35, color: '#ef4444' },
    { name: 'Brakes', value: 25, color: '#f97316' },
    { name: 'Engine', value: 20, color: '#22c55e' },
    { name: 'Electrical', value: 12, color: '#3b82f6' },
    { name: 'Others', value: 8, color: '#64748b' },
];

const topProducts = [
    { name: 'Oil Filter - Montero Sport', sales: 156, revenue: 132600 },
    { name: 'Brake Pads Front - Mirage', sales: 98, revenue: 245000 },
    { name: 'Air Filter - Xpander', sales: 124, revenue: 80600 },
    { name: 'Spark Plug Set - Strada', sales: 89, revenue: 106800 },
    { name: 'Radiator Coolant 1L', sales: 187, revenue: 65450 },
];

const recentTransactions = [
    { id: 'TRX-8925', date: '2025-10-24T14:30:00', amount: 15400, items: 8, status: 'Completed', customer: 'Walk-in' },
    { id: 'TRX-8924', date: '2025-10-24T13:15:00', amount: 2100, items: 2, status: 'Completed', customer: 'Walk-in' },
    { id: 'TRX-8923', date: '2025-10-24T11:20:00', amount: 8900, items: 4, status: 'Completed', customer: 'John Doe' },
    { id: 'TRX-8922', date: '2025-10-24T10:45:00', amount: 1250, items: 1, status: 'Completed', customer: 'Walk-in' },
    { id: 'TRX-8921', date: '2025-10-24T09:12:00', amount: 5400, items: 3, status: 'Completed', customer: 'Jane Smith' },
];

const dateRangeOptions = [
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: '6m', label: 'Last 6 Months' },
    { value: '1y', label: 'Last Year' },
];

/**
 * Sales Report Page
 * Analytics and reporting for sales data
 */
const SalesReport = () => {
    const [dateRange, setDateRange] = useState('6m');

    // Custom tooltip for charts
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="glass-card py-2 px-3 text-sm">
                    <p className="font-semibold text-primary-100">{label}</p>
                    {payload.map((item, index) => (
                        <p key={index} style={{ color: item.color }}>
                            {item.name}: {item.name === 'sales' ? formatCurrency(item.value) : item.value}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-primary-100">
                        Sales Report
                    </h1>
                    <p className="text-primary-400 mt-1">
                        Analytics and insights for business performance
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Dropdown
                        options={dateRangeOptions}
                        value={dateRange}
                        onChange={setDateRange}
                        className="w-40"
                    />
                    <Button variant="secondary" leftIcon={<Download className="w-4 h-4" />}>
                        Export
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Total Revenue"
                    value={formatCurrency(940000)}
                    icon={<DollarSign className="w-6 h-6" />}
                    trend="up"
                    trendValue="+18.2%"
                />
                <KPICard
                    title="Total Orders"
                    value="1,365"
                    icon={<ShoppingCart className="w-6 h-6" />}
                    trend="up"
                    trendValue="+12.5%"
                />
                <KPICard
                    title="Avg Order Value"
                    value={formatCurrency(688)}
                    icon={<TrendingUp className="w-6 h-6" />}
                    trend="up"
                    trendValue="+5.1%"
                />
                <KPICard
                    title="Products Sold"
                    value="4,892"
                    icon={<Package className="w-6 h-6" />}
                    trend="up"
                    trendValue="+22.3%"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sales Trend Chart */}
                <Card title="Sales Trend" subtitle="Monthly revenue performance" className="lg:col-span-2">
                    <div className="h-[300px] mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={salesData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `₱${v / 1000}k`} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="sales" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Category Breakdown */}
                <Card title="Sales by Category" subtitle="Product category distribution">
                    <div className="h-[300px] mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    formatter={(value) => <span className="text-primary-300 text-sm">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {/* Top Products Table */}
            <Card title="Top Selling Products" subtitle="Best performers this period">
                <div className="overflow-x-auto mt-4">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Product</th>
                                <th className="text-right">Units Sold</th>
                                <th className="text-right">Revenue</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topProducts.map((product, index) => (
                                <tr key={index}>
                                    <td>
                                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${index < 3 ? 'bg-accent-primary/20 text-accent-primary' : 'bg-primary-700 text-primary-400'
                                            }`}>
                                            {index + 1}
                                        </span>
                                    </td>
                                    <td className="font-medium text-primary-100">{product.name}</td>
                                    <td className="text-right">{product.sales}</td>
                                    <td className="text-right font-medium text-accent-primary">{formatCurrency(product.revenue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Recent Transactions Table */}
            <Card title="Recent Transactions" subtitle="Detailed sales history with date and time">
                <div className="overflow-x-auto mt-4">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Transaction ID</th>
                                <th>Date & Time</th>
                                <th>Customer</th>
                                <th>Items</th>
                                <th>Status</th>
                                <th className="text-right">Total Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentTransactions.map((trx, index) => (
                                <tr key={index}>
                                    <td className="font-mono text-primary-300">{trx.id}</td>
                                    <td>
                                        <div className="flex flex-col">
                                            <span className="text-primary-100 font-medium">{new Date(trx.date).toLocaleDateString()}</span>
                                            <span className="text-xs text-primary-500 font-mono">{new Date(trx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                                        </div>
                                    </td>
                                    <td className="text-primary-100">{trx.customer}</td>
                                    <td>{trx.items}</td>
                                    <td>
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-accent-success/20 text-accent-success">
                                            {trx.status}
                                        </span>
                                    </td>
                                    <td className="text-right font-medium text-accent-primary">{formatCurrency(trx.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default SalesReport;

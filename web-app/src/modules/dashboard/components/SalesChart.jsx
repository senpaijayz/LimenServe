import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../../../components/ui/Card';

// Mock sales data for the week
const salesData = [
    { day: 'Mon', sales: 32000, transactions: 18 },
    { day: 'Tue', sales: 28500, transactions: 15 },
    { day: 'Wed', sales: 45000, transactions: 24 },
    { day: 'Thu', sales: 38000, transactions: 20 },
    { day: 'Fri', sales: 52000, transactions: 28 },
    { day: 'Sat', sales: 48000, transactions: 25 },
    { day: 'Sun', sales: 0, transactions: 0 },
];

/**
 * Sales Chart Component
 * Displays weekly sales trend using Recharts
 */
const SalesChart = () => {
    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white border border-primary-200 shadow-lg py-2 px-3 rounded text-sm">
                    <p className="font-semibold text-primary-950">{label}</p>
                    <p className="text-accent-blue font-bold">
                        Sales: ₱{payload[0].value.toLocaleString()}
                    </p>
                    <p className="text-primary-600">
                        Transactions: {payload[1]?.value || 0}
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <Card title="Weekly Sales Overview" subtitle="Last 7 days performance">
            <div className="h-[300px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                            dataKey="day"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                            tickFormatter={(value) => `₱${value / 1000}k`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                            type="monotone"
                            dataKey="sales"
                            stroke="#2563eb"
                            strokeWidth={2}
                            fill="url(#salesGradient)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
};

export default SalesChart;

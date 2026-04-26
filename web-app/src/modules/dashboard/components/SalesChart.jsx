import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../../../components/ui/Card';
import { formatCurrency } from '../../../utils/formatters';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white border border-primary-200 shadow-lg py-2 px-3 rounded text-sm">
                <p className="font-semibold text-primary-950">{label}</p>
                <p className="text-accent-blue font-bold">Revenue: {formatCurrency(payload[0].value || 0)}</p>
                <p className="text-primary-600">Units Sold: {payload[1]?.value || 0}</p>
            </div>
        );
    }
    return null;
};

const SalesChart = ({
    data = [],
    title = 'Item Sales Trend',
    subtitle = 'Live item-level revenue over time',
}) => {
    const chartData = useMemo(() => data.map((point) => ({
        label: point.label,
        revenue: Number(point.revenue ?? 0),
        quantity: Number(point.quantity ?? 0),
    })), [data]);

    return (
        <Card title={title} subtitle={subtitle}>
            <div className="mt-4 h-[240px] min-h-[240px] sm:h-[320px] sm:min-h-[320px]">
                {chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-sm text-primary-500">
                        No item sales trend is available for the selected filters yet.
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                            <defs>
                                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }} />
                            <YAxis axisLine={false} tickLine={false} width={56} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }} tickFormatter={(value) => `P${Math.round(value / 1000)}k`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#salesGradient)" />
                            <Area type="monotone" dataKey="quantity" stroke="#0f766e" strokeWidth={2} fillOpacity={0} />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </Card>
    );
};

export default SalesChart;

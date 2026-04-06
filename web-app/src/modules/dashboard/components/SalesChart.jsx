import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '../../../components/ui/Card';
import { formatCurrency } from '../../../utils/formatters';

const SalesChart = ({
    data = [],
    title = 'Item Sales Trend',
    subtitle = 'Live item-level revenue over time',
}) => {
    const chartData = data.map((point) => ({
        label: point.label,
        revenue: Number(point.revenue ?? 0),
        quantity: Number(point.quantity ?? 0),
    }));

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) {
            return null;
        }

        return (
            <div className="rounded-[20px] border border-white/10 bg-primary-950/95 px-4 py-3 shadow-[0_20px_50px_rgba(2,8,23,0.6)]">
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="mt-2 text-sm text-accent-info">Revenue {formatCurrency(payload[0]?.value || 0)}</p>
                <p className="mt-1 text-sm text-primary-300">Units sold {payload[1]?.value || 0}</p>
            </div>
        );
    };

    return (
        <Card title={title} subtitle={subtitle}>
            <div className="mt-4 h-[320px] min-h-[320px]">
                {chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] text-sm text-primary-400">
                        No item sales trend is available for the selected filters yet.
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="salesRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4fdfff" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#4fdfff" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="salesQuantityGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2f6bff" stopOpacity={0.22} />
                                    <stop offset="95%" stopColor="#2f6bff" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(156, 182, 219, 0.14)" vertical={false} strokeDasharray="4 4" />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#8fa2c2', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8fa2c2', fontSize: 12 }} tickFormatter={(value) => `P${Math.round(value / 1000)}k`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="revenue" stroke="#4fdfff" strokeWidth={2.4} fill="url(#salesRevenueGradient)" />
                            <Area type="monotone" dataKey="quantity" stroke="#2f6bff" strokeWidth={2} fill="url(#salesQuantityGradient)" />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </Card>
    );
};

export default SalesChart;

import { motion } from 'framer-motion';
import {
    DollarSign,
    Package,
    ShoppingCart,
    Wrench,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Clock,
} from 'lucide-react';
import { KPICard } from '../../../components/ui/Card';
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import SalesChart from '../components/SalesChart';
import LowStockAlert from '../components/LowStockAlert';
import RecentTransactions from '../components/RecentTransactions';
import { useAuth } from '../../../context/AuthContext';

// Mock data
const kpiData = {
    todaySales: 45670,
    todayTransactions: 23,
    totalProducts: 1250,
    lowStockItems: 12,
    pendingServices: 5,
    salesTrend: { direction: 'up', value: '+12.5%' },
};

/**
 * Admin Dashboard
 * Main dashboard for administrators with KPIs and analytics
 */
const AdminDashboard = () => {
    const { user } = useAuth();

    // Dynamic greeting based on time of day
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };

    // Animation variants for staggered children
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
            },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
        >
            {/* Welcome Banner */}
            <motion.div variants={itemVariants}>
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 p-6 sm:p-8 text-white">
                    <div className="absolute top-0 right-0 w-72 h-72 bg-accent-danger/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent-blue/10 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/4" />
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <p className="text-primary-400 text-sm font-medium mb-1">
                                {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                                {getGreeting()}, {user?.firstName || 'there'}! 👋
                            </h1>
                            <p className="text-primary-300 mt-1 text-sm">
                                Here's what's happening at Limen Auto Parts Center today.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <a href="/pos" className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 rounded-lg text-sm font-medium text-white transition-all">
                                <ShoppingCart className="w-4 h-4" /> Go to POS
                            </a>
                            <a href="/quotation" className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-danger hover:bg-accent-danger/90 rounded-lg text-sm font-medium text-white transition-all shadow-lg shadow-accent-danger/20">
                                <TrendingUp className="w-4 h-4" /> New Quote
                            </a>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* KPI Cards */}
            <motion.div
                variants={containerVariants}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
                <motion.div variants={itemVariants}>
                    <KPICard
                        title="Today's Sales"
                        value={formatCurrency(kpiData.todaySales)}
                        icon={<DollarSign className="w-6 h-6" />}
                        trend="up"
                        trendValue="+12.5%"
                        accentColor="border-accent-blue"
                        iconBg="bg-blue-50 text-accent-blue"
                    />
                </motion.div>

                <motion.div variants={itemVariants}>
                    <KPICard
                        title="Transactions"
                        value={formatNumber(kpiData.todayTransactions)}
                        icon={<ShoppingCart className="w-6 h-6" />}
                        trend="up"
                        trendValue="+8%"
                        accentColor="border-emerald-500"
                        iconBg="bg-emerald-50 text-emerald-600"
                    />
                </motion.div>

                <motion.div variants={itemVariants}>
                    <KPICard
                        title="Total Products"
                        value={formatNumber(kpiData.totalProducts)}
                        icon={<Package className="w-6 h-6" />}
                        accentColor="border-indigo-500"
                        iconBg="bg-indigo-50 text-indigo-600"
                    />
                </motion.div>

                <motion.div variants={itemVariants}>
                    <KPICard
                        title="Pending Services"
                        value={formatNumber(kpiData.pendingServices)}
                        icon={<Wrench className="w-6 h-6" />}
                        accentColor="border-amber-500"
                        iconBg="bg-amber-50 text-amber-600"
                    />
                </motion.div>
            </motion.div>

            {/* Charts and Alerts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sales Chart - Takes 2 columns */}
                <motion.div variants={itemVariants} className="lg:col-span-2">
                    <SalesChart />
                </motion.div>

                {/* Low Stock Alert */}
                <motion.div variants={itemVariants}>
                    <LowStockAlert />
                </motion.div>
            </div>

            {/* Recent Transactions */}
            <motion.div variants={itemVariants}>
                <RecentTransactions />
            </motion.div>
        </motion.div>
    );
};

export default AdminDashboard;

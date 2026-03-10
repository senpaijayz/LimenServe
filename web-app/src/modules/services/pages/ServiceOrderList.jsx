import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Filter, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/ui/Badge';
import Tabs from '../../../components/ui/Tabs';
import { formatCurrency, formatDate, formatRelativeTime } from '../../../utils/formatters';
import { CreateServiceOrderModal, ServiceOrderDetailModal } from '../components/ServiceOrderModals';
import { useToast } from '../../../components/ui/Toast';

// Mock service orders
const mockServiceOrders = [
    {
        id: 'SVC-001',
        customerName: 'Juan Garcia',
        customerPhone: '09171234567',
        vehicle: { make: 'Mitsubishi', model: 'Montero Sport', year: 2019, plate: 'ABC 1234' },
        description: 'Oil change and brake inspection',
        status: 'in_progress',
        estimatedCost: 3500,
        createdAt: new Date(Date.now() - 2 * 60 * 60000),
    },
    {
        id: 'SVC-002',
        customerName: 'Maria Santos',
        customerPhone: '09181234567',
        vehicle: { make: 'Mitsubishi', model: 'Xpander', year: 2021, plate: 'XYZ 5678' },
        description: 'Engine tune-up and air filter replacement',
        status: 'pending',
        estimatedCost: 5200,
        createdAt: new Date(Date.now() - 4 * 60 * 60000),
    },
    {
        id: 'SVC-003',
        customerName: 'Pedro Cruz',
        customerPhone: '09191234567',
        vehicle: { make: 'Mitsubishi', model: 'Mirage', year: 2020, plate: 'DEF 9012' },
        description: 'Brake pad replacement - front and rear',
        status: 'completed',
        estimatedCost: 8000,
        createdAt: new Date(Date.now() - 24 * 60 * 60000),
    },
    {
        id: 'SVC-004',
        customerName: 'Ana Reyes',
        customerPhone: '09201234567',
        vehicle: { make: 'Mitsubishi', model: 'Strada', year: 2022, plate: 'GHI 3456' },
        description: 'Wheel alignment and tire rotation',
        status: 'pending',
        estimatedCost: 2500,
        createdAt: new Date(Date.now() - 1 * 60 * 60000),
    },
];

/**
 * Service Order List Page
 * View and manage service orders
 */
const ServiceOrderList = () => {
    const { success } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [orders, setOrders] = useState(mockServiceOrders);

    // Filter orders
    const filteredOrders = orders.filter((order) => {
        const matchesSearch =
            order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.vehicle.plate.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Group by status
    const pendingOrders = orders.filter(o => o.status === 'pending');
    const inProgressOrders = orders.filter(o => o.status === 'in_progress');
    const completedOrders = orders.filter(o => o.status === 'completed');

    // Handle status update
    const handleStatusUpdate = (orderId, newStatus) => {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        setSelectedOrder(null);
        success(`Order ${orderId} status updated to ${newStatus.replace('_', ' ')}`);
    };

    // Handle new order creation
    const handleCreateOrder = (newOrder) => {
        setOrders(prev => [newOrder, ...prev]);
        success(`Service order ${newOrder.id} created successfully!`);
    };

    // Order card component
    const OrderCard = ({ order }) => (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="group relative bg-white border border-primary-200 rounded-xl overflow-hidden cursor-pointer hover:border-red-500/50 transition-all duration-300 shadow-sm hover:shadow-md"
            onClick={() => setSelectedOrder(order)}
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500/0 to-transparent group-hover:via-red-500/50 transition-all duration-500" />

            <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <p className="font-mono text-xs tracking-widest text-primary-500 mb-1">{order.id}</p>
                        <h3 className="font-display font-semibold text-lg text-primary-950 group-hover:text-red-600 transition-colors">{order.customerName}</h3>
                    </div>
                    <StatusBadge status={order.status} />
                </div>

                <div className="space-y-3 p-4 bg-primary-50 rounded-lg border border-primary-100">
                    <div className="flex justify-between items-center border-b border-primary-200 pb-2">
                        <span className="text-xs font-mono text-primary-500">VEHICLE</span>
                        <span className="text-sm font-medium text-primary-900">
                            {order.vehicle.year} {order.vehicle.make} {order.vehicle.model}
                        </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-primary-200 pb-2">
                        <span className="text-xs font-mono text-primary-500">PLATE</span>
                        <span className="text-sm font-mono text-primary-900 bg-white px-2 py-0.5 rounded border border-primary-200">{order.vehicle.plate}</span>
                    </div>
                    <div className="pt-1">
                        <p className="text-sm text-primary-700 line-clamp-2 leading-relaxed">{order.description}</p>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-5 pt-4 border-t border-primary-100">
                    <p className="text-xl font-bold font-mono text-primary-950 group-hover:text-red-600 transition-colors">
                        {formatCurrency(order.estimatedCost)}
                    </p>
                    <p className="text-xs font-mono text-primary-500 uppercase tracking-widest">
                        {formatRelativeTime(order.createdAt)}
                    </p>
                </div>
            </div>
        </motion.div>
    );

    // Status tabs
    const tabs = [
        {
            id: 'all',
            label: 'All Orders',
            badge: orders.length,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    {filteredOrders.map((order) => (
                        <OrderCard key={order.id} order={order} />
                    ))}
                </div>
            ),
        },
        {
            id: 'pending',
            label: 'Pending',
            badge: pendingOrders.length,
            icon: <Clock className="w-4 h-4" />,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    {pendingOrders.map((order) => (
                        <OrderCard key={order.id} order={order} />
                    ))}
                </div>
            ),
        },
        {
            id: 'in_progress',
            label: 'In Progress',
            badge: inProgressOrders.length,
            icon: <AlertCircle className="w-4 h-4" />,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    {inProgressOrders.map((order) => (
                        <OrderCard key={order.id} order={order} />
                    ))}
                </div>
            ),
        },
        {
            id: 'completed',
            label: 'Completed',
            badge: completedOrders.length,
            icon: <CheckCircle className="w-4 h-4" />,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    {completedOrders.map((order) => (
                        <OrderCard key={order.id} order={order} />
                    ))}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white border border-primary-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-accent-blue/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="relative z-10">
                    <h1 className="text-3xl font-display font-bold text-primary-950 tracking-widest uppercase flex items-center gap-3">
                        <span className="w-8 h-8 rounded bg-primary-100 flex items-center justify-center border border-primary-200">
                            <Plus className="w-4 h-4 text-primary-700" />
                        </span>
                        Service Orders
                    </h1>
                    <p className="text-primary-500 mt-2 font-mono text-sm max-w-2xl leading-relaxed">
                        {'>> LIVE WORKSHOP DATA. TRACK AND MANAGE CUSTOMER SERVICE REQUESTS. <<'}
                    </p>
                </div>
                <div className="relative z-10">
                    <button className="btn bg-gradient-to-r from-red-600 to-red-800 text-white border-none shadow-lg shadow-red-600/40" onClick={() => setShowCreateModal(true)}>
                        <Plus className="w-4 h-4" /> NEW SERVICE ORDER
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="surface p-6">
                {/* Search */}
                <div className="mb-8">
                    <div className="relative max-w-xl">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-500" />
                        <input
                            type="text"
                            placeholder="SEARCH BY CUSTOMER, ORDER ID, OR PLATE..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white border border-primary-200 rounded-xl px-12 py-4 text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all font-mono text-sm tracking-wide shadow-sm"
                        />
                    </div>
                </div>

                {/* Status Tabs */}
                <Tabs tabs={tabs} defaultTab="all" variant="pills" />

                {/* Empty State */}
                {filteredOrders.length === 0 && (
                    <div className="text-center py-20 bg-primary-50 border border-primary-200 rounded-2xl">
                        <AlertCircle className="w-16 h-16 text-primary-300 mx-auto mb-6" />
                        <h3 className="text-xl font-display font-semibold text-primary-900 mb-2 tracking-wide uppercase">No orders found</h3>
                        <p className="text-primary-500 font-mono text-sm uppercase tracking-widest">Adjust search parameters</p>
                    </div>
                )}

            </div>

            {/* Create Service Order Modal */}
            <CreateServiceOrderModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSave={handleCreateOrder}
            />

            {/* Service Order Detail Modal */}
            <ServiceOrderDetailModal
                isOpen={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
                order={selectedOrder}
                onStatusUpdate={handleStatusUpdate}
            />
        </div>
    );
};

export default ServiceOrderList;

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/ui/Badge';
import Tabs from '../../../components/ui/Tabs';
import { formatCurrency, formatRelativeTime } from '../../../utils/formatters';
import { CreateServiceOrderModal, ServiceOrderDetailModal } from '../components/ServiceOrderModals';
import { useToast } from '../../../components/ui/Toast';
import { createServiceOrder, listServiceOrders, updateServiceOrder } from '../../../services/serviceOrdersApi';

/**
 * Service Order List Page
 * View and manage service orders
 */
const ServiceOrderList = () => {
    const { success, error: showError } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const loadOrders = async () => {
                setLoading(true);
                setLoadError('');

                try {
                    const rows = await listServiceOrders({
                        search: searchQuery || null,
                        status: 'all',
                        limit: 100,
                    });
                    setOrders(rows);
                } catch (error) {
                    setOrders([]);
                    setLoadError(error.message || 'Unable to load service orders.');
                } finally {
                    setLoading(false);
                }
            };

            void loadOrders();
        }, 180);

        return () => window.clearTimeout(timer);
    }, [searchQuery]);

    // Filter orders
    const filteredOrders = useMemo(() => orders.filter((order) => {
        const matchesSearch =
            String(order.customerName || '').toLowerCase().includes(searchQuery.toLowerCase())
            || String(order.orderNumber || order.id).toLowerCase().includes(searchQuery.toLowerCase())
            || String(order.vehicle?.plate || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
        return matchesSearch && matchesStatus;
    }), [orders, searchQuery, statusFilter]);

    // Group by status
    const pendingOrders = filteredOrders.filter(o => o.status === 'pending');
    const inProgressOrders = filteredOrders.filter(o => o.status === 'in_progress');
    const completedOrders = filteredOrders.filter(o => o.status === 'completed');

    // Handle status update
    const handleStatusUpdate = async (orderId, newStatus) => {
        try {
            const updatedOrder = await updateServiceOrder(orderId, { status: newStatus });
            setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
            setSelectedOrder(null);
            success(`Order ${updatedOrder.orderNumber || orderId} status updated to ${newStatus.replace('_', ' ')}`);
        } catch (error) {
            showError(error.message || 'Unable to update service order status.');
            throw error;
        }
    };

    // Handle new order creation
    const handleCreateOrder = async (payload) => {
        const newOrder = await createServiceOrder(payload);
        setOrders(prev => [newOrder, ...prev]);
        success(`Service order ${newOrder.orderNumber || newOrder.id} created successfully!`);
    };

    // Order card component
    const OrderCard = ({ order }) => (
        <div
            className="group relative bg-white border border-primary-200 rounded-xl overflow-hidden cursor-pointer hover:border-red-500/50 transition-all duration-300 shadow-sm hover:shadow-md"
            onClick={() => setSelectedOrder(order)}
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500/0 to-transparent group-hover:via-red-500/50 transition-all duration-500" />

            <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <p className="font-mono text-xs tracking-widest text-primary-500 mb-1">{order.orderNumber || order.id}</p>
                        <h3 className="font-display font-semibold text-lg text-primary-950 group-hover:text-red-600 transition-colors">{order.customerName}</h3>
                    </div>
                    <StatusBadge status={order.status} />
                </div>

                <div className="space-y-3 p-4 bg-primary-50 rounded-lg border border-primary-100">
                    <div className="flex justify-between items-center border-b border-primary-200 pb-2">
                        <span className="text-xs font-mono text-primary-500">VEHICLE</span>
                        <span className="text-sm font-medium text-primary-900">
                            {[order.vehicle?.year, order.vehicle?.make, order.vehicle?.model].filter(Boolean).join(' ') || 'Vehicle not recorded'}
                        </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-primary-200 pb-2">
                        <span className="text-xs font-mono text-primary-500">PLATE</span>
                        <span className="text-sm font-mono text-primary-900 bg-white px-2 py-0.5 rounded border border-primary-200">{order.vehicle?.plate || 'N/A'}</span>
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
        </div>
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
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 sm:space-y-8">
            {/* Header */}
            <div className="relative flex flex-col items-start justify-between gap-4 overflow-hidden rounded-2xl border border-primary-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-accent-blue/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="relative z-10">
                    <h1 className="flex items-center gap-3 text-2xl font-display font-bold uppercase tracking-wider text-primary-950 sm:text-3xl sm:tracking-widest">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-primary-200 bg-primary-100">
                            <Plus className="w-4 h-4 text-primary-700" />
                        </span>
                        Service Orders
                    </h1>
                    <p className="text-primary-500 mt-2 font-mono text-sm max-w-2xl leading-relaxed">
                        {'>> LIVE WORKSHOP DATA. TRACK AND MANAGE CUSTOMER SERVICE REQUESTS. <<'}
                    </p>
                </div>
                <div className="relative z-10 w-full sm:w-auto">
                    <button className="btn w-full border-none bg-gradient-to-r from-red-600 to-red-800 text-white shadow-lg shadow-red-600/40 sm:w-auto" onClick={() => setShowCreateModal(true)}>
                        <Plus className="w-4 h-4" /> NEW SERVICE ORDER
                    </button>
                </div>
            </div>

            {loadError && (
                <Card className="border border-accent-danger/20 bg-accent-danger/5" padding="sm">
                    <div className="flex items-start gap-3 text-sm text-accent-danger">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <p className="font-semibold">Service orders unavailable</p>
                            <p>{loadError}</p>
                        </div>
                    </div>
                </Card>
            )}

            {/* Content Area */}
            <div className="surface p-4 sm:p-6">
                {/* Search */}
                <div className="mb-8">
                    <div className="relative w-full max-w-xl">
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

                <div className="mb-4 flex flex-wrap gap-2 sm:hidden">
                    {['all', 'pending', 'in_progress', 'completed'].map((status) => (
                        <button
                            key={status}
                            type="button"
                            onClick={() => setStatusFilter(status)}
                            className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${statusFilter === status ? 'border-accent-blue bg-accent-blue text-white' : 'border-primary-200 bg-white text-primary-600'}`}
                        >
                            {status === 'all' ? 'All' : status.replace('_', ' ')}
                        </button>
                    ))}
                </div>

                <div className="hidden sm:block">
                    <Tabs tabs={tabs} defaultTab="all" variant="pills" onChange={setStatusFilter} />
                </div>

                <div className="sm:hidden">
                    <div className="grid grid-cols-1 gap-4 mt-6">
                        {filteredOrders.map((order) => (
                            <OrderCard key={order.id} order={order} />
                        ))}
                    </div>
                </div>

                {loading && (
                    <div className="text-center py-12 text-primary-500">
                        Loading service orders...
                    </div>
                )}

                {/* Empty State */}
                {!loading && filteredOrders.length === 0 && (
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

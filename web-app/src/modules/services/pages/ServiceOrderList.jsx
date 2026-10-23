import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Clock, AlertCircle, RefreshCw, Wrench, Archive, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/ui/Badge';
import Tabs from '../../../components/ui/Tabs';
import { formatCurrency, formatRelativeTime } from '../../../utils/formatters';
import { PriorityBadge } from '../components/ServiceOrderModals';
import { isServiceOrderOverdue } from '../utils/serviceOrderDisplay';
import { getServiceOrderQueue } from '../../../services/serviceOrdersApi';
import { useNavigate } from 'react-router';
import { listMechanics } from '../../../services/mechanicsApi';

/**
 * Service Order List Page
 * View and manage service orders
 */
const ServiceOrderList = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [mobileMetricId, setMobileMetricId] = useState('all');
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [reloadNonce, setReloadNonce] = useState(0);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [mechanicFilter, setMechanicFilter] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [sort, setSort] = useState('newest');
    const [mechanics, setMechanics] = useState([]);
    const [summary, setSummary] = useState({});

    useEffect(() => {
        listMechanics({ activeOnly: false }).then(setMechanics).catch(() => setMechanics([]));
    }, []);

    useEffect(() => {
        let active = true;
        const timer = window.setTimeout(() => {
            const loadOrders = async () => {
                setLoading(true);
                setLoadError('');

                try {
                    const result = await getServiceOrderQueue({
                        search: searchQuery,
                        stage: statusFilter === 'all' ? 'active' : statusFilter === 'archive' ? 'completed' : statusFilter,
                        priority: priorityFilter,
                        mechanicId: mechanicFilter || undefined,
                        date: dateFilter || undefined,
                        sort,
                        page,
                        pageSize: 18,
                    });
                    if (!active) return;
                    setOrders(result.orders || []);
                    setSummary(result.summary || {});
                    setTotal(result.total || 0);
                } catch (error) {
                    if (!active) return;
                    setOrders([]);
                    setLoadError(error.message || 'Unable to load service orders.');
                } finally {
                    if (active) setLoading(false);
                }
            };

            void loadOrders();
        }, 180);

        return () => { active = false; window.clearTimeout(timer); };
    }, [searchQuery, statusFilter, priorityFilter, mechanicFilter, dateFilter, sort, page, reloadNonce]);

    const visibleMobileOrders = orders;
    const statusCounts = useMemo(() => ({
        all: summary.active ?? 0,
        pending: summary.pending ?? 0,
        inProgress: summary.inProgress ?? 0,
        archived: summary.completed ?? 0,
        overdue: summary.overdue ?? 0,
        awaitingAssignment: summary.awaitingAssignment ?? 0,
        awaitingPayment: summary.awaitingPayment ?? 0,
    }), [summary]);

    // Order card component
    const OrderCard = ({ order }) => {
        const isArchived = order.status === 'completed';
        const overdue = isServiceOrderOverdue(order);
        const itemCount = Array.isArray(order.items) ? order.items.length : 0;

        return (
        <div
            role="link"
            tabIndex={0}
            className={`group relative overflow-hidden rounded-xl border bg-white cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md ${isArchived ? 'border-accent-success/25 hover:border-accent-success/50' : 'border-primary-200 hover:border-red-500/50'}`}
            onClick={() => navigate(`/services/${order.id}`)}
            onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/services/${order.id}`); }}
        >
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent to-transparent transition-all duration-500 ${isArchived ? 'via-accent-success/30 group-hover:via-accent-success/70' : 'via-red-500/0 group-hover:via-red-500/50'}`} />

            <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <p className="font-mono text-xs tracking-widest text-primary-500 mb-1">{order.orderNumber || order.id}</p>
                        <h3 className="font-display font-semibold text-lg text-primary-950 group-hover:text-red-600 transition-colors">{order.customerName}</h3>
                    </div>
                    <div className="flex flex-col items-end gap-2"><StatusBadge status={order.status} /><PriorityBadge priority={order.priority} />{overdue && <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-800">Overdue</span>}</div>
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
                    {itemCount > 0 && (
                        <div className="flex justify-between items-center border-t border-primary-200 pt-2">
                            <span className="text-xs font-mono text-primary-500">LINES</span>
                            <span className="text-sm font-medium text-primary-900">{itemCount} item{itemCount === 1 ? '' : 's'}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between mt-5 pt-4 border-t border-primary-100">
                    <p className="text-xl font-bold font-mono text-primary-950 group-hover:text-red-600 transition-colors">
                        {formatCurrency(order.estimatedCost)}
                    </p>
                    <p className="text-xs font-mono text-primary-500 uppercase tracking-widest">
                        {formatRelativeTime(order.createdAt)}
                    </p>
                </div>
                {isArchived && (
                    <div className="mt-3 rounded-lg border border-accent-success/20 bg-accent-success/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-accent-success">
                        Completed · Open for billing details
                    </div>
                )}
                {overdue && (order.scheduledEnd || order.scheduled_end || order.assignment?.scheduledEnd) && <p className="mt-2 text-xs font-medium text-red-700">Scheduled completion has passed.</p>}
            </div>
        </div>
        );
    };

    const StatusMetric = ({ label, value, helper, icon }) => (
        <Card padding="sm" className="border-primary-200 bg-white">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-xs font-mono font-semibold uppercase tracking-[0.16em] text-primary-800">{label}</p>
                    <p className="mt-1 text-2xl font-display font-bold text-primary-950">{value}</p>
                    <p className="mt-1 text-xs leading-snug text-primary-700">{helper}</p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary-300 bg-accent-blue/10 text-primary-800">
                    {icon}
                </span>
            </div>
        </Card>
    );

    const statusMetrics = [
        { id: 'all', label: 'Active Jobs', value: statusCounts.all, helper: 'Open work', icon: <Wrench className="h-5 w-5" /> },
        { id: 'awaiting-assignment', label: 'Awaiting Assignment', value: statusCounts.awaitingAssignment, helper: 'Needs a mechanic', icon: <Wrench className="h-5 w-5" /> },
        { id: 'pending', label: 'Pending', value: statusCounts.pending, helper: 'Needs workshop review', icon: <Clock className="h-5 w-5" /> },
        { id: 'in-progress', label: 'In Progress', value: statusCounts.inProgress, helper: 'Currently being handled', icon: <AlertCircle className="h-5 w-5" /> },
        { id: 'overdue', label: 'Overdue', value: statusCounts.overdue, helper: 'Unfinished after scheduled end', icon: <Clock className="h-5 w-5 text-red-700" /> },
        { id: 'awaiting-payment', label: 'Awaiting Payment', value: statusCounts.awaitingPayment, helper: 'Repairs finished, not yet paid', icon: <Archive className="h-5 w-5" /> },
        { id: 'completed', label: 'Completed', value: statusCounts.archived, helper: 'Archived jobs', icon: <Archive className="h-5 w-5" /> },
    ];
    const selectedMobileMetric = statusMetrics.find(({ id }) => id === mobileMetricId) || statusMetrics[0];

    const OrderSkeleton = () => (
        <div className="animate-pulse rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
                <div className="space-y-2">
                    <div className="h-3 w-28 rounded bg-primary-100" />
                    <div className="h-5 w-40 rounded bg-primary-100" />
                </div>
                <div className="h-7 w-20 rounded-full bg-primary-100" />
            </div>
            <div className="space-y-3 rounded-lg border border-primary-100 bg-primary-50 p-4">
                <div className="h-4 rounded bg-primary-100" />
                <div className="h-4 w-2/3 rounded bg-primary-100" />
                <div className="h-12 rounded bg-primary-100" />
            </div>
            <div className="mt-5 h-5 w-28 rounded bg-primary-100" />
        </div>
    );

    // Status tabs
    const tabs = [
        {
            id: 'all',
            label: 'Active Queue',
            badge: statusCounts.all,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    {visibleMobileOrders.map((order) => (
                        <OrderCard key={order.id} order={order} />
                    ))}
                </div>
            ),
        },
        {
            id: 'overdue',
            label: 'Overdue',
            badge: statusCounts.overdue,
            icon: <Clock className="w-4 h-4 text-red-700" />,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    {visibleMobileOrders.map((order) => (
                        <OrderCard key={order.id} order={order} />
                    ))}
                </div>
            ),
        },
        {
            id: 'pending',
            label: 'Pending',
            badge: statusCounts.pending,
            icon: <Clock className="w-4 h-4" />,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    {visibleMobileOrders.map((order) => (
                        <OrderCard key={order.id} order={order} />
                    ))}
                </div>
            ),
        },
        {
            id: 'in_progress',
            label: 'In Progress',
            badge: statusCounts.inProgress,
            icon: <AlertCircle className="w-4 h-4" />,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    {visibleMobileOrders.map((order) => (
                        <OrderCard key={order.id} order={order} />
                    ))}
                </div>
            ),
        },
        {
            id: 'archive',
            label: 'Archive',
            badge: statusCounts.archived,
            icon: <Archive className="w-4 h-4" />,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    {visibleMobileOrders.map((order) => (
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
                            <Wrench className="w-4 h-4 text-primary-700" />
                        </span>
                        Service Orders
                    </h1>
                    <p className="text-primary-500 mt-2 text-sm max-w-2xl leading-relaxed">Manage repair jobs, workshop scheduling, mechanic assignments, and customer billing.</p>
                </div>
                <div className="relative z-10 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <button className="btn w-full border border-primary-200 bg-white text-primary-900 sm:w-auto" onClick={() => navigate('/services/schedule')}><CalendarDays className="h-4 w-4" /> View Schedule</button>
                    <button className="btn w-full border-none bg-gradient-to-r from-red-600 to-red-800 text-white shadow-lg shadow-red-600/40 sm:w-auto" onClick={() => navigate('/services/new')}>
                        <Plus className="w-4 h-4" /> NEW SERVICE ORDER
                    </button>
                </div>
            </div>

            <div className="space-y-3 lg:hidden">
                <label htmlFor="service-status-overview" className="block text-xs font-bold uppercase tracking-wider text-primary-800">Status overview</label>
                <select
                    id="service-status-overview"
                    className="input min-h-12 w-full font-semibold text-primary-900"
                    value={mobileMetricId}
                    onChange={(event) => setMobileMetricId(event.target.value)}
                >
                    {statusMetrics.map(({ id, label, value }) => (
                        <option key={id} value={id}>{label} ({value})</option>
                    ))}
                </select>
                <StatusMetric {...selectedMobileMetric} />
            </div>
            <div className="hidden gap-3 lg:grid lg:grid-cols-4 2xl:grid-cols-7">
                {statusMetrics.map((metric) => <StatusMetric key={metric.id} {...metric} />)}
            </div>

            {loadError && (
                <Card className="border border-accent-danger/20 bg-accent-danger/5" padding="sm">
                    <div className="flex flex-col gap-3 text-sm text-accent-danger sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <p className="font-semibold">Service orders unavailable</p>
                            <p>{loadError}</p>
                        </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setReloadNonce((value) => value + 1)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-accent-danger/30 bg-white px-3 text-xs font-semibold uppercase tracking-wide text-accent-danger"
                        >
                            <RefreshCw className="h-3.5 w-3.5" /> Retry
                        </button>
                    </div>
                </Card>
            )}

            {/* Content Area */}
            <div className="surface p-4 sm:p-6">
                {/* Search */}
                <div className="mb-6 grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)] xl:items-end">
                    <div className="w-full min-w-0">
                        <label className="mb-2 block text-xs font-mono font-semibold uppercase tracking-[0.2em] text-primary-500">
                            Find a service order
                        </label>
                        <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-500" />
                        <input
                            type="text"
                            placeholder="SEARCH BY CUSTOMER, ORDER ID, OR PLATE..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                            className="w-full bg-white border border-primary-200 rounded-xl px-12 py-4 text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all font-mono text-sm tracking-wide shadow-sm"
                        />
                        </div>
                    </div>

                    <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="block min-w-0 text-xs font-semibold text-primary-600">
                            <label htmlFor="service-job-date">Job date</label>
                            <span className={`relative mt-1 flex h-11 min-w-0 items-center rounded-xl border bg-white shadow-sm transition focus-within:border-accent-blue focus-within:ring-2 focus-within:ring-accent-blue/20 ${dateFilter ? 'border-accent-blue/50' : 'border-primary-200'}`}>
                                <CalendarDays className="ml-3 h-4 w-4 shrink-0 text-primary-400" aria-hidden="true" />
                                <input id="service-job-date" type="date" aria-label="Filter service orders by job date" className="h-full min-w-0 w-full border-0 bg-transparent px-2 text-sm text-primary-900 outline-none focus:ring-0" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPage(1); }} />
                                {dateFilter && <button type="button" aria-label="Clear job date filter" title="Clear date filter" className="mr-2 shrink-0 rounded-md px-1.5 py-1 text-xs font-semibold text-primary-500 hover:bg-primary-100 hover:text-primary-900" onClick={() => { setDateFilter(''); setPage(1); }}>Clear</button>}
                            </span>
                        </div>
                        <label className="block min-w-0 text-xs font-semibold text-primary-600">Mechanic<select aria-label="Filter by mechanic" className="input mt-1 w-full min-w-0" value={mechanicFilter} onChange={(e) => { setMechanicFilter(e.target.value); setPage(1); }}><option value="">All mechanics</option>{mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.full_name || mechanic.fullName}</option>)}</select></label>
                        <label className="block min-w-0 text-xs font-semibold text-primary-600">Priority<select aria-label="Filter by priority" className="input mt-1 w-full min-w-0" value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}><option value="all">All priorities</option>{['urgent','high','normal','low'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                        <label className="block min-w-0 text-xs font-semibold text-primary-600">Sort by<select aria-label="Sort service orders" className="input mt-1 w-full min-w-0" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="due">Due soonest</option><option value="urgency">Urgency</option></select></label>
                    </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-2 sm:hidden">
                    {['all', 'pending', 'in_progress', 'overdue', 'archive'].map((status) => (
                        <button
                            key={status}
                            type="button"
                            onClick={() => { setStatusFilter(status); setPage(1); }}
                            className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${statusFilter === status ? 'border-accent-blue bg-accent-blue text-white' : 'border-primary-200 bg-white text-primary-600'}`}
                        >
                            {status === 'all' ? 'Active' : status.replace('_', ' ')}
                        </button>
                    ))}
                </div>

                {!loading && (
                <div className="hidden sm:block">
                    <Tabs tabs={tabs} defaultTab="all" variant="pills" onChange={(next) => { setStatusFilter(next); setPage(1); }} />
                </div>
                )}

                {!loading && (
                <div className="sm:hidden">
                    <div className="grid grid-cols-1 gap-4 mt-6">
                        {visibleMobileOrders.map((order) => (
                            <OrderCard key={order.id} order={order} />
                        ))}
                    </div>
                </div>
                )}

                {loading && (
                    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <OrderSkeleton key={index} />
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!loading && visibleMobileOrders.length === 0 && (
                    <div className="text-center py-16 bg-primary-50 border border-primary-200 rounded-2xl">
                        <AlertCircle className="w-16 h-16 text-primary-300 mx-auto mb-6" />
                        <h3 className="text-xl font-display font-semibold text-primary-900 mb-2 tracking-wide uppercase">No orders found</h3>
                        <p className="mx-auto max-w-md text-primary-500 text-sm">Adjust the search/filter or create a new service order for a customer repair job. Completed jobs are stored in Archive.</p>
                        <Button className="mt-6" variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => navigate('/services/new')}>
                            Create Service Order
                        </Button>
                    </div>
                )}

                {!loading && total > 0 && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4 text-sm text-primary-600"><span>Showing {(page - 1) * 18 + 1}–{Math.min(page * 18, total)} of {total} orders</span><div className="flex items-center gap-2"><button type="button" className="btn" disabled={page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /> Previous</button><span>Page {page} of {Math.ceil(total / 18)}</span><button type="button" className="btn" disabled={page * 18 >= total} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight className="h-4 w-4" /></button></div></div>}

            </div>

        </div>
    );
};

export default ServiceOrderList;

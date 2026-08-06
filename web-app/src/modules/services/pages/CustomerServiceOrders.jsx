import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, MapPin, RefreshCw, UserRound, Wrench } from 'lucide-react';
import { Link } from 'react-router';
import Button from '../../../components/ui/Button';
import { listMyServiceOrders } from '../../../services/serviceOrdersApi';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';

const STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_STYLES = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
};

export default function CustomerServiceOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setOrders(await listMyServiceOrders());
    } catch (error) {
      setLoadError(error.message || 'Unable to load your service orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-primary-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-accent-primary">Customer workspace</p>
          <h1 className="mt-2 text-3xl font-display font-bold text-primary-950">My Service Orders</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-600">See your service status, schedule, and assigned mechanic when Limen has linked the order to your customer account.</p>
        </div>
        <Button variant="secondary" onClick={loadOrders} isLoading={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>
          Refresh
        </Button>
      </header>

      {loadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{loadError}</div>
      )}

      {loading && orders.length === 0 ? (
        <div className="rounded-3xl border border-primary-200 bg-white p-12 text-center text-primary-600">Loading your service orders&hellip;</div>
      ) : orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-primary-300 bg-white p-10 text-center">
          <Wrench className="mx-auto h-12 w-12 text-primary-300" />
          <h2 className="mt-4 text-xl font-bold text-primary-950">No linked service orders</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-primary-600">Orders appear here only after Limen links the in-store customer record to your verified account.</p>
          <Link to="/service-orders" className="btn btn-secondary mt-6">View service information</Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {orders.map((order) => {
            const mechanic = order.assignment?.mechanic ?? order.assignedMechanic;
            const scheduledStart = order.assignment?.scheduledStart ?? order.scheduledStart;
            const scheduledEnd = order.assignment?.scheduledEnd ?? order.scheduledEnd;

            return (
              <article key={order.id} className="rounded-3xl border border-primary-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold uppercase tracking-wider text-primary-500">{order.orderNumber}</p>
                    <h2 className="mt-2 text-lg font-bold text-primary-950">{order.description || 'Vehicle service'}</h2>
                    <p className="mt-1 text-sm text-primary-500">Opened {formatDateTime(order.createdAt)}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[order.status] || STATUS_STYLES.pending}`}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>

                <div className="mt-5 rounded-2xl bg-primary-50 p-4">
                  {mechanic ? (
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-accent-primary shadow-sm">
                        <UserRound className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-primary-500">Assigned mechanic</p>
                        <p className="mt-1 text-lg font-bold text-primary-950">{mechanic.name}</p>
                        <p className="text-sm text-primary-600">{mechanic.specialization}</p>
                        {mechanic.locationName && <p className="mt-2 flex items-center gap-2 text-xs text-primary-500"><MapPin className="h-3.5 w-3.5" /> {mechanic.locationName}</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-sm text-primary-600">
                      <UserRound className="h-5 w-5 text-primary-400" />
                      A mechanic has not been assigned yet.
                    </div>
                  )}
                </div>

                {(scheduledStart || scheduledEnd) && (
                  <p className="mt-4 flex items-start gap-2 text-sm text-primary-600">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {scheduledStart ? formatDateTime(scheduledStart) : 'Schedule pending'}
                      {scheduledEnd ? ` to ${formatDateTime(scheduledEnd)}` : ''}
                    </span>
                  </p>
                )}

                <div className="mt-5 flex items-center justify-between border-t border-primary-100 pt-4 text-sm">
                  <span className="text-primary-500">Estimated total</span>
                  <strong className="text-primary-950">{formatCurrency(order.totalAmount)}</strong>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

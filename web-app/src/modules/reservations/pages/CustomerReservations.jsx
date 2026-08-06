import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, PackageSearch, RefreshCw, ShoppingBag, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { cancelMyReservation, listMyReservations } from '../../../services/reservationsApi';
import { formatDateTime } from '../../../utils/formatters';

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  waiting_for_stock: 'Waiting for Stock',
  partially_available: 'Partially Available',
  available: 'Available',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_STYLES = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-blue-200 bg-blue-50 text-blue-800',
  waiting_for_stock: 'border-slate-200 bg-slate-50 text-slate-700',
  partially_available: 'border-violet-200 bg-violet-50 text-violet-800',
  available: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rejected: 'border-red-200 bg-red-50 text-red-800',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
};

export default function CustomerReservations() {
  const { success, error: showError } = useToast();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setReservations(await listMyReservations());
    } catch (error) {
      setLoadError(error.message || 'Unable to load reservations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  const cancelReservation = async (reservation) => {
    setCancellingId(reservation.id);
    try {
      const updated = await cancelMyReservation(reservation.id);
      setReservations((current) => current.map((item) => item.id === updated.id ? updated : item));
      success(`${reservation.reservationNumber} was cancelled.`);
    } catch (error) {
      showError(error.message || 'Unable to cancel the reservation.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-primary-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-accent-primary">Customer workspace</p>
          <h1 className="mt-2 text-3xl font-display font-bold text-primary-950">My Part Reservations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-600">Track requested quantities, allocated stock, and availability updates from Limen.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={loadReservations} isLoading={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>Refresh</Button>
          <Link to="/catalog" className="btn btn-primary"><PackageSearch className="h-4 w-4" /> Browse parts</Link>
        </div>
      </header>

      {loadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{loadError}</div>
      )}

      {loading && reservations.length === 0 ? (
        <div className="rounded-3xl border border-primary-200 bg-white p-12 text-center text-primary-600">Loading your reservations…</div>
      ) : reservations.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-primary-300 bg-white p-10 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-primary-300" />
          <h2 className="mt-4 text-xl font-bold text-primary-950">No reservations yet</h2>
          <p className="mt-2 text-sm text-primary-600">Out-of-stock and insufficient-stock parts can be reserved from the catalog.</p>
          <Link to="/catalog" className="btn btn-primary mt-6">Open catalog</Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {reservations.map((reservation) => (
            <article key={reservation.id} className="rounded-3xl border border-primary-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-wider text-primary-500">{reservation.reservationNumber}</p>
                  <h2 className="mt-2 text-lg font-bold text-primary-950">{reservation.product?.name || 'Part'}</h2>
                  <p className="mt-1 font-mono text-sm text-primary-500">{reservation.product?.sku}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[reservation.status] || STATUS_STYLES.pending}`}>
                  {STATUS_LABELS[reservation.status] || reservation.status}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-primary-50 p-4 text-center">
                <div><p className="text-xs text-primary-500">Requested</p><p className="mt-1 text-xl font-bold text-primary-950">{reservation.requestedQuantity}</p></div>
                <div><p className="text-xs text-primary-500">Allocated</p><p className="mt-1 text-xl font-bold text-emerald-700">{reservation.allocatedQuantity}</p></div>
                <div><p className="text-xs text-primary-500">Remaining</p><p className="mt-1 text-xl font-bold text-primary-950">{reservation.remainingQuantity}</p></div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-primary-600">
                <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Requested {formatDateTime(reservation.requestedAt)}</p>
                {reservation.estimatedAvailableOn && <p>Estimated availability: <strong>{reservation.estimatedAvailableOn}</strong></p>}
                {reservation.status === 'available' && <p className="font-bold text-emerald-700">Your requested quantity is ready. Contact Limen for pickup or processing.</p>}
              </div>

              {reservation.canCancel && (
                <div className="mt-5 border-t border-primary-100 pt-4">
                  <Button
                    variant="cancel"
                    onClick={() => cancelReservation(reservation)}
                    isLoading={cancellingId === reservation.id}
                    leftIcon={<XCircle className="h-4 w-4" />}
                  >
                    Cancel pending request
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

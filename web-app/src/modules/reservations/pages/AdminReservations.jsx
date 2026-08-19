import { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, Eye, Filter, PackageCheck, Plus, RefreshCw, X, XCircle } from 'lucide-react';
import Button from '../../../components/ui/Button';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/Toast';
import { getProductCatalog } from '../../../services/catalogApi';
import {
  createAdminReservation,
  getReservation,
  listReservations,
  processReservation,
  searchReservationCustomers,
} from '../../../services/reservationsApi';
import { formatDateTime } from '../../../utils/formatters';

const STATUS_LABELS = {
  pending: 'Pending', approved: 'Approved', waiting_for_stock: 'Waiting for Stock',
  partially_available: 'Partially Available', available: 'Available', completed: 'Completed',
  rejected: 'Rejected', cancelled: 'Cancelled',
};

const INITIAL_FILTERS = { status: 'all', customer: '', part: '', startDate: '', endDate: '' };

export default function AdminReservations() {
  const { success, error: showError } = useToast();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [reservations, setReservations] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [processing, setProcessing] = useState('');
  const [availabilityDates, setAvailabilityDates] = useState({});
  const [activity, setActivity] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ customerId: '', productId: '', quantity: 1, note: '' });
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (!createOpen) return undefined;
    const timer = setTimeout(async () => {
      try {
        const [customers, catalog] = await Promise.all([
          searchReservationCustomers(customerSearch),
          getProductCatalog({ q: productSearch, page: 1, pageSize: 50, includeCategories: false }),
        ]);
        setCustomerOptions(customers ?? []);
        setProductOptions(catalog?.products ?? []);
        setCreateError('');
      } catch (error) {
        setCreateError(error.message || 'Unable to load customers and parts.');
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [createOpen, customerSearch, productSearch]);

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateError('');
    setCreateForm({ customerId: '', productId: '', quantity: 1, note: '' });
    setCustomerSearch('');
    setProductSearch('');
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    if (!createForm.customerId || !createForm.productId) {
      setCreateError('Choose both an existing customer and a part.');
      return;
    }

    setCreateLoading(true);
    setCreateError('');
    try {
      const result = await createAdminReservation(createForm);
      const reservation = result?.reservation;
      await loadQueue();
      success(result?.idempotentReplay
        ? `${reservation?.reservationNumber || 'Reservation'} was already created.`
        : `${reservation?.reservationNumber || 'Reservation'} created for the customer.`);
      setCreateLoading(false);
      closeCreate();
    } catch (error) {
      setCreateError(error.message || 'Unable to create the reservation.');
    } finally {
      setCreateLoading(false);
    }
  };

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await listReservations({ ...appliedFilters, limit: 200 });
      setReservations(response.reservations ?? []);
      setTotal(response.total ?? 0);
    } catch (error) {
      setLoadError(error.message || 'Unable to load reservations.');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const applyAction = async (reservation, action) => {
    setProcessing(`${reservation.id}:${action}`);
    try {
      const updated = await processReservation(reservation.id, {
        action,
        estimatedAvailableOn: availabilityDates[reservation.id] || reservation.estimatedAvailableOn || null,
      });
      setReservations((current) => current.map((item) => item.id === updated.id ? updated : item));
      success(`${reservation.reservationNumber} updated to ${STATUS_LABELS[updated.status] || updated.status}.`);
      return true;
    } catch (error) {
      showError(error.message || 'Unable to update the reservation.');
      return false;
    } finally {
      setProcessing('');
    }
  };

  const requestConfirmation = (reservation, action) => {
    const copy = {
      complete: {
        title: 'Complete reservation?',
        message: `This will finalize ${reservation.reservationNumber} and consume its allocated inventory.`,
        confirmLabel: 'Complete reservation',
        confirmVariant: 'confirm',
      },
      reject: {
        title: 'Reject reservation?',
        message: `This will reject ${reservation.reservationNumber} and release any allocated stock back to availability.`,
        confirmLabel: 'Reject reservation',
        confirmVariant: 'reject',
      },
      cancel: {
        title: 'Cancel reservation?',
        message: `This will cancel ${reservation.reservationNumber} and release any allocated stock back to availability.`,
        confirmLabel: 'Cancel reservation',
        confirmVariant: 'warning',
      },
    }[action];

    setConfirmation({ reservation, action, ...copy });
  };

  const confirmAction = async () => {
    if (!confirmation) return;
    const completed = await applyAction(confirmation.reservation, confirmation.action);
    if (completed) setConfirmation(null);
  };

  const showActivity = async (reservation) => {
    setProcessing(`${reservation.id}:activity`);
    try {
      setActivity(await getReservation(reservation.id));
    } catch (error) {
      showError(error.message || 'Unable to load activity.');
    } finally {
      setProcessing('');
    }
  };

  const isProcessing = (reservation, action) => processing === `${reservation.id}:${action}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-primary-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-accent-primary">Inventory fulfillment</p>
          <h1 className="mt-2 text-3xl font-display font-bold text-primary-950">Part Reservations</h1>
          <p className="mt-2 text-sm text-primary-600">Approve requests, allocate stock in approval order, and retain a complete activity trail.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>Reserve for customer</Button>
          <Button variant="secondary" onClick={loadQueue} isLoading={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>Refresh queue</Button>
        </div>
      </header>

      <form
        className="grid gap-3 rounded-2xl border border-primary-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-6"
        onSubmit={(event) => { event.preventDefault(); setAppliedFilters(filters); }}
      >
        <label className="text-sm font-semibold text-primary-700">Status<select className="input mt-2" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="all">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-semibold text-primary-700">Customer<input className="input mt-2" value={filters.customer} onChange={(event) => setFilters((current) => ({ ...current, customer: event.target.value }))} placeholder="Name, email, phone" /></label>
        <label className="text-sm font-semibold text-primary-700">Part<input className="input mt-2" value={filters.part} onChange={(event) => setFilters((current) => ({ ...current, part: event.target.value }))} placeholder="Name or part number" /></label>
        <label className="text-sm font-semibold text-primary-700">From<input type="date" className="input mt-2" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} /></label>
        <label className="text-sm font-semibold text-primary-700">To<input type="date" className="input mt-2" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} /></label>
        <div className="flex items-end"><Button type="submit" fullWidth leftIcon={<Filter className="h-4 w-4" />}>Apply filters</Button></div>
      </form>

      <div className="flex items-center justify-between text-sm text-primary-600"><span>{total} reservation{total === 1 ? '' : 's'}</span><span>First approved, first served</span></div>
      {loadError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{loadError}</div>}

      {loading && reservations.length === 0 ? (
        <div className="rounded-3xl border border-primary-200 bg-white p-12 text-center">Loading reservation queue…</div>
      ) : reservations.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-primary-300 bg-white p-12 text-center text-primary-600">No reservations match these filters.</div>
      ) : (
        <div className="space-y-4">
          {reservations.map((reservation) => (
            <article key={reservation.id} className="rounded-3xl border border-primary-200 bg-white p-5 shadow-sm">
              <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr_1fr] xl:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-primary-500">{reservation.reservationNumber}</span><span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-bold">{STATUS_LABELS[reservation.status]}</span></div>
                  <h2 className="mt-3 text-lg font-bold text-primary-950">{reservation.product?.name}</h2>
                  <p className="font-mono text-sm text-primary-500">{reservation.product?.sku}</p>
                  <p className="mt-3 text-sm text-primary-700"><strong>{reservation.customer?.name}</strong> · {reservation.customer?.email || reservation.customer?.phone || 'No contact recorded'}</p>
                  <p className="mt-1 text-xs text-primary-500">Requested {formatDateTime(reservation.requestedAt)}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-primary-50 p-4 text-center">
                  <div><p className="text-xs text-primary-500">Requested</p><p className="mt-1 text-xl font-bold">{reservation.requestedQuantity}</p></div>
                  <div><p className="text-xs text-primary-500">Allocated</p><p className="mt-1 text-xl font-bold text-emerald-700">{reservation.allocatedQuantity}</p></div>
                  <div><p className="text-xs text-primary-500">Waiting</p><p className="mt-1 text-xl font-bold">{reservation.remainingQuantity}</p></div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-primary-500">Reliable availability date<input type="date" className="input mt-2" value={availabilityDates[reservation.id] ?? reservation.estimatedAvailableOn ?? ''} onChange={(event) => setAvailabilityDates((current) => ({ ...current, [reservation.id]: event.target.value }))} /></label>
                  <div className="flex flex-wrap gap-2">
                    {reservation.status === 'pending' && <Button size="sm" variant="approve" onClick={() => applyAction(reservation, 'approve')} isLoading={isProcessing(reservation, 'approve')} leftIcon={<Check className="h-4 w-4" />}>Approve</Button>}
                    {['approved', 'waiting_for_stock', 'partially_available'].includes(reservation.status) && <Button size="sm" variant="warning" onClick={() => applyAction(reservation, 'allocate')} isLoading={isProcessing(reservation, 'allocate')} leftIcon={<Clock3 className="h-4 w-4" />}>Allocate stock</Button>}
                    {reservation.status === 'available' && <Button size="sm" variant="confirm" onClick={() => requestConfirmation(reservation, 'complete')} isLoading={isProcessing(reservation, 'complete')} leftIcon={<PackageCheck className="h-4 w-4" />}>Complete</Button>}
                    {reservation.isActive && <Button size="sm" variant="reject" onClick={() => requestConfirmation(reservation, 'reject')} isLoading={isProcessing(reservation, 'reject')} leftIcon={<XCircle className="h-4 w-4" />}>Reject</Button>}
                    {reservation.isActive && <Button size="sm" variant="cancel" onClick={() => requestConfirmation(reservation, 'cancel')} isLoading={isProcessing(reservation, 'cancel')}>Cancel</Button>}
                    <Button size="sm" variant="edit" onClick={() => applyAction(reservation, 'update')} isLoading={isProcessing(reservation, 'update')}>Save date</Button>
                    <Button size="sm" variant="ghost" onClick={() => showActivity(reservation)} isLoading={isProcessing(reservation, 'activity')} leftIcon={<Eye className="h-4 w-4" />}>Activity</Button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {activity && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reservation-activity-title" onClick={() => setActivity(null)}>
          <div className="modal max-w-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p className="text-xs font-bold text-primary-500">{activity.reservationNumber}</p><h2 id="reservation-activity-title" className="modal-title">Reservation activity</h2></div><button type="button" className="btn btn-ghost btn-icon" onClick={() => setActivity(null)} aria-label="Close activity"><X className="h-5 w-5" /></button></div>
            <div className="modal-body space-y-3">
              {(activity.events ?? []).map((event) => <div key={event.id} className="rounded-2xl border border-primary-200 p-4"><div className="flex items-start justify-between gap-3"><p className="font-bold text-primary-950">{String(event.eventType).replaceAll('_', ' ')}</p><time className="text-xs text-primary-500">{formatDateTime(event.createdAt)}</time></div><p className="mt-1 text-sm text-primary-600">{event.fromStatus ? `${STATUS_LABELS[event.fromStatus] || event.fromStatus} → ` : ''}{STATUS_LABELS[event.toStatus] || event.toStatus || ''}</p>{event.note && <p className="mt-2 text-sm text-primary-700">{event.note}</p>}</div>)}
              {(activity.events ?? []).length === 0 && <p className="text-sm text-primary-600">No activity recorded.</p>}
            </div>
            <div className="modal-footer"><Button variant="secondary" onClick={() => setActivity(null)}>Close</Button></div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="create-reservation-title" onClick={closeCreate}>
          <form className="modal max-w-2xl" onSubmit={submitCreate} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div><p className="text-xs font-bold uppercase tracking-wider text-accent-primary">Staff action</p><h2 id="create-reservation-title" className="modal-title">Reserve a part for a customer</h2></div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={closeCreate} aria-label="Close reservation form"><X className="h-5 w-5" /></button>
            </div>
            <div className="modal-body space-y-5">
              <p className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Choose an existing customer and active catalogue part. The reservation starts pending and can be approved from the queue.</p>
              {createError && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{createError}</div>}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-primary-700">Find customer<input className="input mt-2" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Name, email, or phone" /></label>
                <label className="text-sm font-semibold text-primary-700">Find part<input className="input mt-2" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Part name or number" /></label>
                <label className="text-sm font-semibold text-primary-700">Customer<select required className="input mt-2" value={createForm.customerId} onChange={(event) => setCreateForm((current) => ({ ...current, customerId: event.target.value }))}><option value="">Select customer</option>{customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.name || 'Unnamed customer'}{customer.phone ? ` · ${customer.phone}` : customer.email ? ` · ${customer.email}` : ''}</option>)}</select></label>
                <label className="text-sm font-semibold text-primary-700">Part<select required className="input mt-2" value={createForm.productId} onChange={(event) => setCreateForm((current) => ({ ...current, productId: event.target.value }))}><option value="">Select part</option>{productOptions.map((product) => <option key={product.id} value={product.id}>{product.name || 'Unnamed part'}{product.sku ? ` · ${product.sku}` : ''}</option>)}</select></label>
                <label className="text-sm font-semibold text-primary-700">Quantity<input required min="1" max="999" step="1" type="number" className="input mt-2" value={createForm.quantity} onChange={(event) => setCreateForm((current) => ({ ...current, quantity: event.target.value }))} /></label>
                <label className="text-sm font-semibold text-primary-700 md:col-span-2">Internal note<span className="ml-1 font-normal text-primary-500">(optional)</span><textarea className="input mt-2 min-h-24" maxLength="1000" value={createForm.note} onChange={(event) => setCreateForm((current) => ({ ...current, note: event.target.value }))} placeholder="Why is this part being held?" /></label>
              </div>
            </div>
            <div className="modal-footer"><Button type="button" variant="secondary" onClick={closeCreate}>Cancel</Button><Button type="submit" isLoading={createLoading} leftIcon={<Plus className="h-4 w-4" />}>Create reservation</Button></div>
          </form>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmation)}
        title={confirmation?.title}
        message={confirmation?.message}
        confirmLabel={confirmation?.confirmLabel}
        confirmVariant={confirmation?.confirmVariant}
        isLoading={confirmation ? isProcessing(confirmation.reservation, confirmation.action) : false}
        onConfirm={confirmAction}
        onClose={() => setConfirmation(null)}
      />
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Archive, ArchiveRestore, Check, Clock3, Eye, Filter, Minus, Package, PackageCheck, Plus, RefreshCw, Trash2, X, XCircle } from 'lucide-react';
import { validateReservationForm } from '../utils/reservationForm';
import Button from '../../../components/ui/Button';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/Toast';
import { getProductCatalog } from '../../../services/catalogApi';
import {
  createAdminReservation,
  getReservation,
  getReservationCheckout,
  listReservations,
  processReservation,
} from '../../../services/reservationsApi';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';

const STATUS_LABELS = {
  pending: 'Pending', approved: 'Approved', waiting_for_stock: 'Waiting for Stock',
  partially_available: 'Partially Available', available: 'Available', completed: 'Completed',
  rejected: 'Rejected', cancelled: 'Cancelled',
};

const INITIAL_FILTERS = { status: 'all', archive: 'current', customer: '', part: '', startDate: '', endDate: '' };
const EMPTY_FORM = { customerName: '', customerPhone: '', customerEmail: '', items: [], note: '', paymentStatus: 'unpaid' };

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
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const createRequestKey = useRef(null);
  const submitLock = useRef(false);
  const [checkout, setCheckout] = useState(null);
  const [checkoutPayment, setCheckoutPayment] = useState({ paymentMethod: 'cash', cashReceived: '' });
  const [productSearch, setProductSearch] = useState('');
  const [productOptions, setProductOptions] = useState([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [validationShown, setValidationShown] = useState(false);
  const formErrors = validationShown ? validateReservationForm(createForm) : {};
  const updateQuantity = (productId, quantity) => setCreateForm((current) => ({ ...current, items: current.items.map((item) => item.productId === productId ? { ...item, quantity } : item) }));

  useEffect(() => {
    if (!createOpen) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const catalog = await getProductCatalog({ q: productSearch, page: 1, pageSize: 50, includeCategories: false });
        if (active) setProductOptions((catalog?.products ?? []).filter((product) => product.isActive !== false && !product.archived));
      } catch (error) {
        if (active) setCreateError(error.message || 'Unable to load parts.');
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [createOpen, productSearch]);

  const closeCreate = () => {
    if (submitLock.current) return;
    setCreateOpen(false);
    setCreateError('');
    setValidationShown(false);
    setCreateForm(EMPTY_FORM);
    createRequestKey.current = null;
    setProductOptions([]);
    setProductSearch('');
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    if (submitLock.current) return;
    setValidationShown(true);
    const errors = validateReservationForm(createForm);
    if (Object.keys(errors).length) {
      setCreateError('');
      event.currentTarget.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus();
      return;
    }

    submitLock.current = true;
    createRequestKey.current ||= crypto.randomUUID();
    setCreateLoading(true);
    setCreateError('');
    try {
      const result = await createAdminReservation({ ...createForm, requestKey: createRequestKey.current, items: createForm.items.map(({ productId, quantity }) => ({ productId, quantity: Number(quantity) })) });
      const reservation = result?.reservation;
      await loadQueue();
      success(result?.idempotentReplay
        ? `${reservation?.reservationNumber || 'Reservation'} was already created.`
        : `${reservation?.reservationNumber || 'Reservation'} created for the customer.`);
      setCreateLoading(false);
      submitLock.current = false;
      closeCreate();
    } catch (error) {
      setCreateError(error.message || 'Unable to create the reservation.');
    } finally {
      submitLock.current = false;
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

  const applyAction = async (reservation, action, payment = {}) => {
    setProcessing(`${reservation.id}:${action}`);
    try {
      const updated = await processReservation(reservation.id, {
        action,
        ...payment,
        estimatedAvailableOn: availabilityDates[reservation.id] || reservation.estimatedAvailableOn || null,
      });
      await loadQueue();
      success(action === 'archive' ? 'Reservation archived. You can find it in Archived.' : action === 'restore' ? 'Reservation restored. Its original status is unchanged.' : updated.sale
        ? `Reservation added to Sales: ${updated.sale.transactionNumber}. Total ${formatCurrency(updated.sale.totalAmount)}.`
        : `${reservation.reservationNumber} updated to ${STATUS_LABELS[updated.status] || updated.status}.`);
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
      archive: {
        title: 'Archive this reservation?',
        message: 'This removes it from the current list. Its activity and linked sale stay saved, and you can restore it later.',
        confirmLabel: 'Archive reservation',
        confirmVariant: 'primary',
      },
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

  const openCheckout = async (reservation) => {
    setProcessing(`${reservation.id}:checkout`);
    try {
      const data = await getReservationCheckout(reservation.id);
      setCheckout({ ...data, reservation });
      setCheckoutPayment({ paymentMethod: 'cash', cashReceived: '' });
    } catch (error) { showError(error.message || 'Unable to prepare checkout.'); }
    finally { setProcessing(''); }
  };

  const submitCheckout = async (event) => {
    event.preventDefault();
    if (!checkout || submitLock.current) return;
    submitLock.current = true;
    try {
      const completed = await applyAction(checkout.reservation, 'complete', { ...checkoutPayment, cashReceived: Number(checkoutPayment.cashReceived || 0), expectedTotal: checkout.total });
      if (completed) setCheckout(null);
      else {
        try {
          const refreshed = await getReservationCheckout(checkout.reservation.id);
          setCheckout({ ...refreshed, reservation: checkout.reservation });
        } catch (error) { showError(error.message || 'Unable to refresh checkout. Close it and review the reservation queue.'); }
      }
    } finally { submitLock.current = false; }
  };

  const addPart = (product) => {
    setCreateForm((current) => {
      const existing = current.items.find((item) => item.productId === product.id);
      if (existing) return { ...current, items: current.items.map((item) => item.productId === product.id ? { ...item, quantity: Math.min(Number(item.quantity || 0) + 1, 999) } : item) };
      if (current.items.length >= 50) return current;
      return { ...current, items: [...current.items, { productId: product.id, name: product.name, sku: product.sku, price: Number(product.price || 0), quantity: 1 }] };
    });
  };
  const estimateTotal = createForm.items.reduce((sum, item) => sum + item.price * Number(item.quantity || 0), 0);
  const groupMap = new Map();
  for (const reservation of reservations) {
    const groupId = reservation.order?.id || reservation.id;
    if (!groupMap.has(groupId)) groupMap.set(groupId, { id: groupId, order: reservation.order, lines: [] });
    groupMap.get(groupId).lines.push(reservation);
  }
  const reservationGroups = [...groupMap.values()];

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

      <div className="flex gap-1 border-b border-primary-200" aria-label="Reservation views">
        {['current', 'archived'].map((view) => <button key={view} type="button" aria-pressed={appliedFilters.archive === view} className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${appliedFilters.archive === view ? 'border-accent-primary text-accent-primary' : 'border-transparent text-primary-500 hover:text-primary-800'}`} onClick={() => { setFilters((current) => ({ ...current, archive: view })); setAppliedFilters((current) => ({ ...current, archive: view })); }}>{view === 'current' ? 'Current' : 'Archived'}</button>)}
      </div>

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

      <div className="flex items-center justify-between text-sm text-primary-600"><span>{total} reserved part line{total === 1 ? '' : 's'}</span><span>First approved, first served</span></div>
      {loadError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{loadError}</div>}

      {loading && reservations.length === 0 ? (
        <div className="rounded-3xl border border-primary-200 bg-white p-12 text-center">Loading reservation queue…</div>
      ) : reservations.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-primary-300 bg-white p-12 text-center text-primary-600">No reservations match these filters.</div>
      ) : (
        <div className="space-y-4">
          {reservationGroups.map((group) => (
            <section key={group.id} className="overflow-hidden rounded-2xl border border-primary-200 bg-white">
              {group.order && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-200 bg-primary-50 px-5 py-4"><div><p className="font-mono text-sm font-semibold">{group.order.reservationNumber}</p><p className="mt-1 text-sm text-primary-600">{group.order.partCount} part(s) · Estimated total {formatCurrency(group.order.estimatedTotal)}{group.lines.length < group.order.partCount ? ` · Showing ${group.lines.length} matching line(s)` : ''}</p></div>{!group.order.saleId && group.lines.some((line) => line.status === 'available') && <Button size="sm" variant="confirm" disabled={!group.order.readyForCheckout || Boolean(processing)} onClick={() => openCheckout(group.lines.find((line) => line.status === 'available'))} isLoading={group.lines.some((line) => isProcessing(line, 'checkout'))} leftIcon={<PackageCheck className="h-4 w-4" />}>Checkout order</Button>}{group.order.saleId && <p className="text-sm font-semibold text-emerald-700">Recorded in Sales</p>}</div>}
              {group.lines.map((reservation) => (
            <article key={reservation.id} className="rounded-3xl border border-primary-200 bg-white p-5 shadow-sm">
              <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr_1fr] xl:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-primary-500">{reservation.reservationNumber}</span><span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-bold">{STATUS_LABELS[reservation.status]}</span><span className={`rounded-full border px-3 py-1 text-xs font-bold ${reservation.paymentStatus === 'paid' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{reservation.paymentStatus === 'paid' ? 'Paid' : reservation.paymentStatus === 'partial' ? 'Partially paid' : 'Unpaid'}</span></div>
                  <h2 className="mt-3 text-lg font-bold text-primary-950">{reservation.product?.name}</h2>
                  <p className="font-mono text-sm text-primary-500">{reservation.product?.sku}</p>
                  {reservation.lineTotal !== null && <p className="mt-1 text-sm text-primary-700">{formatCurrency(reservation.unitPrice)} each · Line total {formatCurrency(reservation.lineTotal)}</p>}
                  {reservation.order?.saleId && <p className="mt-1 text-sm font-semibold text-emerald-700">Recorded in Sales</p>}
                  <p className="mt-3 text-sm text-primary-700"><strong>{reservation.customer?.name}</strong> · {reservation.customer?.email || reservation.customer?.phone || 'No contact recorded'}</p>
                  <p className="mt-1 text-xs text-primary-500">Requested {formatDateTime(reservation.requestedAt)}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-primary-50 p-4 text-center">
                  <div><p className="text-xs text-primary-500">Requested</p><p className="mt-1 text-xl font-bold">{reservation.requestedQuantity}</p></div>
                  <div><p className="text-xs text-primary-500">Allocated</p><p className="mt-1 text-xl font-bold text-emerald-700">{reservation.allocatedQuantity}</p></div>
                  <div><p className="text-xs text-primary-500">Waiting</p><p className="mt-1 text-xl font-bold">{reservation.remainingQuantity}</p></div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-primary-500">Reliable availability date<input disabled={reservation.archived} type="date" className="input mt-2" value={availabilityDates[reservation.id] ?? reservation.estimatedAvailableOn ?? ''} onChange={(event) => setAvailabilityDates((current) => ({ ...current, [reservation.id]: event.target.value }))} /></label>
                  <div className="flex flex-wrap gap-2">
                    {reservation.status === 'pending' && <Button size="sm" variant="approve" onClick={() => applyAction(reservation, 'approve')} isLoading={isProcessing(reservation, 'approve')} leftIcon={<Check className="h-4 w-4" />}>Approve</Button>}
                    {['approved', 'waiting_for_stock', 'partially_available'].includes(reservation.status) && <Button size="sm" variant="warning" onClick={() => applyAction(reservation, 'allocate')} isLoading={isProcessing(reservation, 'allocate')} leftIcon={<Clock3 className="h-4 w-4" />}>Allocate stock</Button>}
                    {reservation.isActive && <Button size="sm" variant="reject" onClick={() => requestConfirmation(reservation, 'reject')} isLoading={isProcessing(reservation, 'reject')} leftIcon={<XCircle className="h-4 w-4" />}>Reject</Button>}
                    {reservation.isActive && <Button size="sm" variant="cancel" onClick={() => requestConfirmation(reservation, 'cancel')} isLoading={isProcessing(reservation, 'cancel')}>Cancel</Button>}
                    {!reservation.archived && <Button size="sm" variant="edit" onClick={() => applyAction(reservation, 'update')} isLoading={isProcessing(reservation, 'update')}>Save date</Button>}
                    {!reservation.archived && ['completed', 'cancelled', 'rejected'].includes(reservation.status) && <Button size="sm" variant="secondary" disabled={Boolean(processing)} onClick={() => requestConfirmation(reservation, 'archive')} leftIcon={<Archive className="h-4 w-4" />}>Archive</Button>}
                    {reservation.archived && <Button size="sm" variant="secondary" disabled={Boolean(processing)} isLoading={isProcessing(reservation, 'restore')} onClick={() => applyAction(reservation, 'restore')} leftIcon={<ArchiveRestore className="h-4 w-4" />}>Restore</Button>}
                    <Button size="sm" variant="ghost" onClick={() => showActivity(reservation)} isLoading={isProcessing(reservation, 'activity')} leftIcon={<Eye className="h-4 w-4" />}>Activity</Button>
                  </div>
                </div>
              </div>
            </article>
              ))}
            </section>
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
          <form className="modal max-w-2xl" noValidate onSubmit={submitCreate} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div><p className="text-xs font-bold uppercase tracking-wider text-accent-primary">Staff action</p><h2 id="create-reservation-title" className="modal-title">Reserve parts for a customer</h2></div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={closeCreate} aria-label="Close reservation form"><X className="h-5 w-5" /></button>
            </div>
            <div className="modal-body space-y-5">
              <p className="text-sm text-primary-600">Add the customer's parts and quantities. Each part starts pending; checkout records the available order as one sale.</p>
              {createError && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">We couldn’t create the reservation</p><p className="mt-1">{createError}</p></div></div>}
              {Object.keys(formErrors).length > 0 && <p role="alert" className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />Please check the highlighted details below.</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="text-sm font-semibold text-primary-700" htmlFor="reservation-customer-name">Customer name</label><input id="reservation-customer-name" name="customerName" required disabled={createLoading} aria-invalid={Boolean(formErrors.customerName)} aria-describedby={formErrors.customerName ? 'reservation-name-error' : undefined} className={`input mt-2 ${formErrors.customerName ? 'border-red-400' : ''}`} value={createForm.customerName} onChange={(event) => setCreateForm((current) => ({ ...current, customerName: event.target.value }))} placeholder="Full name" />{formErrors.customerName && <p id="reservation-name-error" className="mt-2 text-xs text-red-700">{formErrors.customerName}</p>}</div>
                <div><label className="text-sm font-semibold text-primary-700" htmlFor="reservation-phone">Phone</label><input id="reservation-phone" name="customerPhone" required disabled={createLoading} type="tel" aria-invalid={Boolean(formErrors.customerPhone)} aria-describedby={formErrors.customerPhone ? 'reservation-phone-error' : undefined} className={`input mt-2 ${formErrors.customerPhone ? 'border-red-400' : ''}`} value={createForm.customerPhone} onChange={(event) => setCreateForm((current) => ({ ...current, customerPhone: event.target.value }))} placeholder="09XX XXX XXXX" />{formErrors.customerPhone && <p id="reservation-phone-error" className="mt-2 text-xs text-red-700">{formErrors.customerPhone}</p>}</div>
                <div><label className="text-sm font-semibold text-primary-700" htmlFor="reservation-email">Email<span className="ml-1 font-normal text-primary-500">(optional)</span></label><input id="reservation-email" name="customerEmail" disabled={createLoading} type="email" aria-invalid={Boolean(formErrors.customerEmail)} aria-describedby={formErrors.customerEmail ? 'reservation-email-error' : undefined} className={`input mt-2 ${formErrors.customerEmail ? 'border-red-400' : ''}`} value={createForm.customerEmail} onChange={(event) => setCreateForm((current) => ({ ...current, customerEmail: event.target.value }))} placeholder="customer@example.com" />{formErrors.customerEmail && <p id="reservation-email-error" className="mt-2 text-xs text-red-700">{formErrors.customerEmail}</p>}</div>
                <label className="text-sm font-semibold text-primary-700">Payment status<select className="input mt-2" value={createForm.paymentStatus} onChange={(event) => setCreateForm((current) => ({ ...current, paymentStatus: event.target.value }))}><option value="unpaid">Unpaid</option><option value="partial">Partially paid</option><option value="paid">Paid</option></select></label>
                <div className="text-sm font-semibold text-primary-700 md:col-span-2">
                  <label htmlFor="reservation-part-search">Search parts</label>
                  <input id="reservation-part-search" name="items" aria-invalid={Boolean(formErrors.items)} aria-describedby={formErrors.items ? 'reservation-parts-error' : undefined} className={`input mt-2 ${formErrors.items ? 'border-red-400' : ''}`} value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Type a part name or number" />
                  {formErrors.items && <p id="reservation-parts-error" className="mt-2 text-xs font-normal text-red-700">{formErrors.items}</p>}
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto" aria-label="Matching parts">
                    {productOptions.slice(0, 8).map((product) => <button key={product.id} type="button" disabled={createLoading || createForm.items.length >= 50} className="flex w-full items-center justify-between gap-3 rounded-lg border border-primary-200 bg-white px-3 py-3 text-left text-sm hover:border-accent-blue" onClick={() => addPart(product)}><span>{product.name || 'Unnamed part'}<span className="block font-mono text-xs text-primary-500">{product.sku} · {formatCurrency(product.price)}</span></span><Plus className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="sr-only">Add part</span></button>)}
                  </div>
                </div>
                <div className="space-y-3 md:col-span-2" aria-label="Reserved parts">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-primary-900">Selected parts</h3><span className="text-xs text-primary-500">{createForm.items.length} {createForm.items.length === 1 ? 'part' : 'parts'}</span></div>
                  {!createForm.items.length && <div className="flex items-center gap-3 rounded-xl border border-dashed border-primary-300 px-4 py-5 text-sm text-primary-500"><Package className="h-5 w-5 shrink-0" /><p>No parts selected yet. Search above and tap + to add a part.</p></div>}
                  {createForm.items.length > 0 && <div className="divide-y divide-primary-200 overflow-hidden rounded-xl border border-primary-200">
                    {createForm.items.map((item) => <div key={item.productId} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_6rem_2.75rem] ${formErrors[`quantity-${item.productId}`] ? 'bg-red-50' : 'bg-white'}`}>
                      <div className="min-w-0"><p className="break-words text-sm font-semibold leading-snug text-primary-900">{item.name}</p><p className="mt-1 text-xs text-primary-500"><span className="font-mono">{item.sku}</span><span className="mx-2" aria-hidden="true">·</span>{formatCurrency(item.price)} each</p></div>
                      <div className="col-start-1 row-start-2 sm:col-start-2 sm:row-start-1"><label htmlFor={`reservation-quantity-${item.productId}`} className="sr-only">Quantity</label><div className="inline-flex h-11 items-center rounded-lg border border-primary-200">
                        <button type="button" disabled={createLoading || Number(item.quantity) <= 1} aria-label={`Decrease quantity for ${item.name}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-l-lg text-primary-600 hover:bg-primary-50 disabled:opacity-30" onClick={() => updateQuantity(item.productId, Math.max(1, Number(item.quantity || 1) - 1))}><Minus className="h-3.5 w-3.5" /></button>
                        <input id={`reservation-quantity-${item.productId}`} name={`quantity-${item.productId}`} aria-invalid={Boolean(formErrors[`quantity-${item.productId}`])} aria-describedby={formErrors[`quantity-${item.productId}`] ? `quantity-error-${item.productId}` : undefined} required min="1" max="999" step="1" type="number" inputMode="numeric" disabled={createLoading} className="h-full w-10 min-w-0 bg-transparent text-center text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-accent-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={item.quantity} onChange={(event) => updateQuantity(item.productId, event.target.value)} />
                        <button type="button" disabled={createLoading || Number(item.quantity) >= 999} aria-label={`Increase quantity for ${item.name}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-r-lg text-primary-600 hover:bg-primary-50 disabled:opacity-30" onClick={() => updateQuantity(item.productId, Math.min(999, Number(item.quantity || 0) + 1))}><Plus className="h-3.5 w-3.5" /></button>
                      </div></div>
                      <p className="col-start-2 row-start-2 text-right text-sm font-semibold tabular-nums text-primary-900 sm:col-start-3 sm:row-start-1"><span className="sr-only">Line total: </span>{formatCurrency(item.price * Number(item.quantity || 0))}</p>
                      <button type="button" disabled={createLoading} aria-label={`Remove ${item.name}`} className="col-start-2 row-start-1 flex min-h-11 min-w-11 items-center justify-center justify-self-end rounded-lg text-primary-400 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-accent-primary sm:col-start-4" onClick={() => setCreateForm((current) => ({ ...current, items: current.items.filter((line) => line.productId !== item.productId) }))}><Trash2 className="h-4 w-4" /></button>
                      {formErrors[`quantity-${item.productId}`] && <p id={`quantity-error-${item.productId}`} className="col-span-full text-xs text-red-700">{formErrors[`quantity-${item.productId}`]}</p>}
                    </div>)}
                  </div>}
                  <div className="flex items-center justify-between gap-4 pt-1"><p className="text-sm font-semibold text-primary-900">Estimated total</p><span className="text-lg font-bold tabular-nums text-primary-900" aria-live="polite">{formatCurrency(estimateTotal)}</span></div>
                  <p className="text-xs leading-relaxed text-primary-500">Prices are confirmed when you create the reservation and checked again at checkout.</p>
                </div>
                <label className="text-sm font-semibold text-primary-700 md:col-span-2">Internal note<span className="ml-1 font-normal text-primary-500">(optional)</span><textarea className="input mt-2 min-h-24" maxLength="1000" value={createForm.note} onChange={(event) => setCreateForm((current) => ({ ...current, note: event.target.value }))} placeholder="Why is this part being held?" /></label>
              </div>
            </div>
            <div className="modal-footer"><Button type="button" variant="secondary" onClick={closeCreate}>Cancel</Button><Button type="submit" isLoading={createLoading} leftIcon={<Plus className="h-4 w-4" />}>Create reservation</Button></div>
          </form>
        </div>
      )}

      {checkout && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reservation-checkout-title">
          <form className="modal max-w-2xl" onSubmit={submitCheckout}>
            <div className="modal-header"><div><p className="text-xs text-primary-500">{checkout.order.reservationNumber}</p><h2 id="reservation-checkout-title" className="modal-title">Complete reservation & record sale</h2></div><button type="button" disabled={Boolean(processing)} className="btn btn-ghost btn-icon" aria-label="Close checkout" onClick={() => setCheckout(null)}><X className="h-5 w-5" /></button></div>
            <div className="modal-body space-y-4">
              <p className="text-sm text-primary-600">Review the current selling prices and confirm payment for the whole order. Stock and Sales update together.</p>
              {checkout.items.map((item) => <div key={item.id} className="flex justify-between gap-4 border-b border-primary-100 pb-3 text-sm"><div><p className="font-semibold">{item.product?.name}</p><p className="text-primary-500">{item.requestedQuantity} × {formatCurrency(item.unitPrice)} · {item.product?.sku}</p></div><span>{formatCurrency(item.lineTotal)}</span></div>)}
              <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatCurrency(checkout.total)}</span></div>
              <label className="block text-sm font-semibold">Payment method<select disabled={Boolean(processing)} className="input mt-2" value={checkoutPayment.paymentMethod} onChange={(event) => setCheckoutPayment((current) => ({ ...current, paymentMethod: event.target.value }))}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank_transfer">Bank transfer</option></select></label>
              {checkoutPayment.paymentMethod === 'cash' && <label className="block text-sm font-semibold">Cash received<input required disabled={Boolean(processing)} type="number" min={checkout.total} step="0.01" className="input mt-2" value={checkoutPayment.cashReceived} onChange={(event) => setCheckoutPayment((current) => ({ ...current, cashReceived: event.target.value }))} /></label>}
              {checkoutPayment.paymentMethod === 'cash' && <p className="text-sm">Change: {formatCurrency(Math.max(Number(checkoutPayment.cashReceived || 0) - checkout.total, 0))}</p>}
            </div>
            <div className="modal-footer"><Button type="button" variant="secondary" disabled={Boolean(processing)} onClick={() => setCheckout(null)}>Cancel</Button><Button type="submit" isLoading={Boolean(processing)} disabled={checkoutPayment.paymentMethod === 'cash' && Number(checkoutPayment.cashReceived || 0) < checkout.total}>Confirm sale</Button></div>
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

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../../../context/useAuth";
import {
  changeSupplierOrder,
  getSupplierOrder,
  getSupplierOrderReceipt,
} from "../../../services/supplierOrderApi";
import SupplierOrderReceiving from "../components/SupplierOrderReceiving";
import ReceivedStockHandoff from "../components/ReceivedStockHandoff";

export default function SupplierOrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  return (
    <SupplierOrderWorkspace key={`${user?.id}:${id}`} id={id} user={user} />
  );
}
function SupplierOrderWorkspace({ id, user }) {
  const admin = user?.role === "admin";
  const [state, setState] = useState({ order: null, loading: true, error: "" });
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const flight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    getSupplierOrder(id, page, controller.signal)
      .then((order) => {
        if (active) setState({ order, loading: false, error: "" });
      })
      .catch((error) => {
        if (active)
          setState({ order: null, loading: false, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, page, reload]);
  const refresh = () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    setReload((x) => x + 1);
  };
  const action = async (value) => {
    if (flight.current) return;
    const prompt =
      value === "ordered"
        ? "Confirm that this order has already been placed with the supplier outside LimenServe. No message, payment or purchase will be sent."
        : "Cancel all unreceived quantities? Previously received stock and history will remain unchanged.";
    if (!window.confirm(prompt)) return;
    flight.current = true;
    setBusy(true);
    setActionError("");
    try {
      const order = await changeSupplierOrder(id, {
        action: value,
        expectedVersion: state.order.version,
      });
      setState({ order, loading: false, error: "" });
      setPage(1);
    } catch (e) {
      setActionError(e.message + " Reload the order before retrying.");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const showReceipt = async (key) => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setActionError("");
    try {
      setReceipt(await getSupplierOrderReceipt(id, key));
    } catch (e) {
      setActionError(e.message);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const order = state.order;
  return (
    <div className="space-y-4 pb-12">
      <Link
        to="/inventory/orders"
        className="inline-flex min-h-11 items-center font-semibold text-blue-800"
      >
        ← Supplier orders
      </Link>
      {receipt && (
        <section className="space-y-3 rounded-xl border border-green-300 bg-green-50 p-4">
          <h2 className="text-xl font-bold text-green-950">
            Stock receipt confirmed
          </h2>
          <p className="break-all text-sm">
            {receipt.referenceNumber} · {receipt.totalQuantity} received units
          </p>
          <ReceivedStockHandoff receipt={receipt} />
          <button
            type="button"
            className="btn border border-green-400 bg-white"
            disabled={state.loading || Boolean(state.error)}
            onClick={() => {
              setReceipt(null);
              refresh();
            }}
          >
            Return to updated order
          </button>
        </section>
      )}
      {actionError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
        >
          {actionError}
        </p>
      )}
      {state.loading ? (
        <p role="status">Loading supplier order…</p>
      ) : state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4"
        >
          {state.error}
          <button
            className="ml-3 min-h-11 font-semibold underline"
            type="button"
            onClick={refresh}
          >
            Retry
          </button>
        </p>
      ) : (
        order && (
          <>
            <header className="space-y-3 rounded-xl border border-primary-200 bg-white p-5">
              <p className="break-all font-mono text-sm font-bold text-primary-800">
                {order.code}
              </p>
              <h1 className="text-2xl font-bold text-primary-950">
                {order.supplierName}
              </h1>
              <p className="font-semibold text-blue-800">{order.status}</p>
              <p className="text-sm text-primary-700">
                Supplier reference: {order.externalReference || "Not provided"}{" "}
                · Expected delivery: {order.expectedDate || "Not confirmed"}
              </p>
              {order.notes && (
                <p className="break-words text-sm text-primary-800">
                  {order.notes}
                </p>
              )}
              <p className="text-xs text-primary-600">
                This is an internal order record. Only confirmed receiving adds
                stock. Delivery dates do not prove that stock arrived.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn border border-primary-300"
                  disabled={busy}
                  onClick={refresh}
                >
                  Reload order
                </button>
                {admin && order.stage === "draft" && (
                  <>
                    <Link
                      className="btn border border-primary-300"
                      to={`/inventory/orders/${id}/edit`}
                    >
                      Edit draft
                    </Link>
                    <button
                      type="button"
                      className="btn bg-blue-800 text-white"
                      disabled={busy}
                      onClick={() => action("ordered")}
                    >
                      Mark as placed with supplier
                    </button>
                  </>
                )}
                {admin &&
                  order.stage !== "cancelled" &&
                  order.status !== "Received" && (
                    <button
                      type="button"
                      className="btn border border-red-300 text-red-700"
                      disabled={busy}
                      onClick={() => action("cancelled")}
                    >
                      Cancel unreceived quantities
                    </button>
                  )}
              </div>
            </header>
            <section className="rounded-xl border border-primary-200 bg-white p-4">
              <h2 className="font-bold text-primary-950">Order quantities</h2>
              <div className="divide-y divide-primary-200">
                {order.items.map((i) => (
                  <article key={i.originalProductId} className="space-y-2 py-3">
                    <p className="break-all font-mono font-bold text-primary-950">
                      {i.sku}
                    </p>
                    <p className="break-words text-sm text-primary-800">
                      {i.name}
                    </p>
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-primary-50 p-3 text-sm">
                      <p>
                        Ordered
                        <strong className="block text-lg">{i.quantity}</strong>
                      </p>
                      <p>
                        Received
                        <strong className="block text-lg">{i.received}</strong>
                      </p>
                      <p>
                        {order.stage === "cancelled"
                          ? "Cancelled"
                          : "Remaining"}
                        <strong className="block text-lg">{i.remaining}</strong>
                      </p>
                    </div>
                    {!i.available && (
                      <p className="text-sm text-amber-900">
                        This part is inactive or removed. It cannot be received
                        while unavailable.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
            {!receipt &&
              order.stage === "ordered" &&
              order.status !== "Received" && (
                <SupplierOrderReceiving
                  key={order.id}
                  order={order}
                  onConfirmed={(saved) => {
                    setReceipt(saved);
                    setActionError("");
                    refresh();
                  }}
                />
              )}
            <section className="space-y-3 rounded-xl border border-primary-200 bg-white p-4">
              <h2 className="font-bold text-primary-950">Order history</h2>
              {!order.events.length && (
                <p className="text-sm text-primary-700">No recorded events.</p>
              )}
              <ol className="space-y-3">
                {order.events.map((event) => (
                  <li
                    key={event.id}
                    className="border-l-2 border-blue-200 pl-3"
                  >
                    <p className="font-semibold text-primary-900">
                      {event.kind}
                    </p>
                    <time
                      className="text-xs text-primary-600"
                      dateTime={event.created_at}
                    >
                      {new Date(event.created_at).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}
                    </time>
                    {event.details?.totalQuantity && (
                      <p className="text-sm">
                        {event.details.totalQuantity} units received
                      </p>
                    )}
                    {event.details?.notes && (
                      <p className="break-words text-sm">
                        {event.details.notes}
                      </p>
                    )}
                    {event.details?.requestId && (
                      <button
                        type="button"
                        className="block min-h-11 text-sm font-semibold text-blue-800 underline"
                        disabled={busy}
                        onClick={() => showReceipt(event.details.requestId)}
                      >
                        View linked receipt
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-primary-600">
                Philippine time · {order.eventCount} recorded events
              </p>
              {order.eventCount > 20 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="btn border border-primary-300"
                    disabled={page <= 1 || busy}
                    onClick={() => {
                      setState((current) => ({ ...current, loading: true }));
                      setPage((x) => x - 1);
                    }}
                  >
                    Newer
                  </button>
                  <span>
                    {page} / {Math.ceil(order.eventCount / 20)}
                  </span>
                  <button
                    type="button"
                    className="btn border border-primary-300"
                    disabled={page * 20 >= order.eventCount || busy}
                    onClick={() => {
                      setState((current) => ({ ...current, loading: true }));
                      setPage((x) => x + 1);
                    }}
                  >
                    Older
                  </button>
                </div>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../../context/useAuth";
import { receiveSupplierOrder } from "../../../services/supplierOrderApi";

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const initial = () => ({
  requestId: crypto.randomUUID(),
  quantities: {},
  receivedDate: today(),
  referenceNumber: "",
  reason: "",
  submitted: false,
  payload: null,
});
const field = "input mt-1 min-h-11 w-full min-w-0";
export default function SupplierOrderReceiving({ order, onConfirmed }) {
  const { user } = useAuth();
  const storageKey = `limen:supplier-receipt:v1:${user.id}:${order.id}`;
  const [draft, setDraft] = useState(initial);
  const [ready, setReady] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef(false);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (
        stored?.requestId &&
        stored.quantities &&
        typeof stored.quantities === "object"
      )
        setDraft(stored);
    } catch {
      /* Keep unreadable storage untouched until the user starts a valid receipt. */
    }
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      setError(
        "Device storage is unavailable. Keep this page open; a receipt cannot be submitted until its retry reference is saved.",
      );
    }
  }, [draft, ready, storageKey]);
  const patch = (change) => {
    if (!busy && !draft.submitted) {
      setDraft((current) => ({ ...current, ...change }));
      setReview(false);
    }
  };
  const receive = async () => {
    if (flight.current) return;
    let payload = draft.payload;
    if (!draft.submitted) {
      const items = order.items
        .filter((i) => Number(draft.quantities[i.originalProductId] || 0) > 0)
        .map((i) => ({
          productId: i.productId,
          quantity: Number(draft.quantities[i.originalProductId]),
        }));
      const invalid = order.items.some((i) => {
        const value = draft.quantities[i.originalProductId];
        return (
          value != null &&
          value !== "" &&
          (!Number.isInteger(Number(value)) ||
            Number(value) < 0 ||
            Number(value) > i.remaining ||
            (Number(value) > 0 && !i.available))
        );
      });
      if (
        !items.length ||
        invalid ||
        !draft.receivedDate ||
        draft.receivedDate > today()
      ) {
        setError(
          "Enter only quantities that arrived, up to each remaining quantity, and a valid received date. Leave undelivered lines at 0.",
        );
        return;
      }
      if (!review) {
        setReview(true);
        setError("");
        return;
      }
      payload = {
        requestId: draft.requestId,
        expectedVersion: order.version,
        items,
        receivedDate: draft.receivedDate,
        referenceNumber: draft.referenceNumber,
        reason: draft.reason,
      };
    }
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const submitted = { ...draft, submitted: true, payload };
      localStorage.setItem(storageKey, JSON.stringify(submitted));
      setDraft(submitted);
      const receipt = await receiveSupplierOrder(order.id, payload);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* Server acknowledgement remains authoritative. */
      }
      onConfirmed(receipt);
    } catch (e) {
      setError(e.message);
      if (e.receiptRejected) {
        setDraft((current) => ({
          ...current,
          requestId: crypto.randomUUID(),
          submitted: false,
          payload: null,
        }));
        setReview(false);
      }
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const pending = order.items.filter((i) => i.remaining > 0);
  const submitted = draft.submitted;
  if (!ready) return <p role="status">Loading receipt draft…</p>;
  return (
    <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div>
        <h2 className="text-lg font-bold text-primary-950">
          Receive this delivery
        </h2>
        <p className="mt-1 text-sm text-primary-800">
          Enter actual delivered quantities only. This confirms a stock increase
          and links it to this order. Use separate receipts for separate
          deliveries.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-white p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      {submitted && (
        <p className="rounded-lg border border-amber-300 bg-white p-3 text-sm">
          This receipt was submitted. Details are locked while its result is
          unknown. Retry this same receipt; do not start another one for this
          delivery.
        </p>
      )}
      <fieldset disabled={busy || submitted} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Actual received date
            <input
              className={field}
              type="date"
              max={today()}
              value={draft.receivedDate}
              onChange={(e) => patch({ receivedDate: e.target.value })}
            />
          </label>
          <label className="text-sm font-semibold">
            Delivery / invoice reference (optional)
            <input
              className={field}
              maxLength={120}
              value={draft.referenceNumber}
              onChange={(e) => patch({ referenceNumber: e.target.value })}
            />
          </label>
        </div>
        <label className="block text-sm font-semibold">
          Notes
          <input
            className={field}
            maxLength={1000}
            value={draft.reason}
            onChange={(e) => patch({ reason: e.target.value })}
          />
        </label>
        <div className="divide-y divide-blue-200">
          {pending.map((i) => (
            <div
              key={i.originalProductId}
              className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="break-all font-mono font-bold">{i.sku}</p>
                <p className="break-words text-sm">{i.name}</p>
                <p className="text-xs text-primary-700">
                  Remaining: {i.remaining}
                  {!i.available ? " · Part inactive or removed" : ""}
                </p>
              </div>
              <label className="text-xs font-semibold">
                Arrived now
                <input
                  className={field}
                  disabled={!i.available}
                  type="number"
                  min="0"
                  max={i.remaining}
                  step="1"
                  value={draft.quantities[i.originalProductId] ?? "0"}
                  onChange={(e) =>
                    patch({
                      quantities: {
                        ...draft.quantities,
                        [i.originalProductId]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      {review && !submitted && (
        <p className="rounded-lg border border-blue-300 bg-white p-3 text-sm font-semibold">
          Review the date and quantities above. Confirm only after checking the
          physical delivery. All selected lines post together.
        </p>
      )}
      <button
        type="button"
        className="btn bg-blue-800 text-white"
        disabled={busy}
        onClick={receive}
      >
        {busy
          ? "Confirming receipt…"
          : submitted
            ? "Check / retry this receipt"
            : review
              ? "Confirm received stock"
              : "Review delivery"}
      </button>
    </section>
  );
}

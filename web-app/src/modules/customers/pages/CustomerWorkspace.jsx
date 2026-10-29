import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuth } from "../../../context/useAuth";
import { getCustomerHistory } from "../../../services/customerHistoryApi";
import { formatCurrency } from "../../../utils/formatters";
import CustomerRecordPreview from "../components/CustomerRecordPreview";

const views = [
  ["orders", "Service orders"],
  ["vehicles", "Vehicles"],
  ["sales", "Sales"],
  ["quotes", "Quotations"],
];
const label = (value) =>
  value ? String(value).replaceAll("_", " ") : "Not recorded";
const money = (value) =>
  value == null ? "Not recorded" : formatCurrency(value);
const date = (value) =>
  value
    ? new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" })
    : "Not recorded";
function HistoryItem({ item, kind, onVehicle, onPreview }) {
  if (kind === "vehicles")
    return (
      <article className="min-w-0 rounded-xl border border-primary-200 bg-white p-4">
        <h2 className="break-words text-lg font-bold text-primary-950">
          {item.plate || "Plate not recorded"}
        </h2>
        <p className="mt-1 text-sm text-primary-800">
          {[item.year, item.make, item.model].filter(Boolean).join(" ") ||
            "Vehicle details not recorded"}
        </p>
        <p className="mt-2 text-xs text-primary-700">
          {item.currentLink
            ? "Currently linked to this customer record."
            : "Linked through a previous service order or quotation. This does not establish current ownership."}
        </p>
        <button
          type="button"
          className="btn mt-3 border border-blue-300 text-blue-800"
          onClick={() => onVehicle(item.id)}
        >
          View this vehicle’s history
        </button>
      </article>
    );
  return (
    <article className="min-w-0 space-y-2 rounded-xl border border-primary-200 bg-white p-4">
      <h2 className="break-all font-mono font-bold text-primary-950">
        {item.reference}
      </h2>
      <p className="text-xs text-primary-700">
        {date(item.createdAt)} · Philippine time
      </p>
      <p className="text-sm capitalize text-primary-800">
        {kind === "orders" ? "Service status" : "Recorded status"}:{" "}
        <strong>{label(item.status)}</strong>
      </p>
      {kind === "orders" && (
        <>
          <p className="text-sm capitalize text-primary-800">
            Work: {label(item.workStage)} · Payment: {label(item.paymentStatus)}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-primary-800">
            {item.note || "No work description recorded."}
          </p>
        </>
      )}
      {(item.plate || item.vehicleLabel) && (
        <p className="break-words text-sm text-primary-800">
          {item.plate} · {item.vehicleLabel}
        </p>
      )}
      <p className="text-sm text-primary-900">
        {kind === "quotes"
          ? "Saved quote total"
          : kind === "orders"
            ? "Recorded order amount"
            : "Recorded sale total"}
        : <strong>{money(item.total)}</strong>
      </p>
      {kind === "quotes" && (
        <p className="text-xs text-primary-700">
          Valid until: {item.validUntil || "Not recorded"}
          {item.archived ? " · Archived" : ""}
        </p>
      )}
      {kind === "sales" && (
        <p className="text-xs text-primary-700">
          Payment method: {label(item.paymentMethod)} · Stock posting recorded:{" "}
          {item.inventoryApplied ? "Yes" : "No"}
        </p>
      )}
      {kind === "orders" ? (
        <Link
          className="inline-flex min-h-11 items-center font-semibold text-blue-800 underline"
          to={`/services/${item.id}`}
        >
          Open service order →
        </Link>
      ) : (
        <button
          type="button"
          className="btn border border-blue-300 text-blue-800"
          onClick={() => onPreview(item)}
        >
          View saved items
        </button>
      )}
    </article>
  );
}
export default function CustomerWorkspace() {
  const { customerId } = useParams();
  const { user } = useAuth();
  return (
    <Workspace
      key={`${customerId}:${user?.id}:${user?.role}`}
      customerId={customerId}
      admin={user?.role === "admin"}
    />
  );
}
function Workspace({ customerId, admin }) {
  const [params, setParams] = useSearchParams();
  const options = views.filter(([id]) => id !== "quotes" || admin),
    raw = params.get("view") || "orders";
  const kind = options.some(([id]) => id === raw) ? raw : "orders",
    vehicle = params.get("vehicle") || "";
  const rawPage = Number(params.get("page") || 1),
    page =
      Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100000
        ? rawPage
        : 1;
  const [reload, setReload] = useState(0),
    [state, setState] = useState({ key: "", items: [], counts: {}, error: "" }),
    [preview, setPreview] = useState(null);
  const key = JSON.stringify([customerId, kind, vehicle, page, reload]),
    loading = state.key !== key;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    getCustomerHistory(
      customerId,
      { view: kind, vehicle: vehicle || undefined, page },
      controller.signal,
    )
      .then((data) => {
        if (active) setState({ ...data, key, error: "" });
      })
      .catch((error) => {
        if (active)
          setState({ key, items: [], counts: {}, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [customerId, kind, vehicle, page, reload, key]);
  const change = (next) => {
    setPreview(null);
    setParams(
      { view: kind, ...(vehicle ? { vehicle } : {}), page: 1, ...next },
      { replace: true },
    );
  };
  return (
    <div className="space-y-4 pb-10">
      <Link
        to="/customers"
        className="inline-flex min-h-11 items-center font-semibold text-blue-800"
      >
        ← Customer search
      </Link>
      {state.customer && (
        <header className="rounded-xl border border-primary-200 bg-white p-5">
          <h1 className="break-words text-2xl font-bold text-primary-950">
            {state.customer.name || "Saved customer"}
          </h1>
          <p className="mt-2 break-words text-sm text-primary-800">
            {state.customer.phone || "No phone recorded"}
          </p>
          <p className="mt-2 text-xs text-primary-700">
            Current contact details · Saved customer record
          </p>
          <details className="mt-2 text-xs text-primary-700">
            <summary className="min-h-11 cursor-pointer py-3">
              Record information
            </summary>
            <p className="break-all font-mono">{state.customer.id}</p>
            <p className="mt-1">
              Added {date(state.customer.created_at)} · Philippine time
            </p>
          </details>
        </header>
      )}
      <div className="flex flex-wrap gap-3 rounded-xl border border-primary-200 bg-white p-3">
        <label className="min-w-0 flex-1 text-sm font-semibold text-primary-800">
          History view
          <select
            className="input mt-1 min-h-11 w-full"
            value={kind}
            onChange={(event) => change({ view: event.target.value })}
          >
            {options.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn self-end border border-primary-300"
          disabled={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          Refresh
        </button>
      </div>
      {loading ? (
        <p role="status">Loading linked history…</p>
      ) : state.error ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {state.error}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn border border-amber-300"
              onClick={() => setReload((value) => value + 1)}
            >
              Retry
            </button>
            {vehicle && (
              <button
                type="button"
                className="btn border border-amber-300"
                onClick={() => change({ vehicle: "" })}
              >
                Clear vehicle filter
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {state.selectedVehicle && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-primary-950">
                Vehicle history:{" "}
                <strong>
                  {state.selectedVehicle.plate_no || "Plate not recorded"}
                </strong>{" "}
                ·{" "}
                {[
                  state.selectedVehicle.year,
                  state.selectedVehicle.make,
                  state.selectedVehicle.model_name,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </p>
              <button
                type="button"
                className="btn border border-blue-300 text-blue-800"
                onClick={() => change({ vehicle: "" })}
              >
                All linked vehicles
              </button>
            </div>
          )}
          <details className="rounded-lg border border-primary-200 bg-white p-3 text-xs leading-5 text-primary-700">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">
              What history is included?
            </summary>
            <p>
              Only records linked to this saved customer are included. Sales
              with only a name, or no customer link, are not assigned here. A
              vehicle filter includes sales only when their saved quotation
              identifies that vehicle and this same customer. No matches are
              merged automatically.
            </p>
            <p className="mt-2">
              Service and vehicle labels may use current details. Quotes and
              sale amounts use their saved records. An order amount or payment
              method alone is not proof that payment was received.
            </p>
          </details>
          <p className="text-xs text-primary-700">
            {state.total} {state.total === 1 ? "record" : "records"} · Page{" "}
            {page} of {Math.max(1, Math.ceil(state.total / 20))} · Checked{" "}
            {date(state.checkedAt)} · Philippine time
          </p>
          {!state.items.length && (
            <p className="rounded-xl border border-primary-200 bg-white p-6 text-sm text-primary-700">
              No linked records in this view. Try another history view or clear
              the vehicle filter. Older unlinked records are not guessed into
              this history.
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {state.items.map((item) => (
              <HistoryItem
                key={item.id}
                item={item}
                kind={kind}
                onVehicle={(id) => change({ view: "orders", vehicle: id })}
                onPreview={setPreview}
              />
            ))}
          </div>
          {(state.total > 20 || page > 1) && (
            <div className="flex flex-wrap justify-between gap-2">
              <button
                type="button"
                className="btn border border-primary-300"
                disabled={page <= 1}
                onClick={() => change({ page: page - 1 })}
              >
                Previous
              </button>
              {page > 1 && !state.items.length && (
                <button
                  type="button"
                  className="btn border border-primary-300"
                  onClick={() => change({ page: 1 })}
                >
                  First page
                </button>
              )}
              <button
                type="button"
                className="btn border border-primary-300"
                disabled={page * 20 >= state.total}
                onClick={() => change({ page: page + 1 })}
              >
                Next
              </button>
            </div>
          )}
          {preview && (
            <CustomerRecordPreview
              key={`${kind}:${preview.id}`}
              record={preview}
              kind={kind}
              onClose={() => setPreview(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

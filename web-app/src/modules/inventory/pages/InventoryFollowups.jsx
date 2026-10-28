import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../../../context/useAuth";
import { getInventoryFollowups } from "../../../services/inventoryFollowupApi";
import { buildLocator3DUrl } from "../../locator3d/utils/locatorNavigation";

const views = [
  ["work", "Working queue"],
  ["location", "Location checks"],
  ["reorder", "At reorder point"],
  ["overdue", "Overdue deliveries"],
  ["undated", "Deliveries without a date"],
  ["planning", "Planning details"],
  ["all", "All follow-ups"],
];
const titles = Object.fromEntries(views);
function followupText(item, admin) {
  if (item.kind === "location")
    return "Stock is recorded, but there is no complete shelf/bin location in the current published layout. Check the location in the locator.";
  if (item.kind === "reorder")
    return `Available stock is ${item.available}, at or below the saved reorder point of ${item.reorder_point}. Review incoming orders before ordering more.`;
  if (item.kind === "overdue")
    return `The saved delivery date was ${item.expected_date}. Confirm the remaining delivery with the supplier; record stock only when it arrives.`;
  if (item.kind === "undated")
    return "This placed order still has outstanding units and no saved arrival date. Check the order and confirm delivery details with the supplier.";
  const gaps = [
    item.missing_threshold && "reorder point",
    item.missing_supplier && "supplier",
    item.missing_lead_time && "delivery time",
  ].filter(Boolean);
  return `Missing: ${gaps.join(", ")}. ${admin ? "Enter the settings that apply to this part." : "Ask an administrator to enter the settings that apply to this part."} This is not a shortage alert.`;
}
function Record({ item, admin }) {
  const href = item.order_id
    ? `/inventory/orders/${encodeURIComponent(item.order_id)}`
    : item.kind === "location"
      ? buildLocator3DUrl({
          id: item.product_id,
          sku: item.sku,
          name: item.name,
        })
      : `/inventory/replenishment?${new URLSearchParams({ filter: "all", q: item.sku })}`;
  const action = item.order_id
    ? "Review supplier order"
    : item.kind === "location"
      ? "Check warehouse location"
      : admin
        ? "Review reorder settings"
        : "View reorder settings";
  return (
    <article className="min-w-0 rounded-xl border border-primary-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-all font-mono font-bold text-primary-950">
            {item.sku}
          </h2>
          <p className="mt-1 break-words text-sm text-primary-800">
            {item.name}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${item.kind === "overdue" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-primary-200 bg-primary-50 text-primary-800"}`}
        >
          {titles[item.kind]}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-primary-800">
        {followupText(item, admin)}
      </p>
      <p className="mt-2 text-sm font-semibold text-primary-900">
        {item.order_id
          ? `${item.supplier_name || "Recorded supplier"} · ${item.remaining} units still to arrive`
          : `On hand: ${item.on_hand} · Available: ${item.available}`}
      </p>
      <Link
        className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-blue-300 bg-white px-3 text-sm font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
        to={href}
      >
        {action} →
      </Link>
    </article>
  );
}
export default function InventoryFollowups() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const rawFilter = params.get("view") || "work";
  const filter = views.some(([key]) => key === rawFilter) ? rawFilter : "work";
  const q = (params.get("q") || "").slice(0, 120);
  const rawPage = Number(params.get("page") || 1);
  const page =
    Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100000
      ? rawPage
      : 1;
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({
    items: [],
    counts: {},
    total: 0,
    loading: true,
    error: "",
  });
  const requestKey = JSON.stringify([filter, q, page, reload]);
  const loading = state.loading || state.key !== requestKey;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(
      () =>
        getInventoryFollowups({ filter, q, page }, controller.signal)
          .then((data) => {
            if (active)
              setState({ ...data, key: requestKey, loading: false, error: "" });
          })
          .catch((error) => {
            if (active)
              setState({
                items: [],
                counts: {},
                total: 0,
                key: requestKey,
                loading: false,
                error: error.message,
              });
          }),
      220,
    );
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [filter, q, page, reload, requestKey]);
  const change = (next) => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    setParams({ view: filter, q, ...next }, { replace: true });
  };
  return (
    <div className="space-y-4 pb-10">
      <Link
        to="/inventory"
        className="inline-flex min-h-11 items-center font-semibold text-blue-800"
      >
        ← Inventory
      </Link>
      <header className="rounded-xl border border-primary-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-primary-950">
          Stock follow-ups
        </h1>
        <p className="mt-2 text-sm text-primary-700">
          Check stock issues and planning details. Open a record to make a
          change.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/inventory/replenishment"
            className="btn border border-primary-300"
          >
            Replenishment
          </Link>
          <Link
            to="/inventory/orders"
            className="btn border border-primary-300"
          >
            Supplier orders
          </Link>
        </div>
      </header>
      <div className="grid gap-3 rounded-xl border border-primary-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]">
        <label className="min-w-0 text-sm font-semibold text-primary-800">
          View
          <select
            className="input mt-1 min-h-11 w-full min-w-0"
            value={filter}
            onChange={(e) => change({ view: e.target.value, page: 1 })}
          >
            {views.map(([key, title]) => (
              <option key={key} value={key}>
                {title}
                {!loading && !state.error ? ` (${state.counts[key] ?? 0})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-sm font-semibold text-primary-800">
          Search part or supplier order
          <input
            className="input mt-1 min-h-11 w-full min-w-0"
            value={q}
            maxLength={120}
            onChange={(e) => change({ q: e.target.value, page: 1 })}
          />
        </label>
        <button
          type="button"
          className="btn self-end border border-primary-300"
          disabled={loading}
          onClick={() => {
            setState((current) => ({ ...current, loading: true, error: "" }));
            setReload((value) => value + 1);
          }}
        >
          Refresh
        </button>
      </div>
      <p className="text-xs leading-5 text-primary-700">
        The working queue covers saved reorder alerts, location checks and
        overdue supplier deliveries. Planning details are separate. Counts cover
        all records, not just the search results. One part can have more than
        one follow-up.
      </p>
      {loading ? (
        <p role="status">Checking saved stock records…</p>
      ) : state.error ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {state.error}
          <p className="mt-2">Use Refresh to retry. No stock was changed.</p>
        </div>
      ) : (
        <>
          {!state.layout && (
            <p
              role="status"
              className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              No published warehouse layout is available. Location checks will
              stay open until an administrator publishes a layout with saved
              shelf/bin locations.
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2 text-xs text-primary-700">
            <p>
              {state.total.toLocaleString("en-PH")} follow-ups · Page {page} of{" "}
              {Math.max(1, Math.ceil(state.total / 24))}
            </p>
            <p>
              Checked{" "}
              {new Date(state.checkedAt).toLocaleString("en-PH", {
                timeZone: "Asia/Manila",
              })}{" "}
              · Philippine time
            </p>
          </div>
          {!state.items.length ? (
            <div className="rounded-xl border border-primary-200 bg-white p-6">
              <h2 className="font-bold text-primary-950">
                {q ? "No matching follow-ups" : "No follow-ups in this view"}
              </h2>
              <p className="mt-2 text-sm text-primary-700">
                {q
                  ? "Try another part number or clear your search."
                  : "This does not confirm that every part is stocked or every planning setting is complete. Choose Planning details to review missing settings."}
              </p>
              {page > 1 && (
                <button
                  type="button"
                  className="btn mt-3 border border-primary-300"
                  onClick={() => change({ page: 1 })}
                >
                  Go to first page
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {state.items.map((item) => (
                <Record
                  key={item.id}
                  item={item}
                  admin={user?.role === "admin"}
                />
              ))}
            </div>
          )}
          {state.layout && (
            <p className="text-xs text-primary-700">
              Location checks use the published layout: {state.layout.name}. A
              saved location does not confirm that a physical put-away check was
              performed.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="btn border border-primary-300"
              disabled={page <= 1}
              onClick={() => change({ page: page - 1 })}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn border border-primary-300"
              disabled={page * 24 >= state.total}
              onClick={() => change({ page: page + 1 })}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

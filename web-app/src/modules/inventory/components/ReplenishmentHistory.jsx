import { useEffect, useState } from "react";
import { getReplenishmentHistory } from "../../../services/replenishmentApi";

function describe(plan) {
  if (Object.hasOwn(plan, "reorderPoint"))
    return `Point: ${plan.reorderPoint} · Quantity: ${plan.reorderQuantity} · Priority: ${plan.priority || "not set / not recorded"}`;
  return `${plan.supplierName || (plan.supplierId ? "Former supplier" : "No supplier")} · Delivery: ${plan.leadTimeDays === null ? "unknown" : `${plan.leadTimeDays} calendar days`}`;
}

export default function ReplenishmentHistory({ productId }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({
    items: [],
    total: 0,
    loading: true,
    error: "",
  });
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    getReplenishmentHistory(productId, page, controller.signal)
      .then((data) => {
        if (active) setState({ ...data, loading: false, error: "" });
      })
      .catch((error) => {
        if (active)
          setState({
            items: [],
            total: 0,
            loading: false,
            error: error.message,
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [open, productId, page, reload]);
  const changePage = (next) => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    setPage(next);
  };
  return (
    <details
      className="rounded-lg border border-primary-200 p-3"
      onToggle={(event) => {
        if (event.currentTarget.open)
          setState((current) => ({ ...current, loading: true, error: "" }));
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold text-primary-800">
        Settings history
      </summary>
      {open && (
        <div className="mt-3 space-y-3 text-sm text-primary-800">
          {state.loading ? (
            <p role="status">Loading settings history…</p>
          ) : state.error ? (
            <p role="alert">
              {state.error}
              <button
                type="button"
                className="ml-2 min-h-11 font-semibold underline"
                onClick={() => {
                  setState((current) => ({ ...current, loading: true }));
                  setReload((value) => value + 1);
                }}
              >
                Retry
              </button>
            </p>
          ) : (
            <>
              {!state.items.length && <p>No recorded settings changes yet.</p>}
              <ol className="space-y-3">
                {state.items.map((event) => (
                  <li
                    key={event.id}
                    className="space-y-1 border-l-2 border-blue-200 pl-3"
                  >
                    <p className="font-semibold">{event.kind}</p>
                    <time
                      dateTime={event.created_at}
                      className="text-xs text-primary-600"
                    >
                      {new Date(event.created_at).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}
                    </time>
                    <p className="break-words">
                      Before: {describe(event.previous)}
                    </p>
                    <p className="break-words">
                      Saved: {describe(event.saved)}
                    </p>
                  </li>
                ))}
              </ol>
              {state.total > 10 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="btn border border-primary-300"
                    disabled={page <= 1}
                    onClick={() => changePage(page - 1)}
                  >
                    Newer changes
                  </button>
                  <span>
                    {page} / {Math.ceil(state.total / 10)}
                  </span>
                  <button
                    type="button"
                    className="btn border border-primary-300"
                    disabled={page * 10 >= state.total}
                    onClick={() => changePage(page + 1)}
                  >
                    Older changes
                  </button>
                </div>
              )}
            </>
          )}
          <p className="text-xs text-primary-600">
            Settings changes only—not deliveries or stock movements. Times are
            Philippine time. Earlier changes are shown only if they were
            recorded.
          </p>
        </div>
      )}
    </details>
  );
}

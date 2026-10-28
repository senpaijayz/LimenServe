import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getInventoryFollowupSummary } from "../../../services/inventoryFollowupApi";

export default function InventoryFollowupSummary() {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ loading: true, error: "", counts: {} });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    getInventoryFollowupSummary(controller.signal)
      .then((data) => {
        if (active) setState({ ...data, loading: false, error: "" });
      })
      .catch((error) => {
        if (active)
          setState({ loading: false, error: error.message, counts: {} });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reload]);
  return (
    <section
      aria-label="Stock follow-ups"
      className="rounded-xl border border-primary-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-primary-950">Stock follow-ups</h2>
        <Link
          to="/inventory/follow-ups"
          className="inline-flex min-h-11 items-center font-semibold text-blue-800 underline"
        >
          Open queue →
        </Link>
      </div>
      {state.loading ? (
        <p role="status" className="text-sm text-primary-700">
          Checking stock records…
        </p>
      ) : state.error ? (
        <div role="alert" className="text-sm text-amber-900">
          {state.error}
          <button
            type="button"
            className="ml-2 min-h-11 font-semibold underline"
            onClick={() => {
              setState((current) => ({ ...current, loading: true, error: "" }));
              setReload((value) => value + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["work", "Working queue"],
              ["planning", "Planning details"],
              ["undated", "Undated deliveries"],
            ].map(([key, label]) => (
              <Link
                key={key}
                to={`/inventory/follow-ups?view=${key}`}
                className="min-w-0 rounded-lg border border-primary-200 bg-primary-50 p-2 hover:border-blue-500 sm:p-3"
              >
                <strong className="block text-xl tabular-nums text-primary-950">
                  {(state.counts[key] ?? 0).toLocaleString("en-PH")}
                </strong>
                <span className="mt-1 block break-words text-xs font-semibold text-primary-800">
                  {label}
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-primary-700">
            Working queue: reorder alerts, location checks and overdue
            deliveries. Missing planning settings are not shortage alerts.
          </p>
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-primary-700">
        {!state.loading && !state.error && (
          <p>
            Checked{" "}
            {new Date(state.checkedAt).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
            })}{" "}
            · Philippine time
          </p>
        )}
        <button
          type="button"
          aria-label="Refresh stock follow-ups"
          className="min-h-11 font-semibold text-blue-800 underline"
          disabled={state.loading}
          onClick={() => {
            setState((current) => ({ ...current, loading: true, error: "" }));
            setReload((value) => value + 1);
          }}
        >
          Refresh
        </button>
      </div>
    </section>
  );
}

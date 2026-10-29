import { useEffect, useState } from "react";
import { Link } from "react-router";
import { findCustomers } from "../../../services/customerHistoryApi";

export default function CustomerSearch() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0);
  const [state, setState] = useState({
    items: [],
    total: 0,
    key: "",
    error: "",
  });
  const query = q.trim(),
    key = JSON.stringify([query, page, reload]);
  const ready = query.length >= 2,
    loading = ready && state.key !== key;
  useEffect(() => {
    if (query.length < 2) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        findCustomers({ q: query, page }, controller.signal)
          .then((data) => {
            if (active) setState({ ...data, key, error: "" });
          })
          .catch((error) => {
            if (active)
              setState({ items: [], total: 0, key, error: error.message });
          }),
      250,
    );
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, page, reload, key]);
  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-xl border border-primary-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-primary-950">
          Customers & vehicles
        </h1>
        <p className="mt-2 text-sm text-primary-700">
          Find a saved customer, then review their vehicles and previous visits.
        </p>
      </header>
      <label className="block rounded-xl border border-primary-200 bg-white p-4 text-sm font-semibold text-primary-800">
        Search name, phone or plate number
        <input
          className="input mt-2 min-h-11 w-full"
          maxLength={120}
          autoComplete="off"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
        />
      </label>
      <p className="text-xs leading-5 text-primary-700">
        Choose the correct record before opening history. Similar names or
        matching search results do not mean two records belong to the same
        person.
      </p>
      {!ready ? (
        <p className="rounded-xl border border-primary-200 bg-white p-6 text-sm text-primary-700">
          Enter at least two characters to find a customer.
        </p>
      ) : loading ? (
        <p role="status">Finding saved customers…</p>
      ) : state.error ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {state.error}
          <button
            type="button"
            className="ml-2 min-h-11 font-semibold underline"
            onClick={() => setReload((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-primary-700">
            {state.total} matching {state.total === 1 ? "record" : "records"} ·
            Page {page} of {Math.max(1, Math.ceil(state.total / 24))}
          </p>
          {!state.items.length && (
            <p className="rounded-xl border border-primary-200 bg-white p-6 text-sm text-primary-700">
              No saved customer matches this search. Try a phone number or
              plate, or record a new visit through Service Orders.
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {state.items.map((customer) => (
              <article
                key={customer.id}
                className="min-w-0 rounded-xl border border-primary-200 bg-white p-4"
              >
                <h2 className="break-words text-lg font-bold text-primary-950">
                  {customer.name || "Unnamed customer"}
                </h2>
                <p className="mt-1 break-words text-sm text-primary-800">
                  {customer.phone || "No phone recorded"}
                </p>
                <p className="mt-3 text-sm text-primary-700">
                  Service orders: {customer.service_count} · Linked vehicles:{" "}
                  {customer.vehicle_count} · Linked sales: {customer.sale_count}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-primary-600">
                  Record {customer.id}
                </p>
                <Link
                  to={`/customers/${customer.id}`}
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-blue-300 px-3 text-sm font-semibold text-blue-800 hover:bg-blue-50"
                >
                  Open customer history →
                </Link>
              </article>
            ))}
          </div>
          {state.total > 24 && (
            <div className="flex justify-between gap-2">
              <button
                type="button"
                className="btn border border-primary-300"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn border border-primary-300"
                disabled={page * 24 >= state.total}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { findCustomers } from "../../../services/customerHistoryApi";

const PAGE_SIZE = 10;

function formatDate(value) {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not recorded"
    : date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });
}

export default function CustomerSearch() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ items: [], total: 0, key: "", error: "" });
  const query = q.trim();
  const key = JSON.stringify([query, page, sort, reload]);
  const ready = query.length === 0 || query.length >= 2;
  const loading = ready && state.key !== key;

  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      findCustomers({ q: query, page, pageSize: PAGE_SIZE, sort, directory: true }, controller.signal)
        .then((data) => {
          if (active) setState({ ...data, key, error: "" });
        })
        .catch((error) => {
          if (active) setState({ items: [], total: 0, key, error: error.message });
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, page, sort, reload, key, ready]);

  const pageCount = Math.max(1, Math.ceil(state.total / PAGE_SIZE));

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-xl border border-primary-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-primary-950">Customers & vehicles</h1>
        <p className="mt-2 text-sm text-primary-700">Browse recent customer records or search by name, phone, or plate.</p>
      </header>

      <section className="rounded-xl border border-primary-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
          <label className="block text-sm font-semibold text-primary-800">
            Search name, phone or plate number
            <input
              className="input mt-2 min-h-11 w-full"
              maxLength={120}
              autoComplete="off"
              placeholder="Leave blank to browse recent customers"
              value={q}
              onChange={(event) => { setQ(event.target.value); setPage(1); }}
            />
          </label>
          <label className="block text-sm font-semibold text-primary-800">
            Sort by date
            <select className="input mt-2 min-h-11 w-full" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
      </section>

      <p className="text-xs leading-5 text-primary-700">
        Choose the correct record before opening history. Similar names or matching search results do not mean two records belong to the same person.
      </p>

      {!ready ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Enter at least two characters to search, or clear the field to browse customers.</p>
      ) : loading ? (
        <p role="status" className="rounded-xl border border-primary-200 bg-white p-6 text-sm text-primary-700">Loading customer records…</p>
      ) : state.error ? (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          {state.error}
          <button type="button" className="ml-2 min-h-11 font-semibold underline" onClick={() => setReload((value) => value + 1)}>Retry</button>
        </div>
      ) : (
        <>
          <p className="text-sm text-primary-700">
            {query ? `${state.total} matching ${state.total === 1 ? "record" : "records"}` : `${state.total} saved ${state.total === 1 ? "customer" : "customers"}`} · Page {page} of {pageCount}
          </p>
          {!state.items.length ? (
            <p className="rounded-xl border border-primary-200 bg-white p-6 text-sm text-primary-700">
              {query ? "No saved customer matches this search. Try a phone number or plate, or clear the search to browse recent records." : "No saved customer records are available yet."}
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {state.items.map((customer) => (
                <article key={customer.id} className="min-w-0 rounded-xl border border-primary-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="break-words text-lg font-bold text-primary-950">{customer.name || "Unnamed customer"}</h2>
                      <p className="mt-1 break-words text-sm text-primary-800">{customer.phone || "No phone recorded"}</p>
                    </div>
                    <time className="shrink-0 text-xs text-primary-600">{formatDate(customer.created_at)}</time>
                  </div>
                  <p className="mt-3 text-sm text-primary-700">
                    Service orders: {customer.service_count ?? 0} · Linked vehicles: {customer.vehicle_count ?? 0} · Linked sales: {customer.sale_count ?? 0}
                  </p>
                  <Link to={`/customers/${customer.id}`} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-blue-300 px-3 text-sm font-semibold text-blue-800 hover:bg-blue-50">
                    Open customer history →
                  </Link>
                </article>
              ))}
            </div>
          )}
          {state.total > PAGE_SIZE && <div className="flex items-center justify-between gap-3">
            <button type="button" className="btn border border-primary-300" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span className="text-sm text-primary-700">Page {page} of {pageCount}</span>
            <button type="button" className="btn border border-primary-300" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>}
        </>
      )}
    </div>
  );
}

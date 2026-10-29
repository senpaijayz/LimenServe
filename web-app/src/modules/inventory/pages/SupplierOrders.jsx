import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../../context/useAuth";
import { getSupplierOrders } from "../../../services/supplierOrderApi";

export default function SupplierOrders() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("pending");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({
    items: [],
    total: 0,
    loading: true,
    error: "",
  });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(
      () =>
        getSupplierOrders({ filter, q, page }, controller.signal)
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
          }),
      220,
    );
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [filter, q, page, reload]);
  const change = (action) => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    action();
  };
  return (
    <div className="space-y-4 pb-10">
      <Link
        to="/inventory"
        className="inline-flex min-h-11 items-center font-semibold text-blue-800"
      >
        ← Inventory
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-primary-200 bg-white p-5">
        <div>
          <h1 className="text-2xl font-bold text-primary-950">
            Supplier orders
          </h1>
          <p className="mt-2 text-sm text-primary-700">
            Track orders placed with suppliers and receive the quantities that
            actually arrive. Drafts do not add stock or contact suppliers.
          </p>
        </div>
        {user?.role === "admin" && (
          <Link
            to="/inventory/orders/new"
            className="btn bg-blue-800 text-white"
          >
            New order draft
          </Link>
        )}
      </header>
      <div className="grid gap-3 rounded-xl border border-primary-200 bg-white p-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-primary-800">
          View
          <select
            className="input mt-1 min-h-11 w-full"
            value={filter}
            onChange={(e) =>
              change(() => {
                setFilter(e.target.value);
                setPage(1);
              })
            }
          >
            {[
              ["pending", "Awaiting delivery"],
              ["draft", "Drafts"],
              ["received", "Received"],
              ["cancelled", "Cancelled"],
              ["all", "All orders"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-primary-800">
          Search order or supplier
          <input
            className="input mt-1 min-h-11 w-full"
            value={q}
            onChange={(e) =>
              change(() => {
                setQ(e.target.value);
                setPage(1);
              })
            }
          />
        </label>
      </div>
      {state.loading ? (
        <p role="status">Loading supplier orders…</p>
      ) : state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4"
        >
          {state.error}
          <button
            type="button"
            className="ml-3 min-h-11 font-semibold underline"
            onClick={() => change(() => setReload((x) => x + 1))}
          >
            Retry
          </button>
        </p>
      ) : (
        <>
          <p className="text-sm text-primary-700">
            {state.total} matching orders · Page {page} of{" "}
            {Math.max(1, Math.ceil(state.total / 20))}
          </p>
          {!state.items.length && (
            <section className="rounded-xl border border-primary-200 bg-white p-6 text-primary-800">
              <h2 className="font-semibold">No orders in this view</h2>
              <p className="mt-2 text-sm">
                Record a draft when you have real ordering details. Mark it
                placed only after arranging the order with the supplier.
              </p>
            </section>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {state.items.map((order) => (
              <Link
                key={order.id}
                to={`/inventory/orders/${order.id}`}
                className="space-y-2 rounded-xl border border-primary-200 bg-white p-4 hover:border-blue-500"
              >
                <p className="break-all font-mono text-sm font-bold text-primary-950">
                  {order.code}
                </p>
                <p className="font-semibold text-primary-800">
                  {order.supplierName}
                </p>
                <p className="text-sm text-blue-800">{order.status}</p>
                <p className="text-sm text-primary-700">
                  {order.stage === "cancelled"
                    ? "Unreceived / cancelled"
                    : "Remaining"}
                  : {order.remaining} units · Expected:{" "}
                  {order.expectedDate || "Not confirmed"}
                </p>
              </Link>
            ))}
          </div>
          <div className="flex justify-between gap-3">
            <button
              type="button"
              className="btn border border-primary-300"
              disabled={page <= 1}
              onClick={() => change(() => setPage((x) => x - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn border border-primary-300"
              disabled={page * 20 >= state.total}
              onClick={() => change(() => setPage((x) => x + 1))}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

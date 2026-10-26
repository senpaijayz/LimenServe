import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  Search,
} from "lucide-react";
import {
  searchPackageProducts,
  searchPackageServices,
  searchPackageVehicles,
} from "../../../services/managedPackagesApi";
import { formatCurrency } from "../../../utils/formatters";

const loaders = {
  product: searchPackageProducts,
  service: searchPackageServices,
  vehicle: searchPackageVehicles,
};
const resultKeys = {
  product: "products",
  service: "services",
  vehicle: "vehicles",
};

export default function PackageRecordSearch({
  kind = "product",
  selectedIds = [],
  onSelect,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({
    rows: [],
    pagination: { totalPages: 1, totalCount: 0 },
    loading: true,
    error: "",
  });
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const result = await loaders[kind](
          { search, page, pageSize: 6 },
          controller.signal,
        );
        if (!controller.signal.aborted)
          setState({
            rows: result[resultKeys[kind]] || [],
            pagination: result.pagination,
            loading: false,
            error: "",
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            loading: false,
            error: error.message,
          }));
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, search, page, retry]);
  return (
    <section
      className="min-w-0 space-y-3 rounded-2xl border border-primary-200 bg-primary-50/60 p-3 sm:p-4"
      aria-label={`Find ${kind}s`}
    >
      <label className="block text-sm font-semibold text-primary-800">
        {kind === "product"
          ? "Find a part"
          : kind === "service"
            ? "Find a service"
            : "Find a recorded vehicle configuration"}
        <span className="relative mt-2 block">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-primary-500" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            maxLength={120}
            placeholder={
              kind === "product"
                ? "Part number, name, category, model, or brand"
                : kind === "service"
                  ? "Service code, name, or category"
                  : "Model, engine, or vehicle family"
            }
            className="min-h-11 w-full rounded-xl border border-primary-300 bg-white pl-10 pr-3 text-sm font-normal text-primary-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </span>
      </label>
      <p className="text-xs text-primary-600">
        Searches saved records across the catalog, not just the current page.
      </p>
      {state.loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-primary-700"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Searching…
        </p>
      )}
      {state.error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
          <button
            type="button"
            className="ml-2 font-semibold underline"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : !state.loading && !state.rows.length ? (
        <p className="rounded-xl border border-dashed border-primary-300 bg-white p-4 text-sm text-primary-700">
          No saved records match this search. Try another part number or name.
          No new product will be created.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {state.rows.map((row) => {
            const selected = selectedIds.includes(row.id);
            const inactive = row.is_active === false;
            const code =
              kind === "vehicle"
                ? `${row.model_name} · ${row.year}`
                : row.sku || row.code;
            const price = row.price ?? row.standard_price;
            return (
              <button
                type="button"
                key={row.id}
                disabled={selected || inactive || state.loading}
                onClick={() => onSelect(row)}
                className="flex min-h-24 min-w-0 items-start gap-3 rounded-xl border border-primary-200 bg-white p-3 text-left transition hover:border-blue-500 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <strong className="block break-words text-sm text-primary-950">
                    {code}
                  </strong>
                  <span className="mt-1 block break-words text-xs text-primary-700">
                    {kind === "vehicle"
                      ? [row.engine, row.vehicle_family]
                          .filter(Boolean)
                          .join(" · ")
                      : row.name}
                  </span>
                  {row.model_name && kind !== "vehicle" && (
                    <span className="mt-1 block text-xs text-primary-600">
                      Source model: {row.model_name}
                    </span>
                  )}
                  {kind !== "vehicle" && (
                    <span className="mt-2 block text-xs font-semibold text-primary-900">
                      {price == null
                        ? "Price not recorded"
                        : formatCurrency(price)}
                      {kind === "product"
                        ? ` · ${row.stock == null ? "Stock unknown" : `${row.stock} in stock`}`
                        : ` · ${row.estimated_duration_minutes || "—"} min · ${inactive ? "Inactive" : "Active"}`}
                    </span>
                  )}
                  <span className="mt-1 block text-xs text-blue-800">
                    {selected
                      ? "Already selected"
                      : inactive
                        ? "Unavailable for selection"
                        : "Select saved record"}
                  </span>
                </span>
                <Plus className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-primary-700">
        <span>
          {state.pagination.totalCount || 0} results · Page {page} of{" "}
          {state.pagination.totalPages || 1}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous search page"
            disabled={page <= 1 || state.loading}
            onClick={() => setPage((value) => value - 1)}
            className="min-h-10 rounded-lg border border-primary-300 bg-white px-3 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next search page"
            disabled={
              page >= (state.pagination.totalPages || 1) || state.loading
            }
            onClick={() => setPage((value) => value + 1)}
            className="min-h-10 rounded-lg border border-primary-300 bg-white px-3 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

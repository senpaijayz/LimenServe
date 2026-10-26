import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, History } from "lucide-react";
import { getManagedPackageHistory } from "../../../services/managedPackagesApi";

const ACTION_LABELS = {
  created: "Package created",
  draft_saved: "Draft saved",
  published: "Published for customers",
  unpublish: "Removed from new recommendations",
  archive: "Package archived",
  restore: "Restored as unpublished",
};

export default function PackageActivity({ packageId, revision }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({
    rows: [],
    loading: true,
    error: "",
    totalPages: 1,
  });

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const result = await getManagedPackageHistory(
          packageId,
          { page, pageSize: 8 },
          controller.signal,
        );
        if (!controller.signal.aborted)
          setState({
            rows: result.history || [],
            loading: false,
            error: "",
            totalPages: Math.max(1, result.pagination?.totalPages || 1),
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            loading: false,
            error: error.message || "Could not load this package’s history.",
          }));
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, packageId, revision, page, retry]);

  return (
    <section className="rounded-2xl border border-primary-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 p-4 text-left text-sm font-semibold text-primary-800"
      >
        <History className="h-4 w-4" /> Saved changes and publication history
        <ChevronDown
          className={`ml-auto h-4 w-4 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          className="border-t border-primary-100 p-4"
          aria-busy={state.loading}
        >
          {state.loading ? (
            <p role="status" className="text-sm text-primary-600">
              Loading saved changes…
            </p>
          ) : state.error ? (
            <div role="alert" className="text-sm text-red-700">
              <p>{state.error}</p>
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
                className="mt-2 rounded-lg border border-red-200 px-3 py-2 font-semibold"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {state.rows.length === 0 ? (
                <p className="text-sm text-primary-600">
                  No saved changes are recorded yet.
                </p>
              ) : (
                <ol className="divide-y divide-primary-100">
                  {state.rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-primary-900">
                          {ACTION_LABELS[row.action] || "Package updated"}
                        </p>
                        <p className="mt-1 text-xs text-primary-600">
                          Revision {row.draft_revision}
                        </p>
                      </div>
                      <time
                        dateTime={row.created_at}
                        className="text-xs text-primary-600"
                      >
                        {new Date(row.created_at).toLocaleString("en-PH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Manila",
                        })}{" "}
                        · PH
                      </time>
                    </li>
                  ))}
                </ol>
              )}
              {state.totalPages > 1 && (
                <nav
                  aria-label="Package history pages"
                  className="mt-3 flex items-center justify-between gap-2 text-sm"
                >
                  <button
                    type="button"
                    aria-label="Previous history page"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                    className="rounded-lg border border-primary-200 p-2 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-primary-600">
                    Page {page} of {state.totalPages}
                  </span>
                  <button
                    type="button"
                    aria-label="Next history page"
                    disabled={page >= state.totalPages}
                    onClick={() => setPage((value) => value + 1)}
                    className="rounded-lg border border-primary-200 p-2 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </nav>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

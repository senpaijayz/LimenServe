import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../../context/useAuth";
import { useToast } from "../../../components/ui/Toast";
import {
  getReplenishment,
  saveReorderSettings,
} from "../../../services/replenishmentApi";
import { buildLocator3DUrl } from "../../locator3d/utils/locatorNavigation";

const field = "input min-h-11 w-full min-w-0";
const views = [
  ["low", "At reorder point"],
  ["out", "Out of stock"],
  ["missing", "No threshold"],
  ["all", "All active parts"],
];
export default function Replenishment() {
  const { user } = useAuth();
  const toast = useToast();
  const admin = user?.role === "admin";
  const [filter, setFilter] = useState("low");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({
    items: [],
    total: 0,
    loading: true,
    error: "",
  });
  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState([]);
  const [point, setPoint] = useState("");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = Object.keys(drafts).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const followLink = (event) => {
      const anchor = event.target.closest?.("a[href]");
      if (
        anchor &&
        !event.defaultPrevented &&
        !window.confirm(
          "Discard unsaved reorder settings? Stock quantities have not changed.",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", followLink, true);
    };
  }, [dirty]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(
      () =>
        getReplenishment({ filter, q: query, page }, controller.signal)
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
  }, [filter, query, page, reload]);
  const navigate = (change) => {
    if (
      dirty &&
      !window.confirm(
        "Discard unsaved reorder settings? Stock quantities have not changed.",
      )
    )
      return;
    setDrafts({});
    setSelected([]);
    setState((current) => ({ ...current, loading: true, error: "" }));
    change();
  };
  const patch = (item, key, value) =>
    setDrafts((current) => ({
      ...current,
      [item.id]: {
        reorderPoint: String(item.reorder_point ?? 0),
        reorderQuantity: String(item.reorder_quantity ?? 0),
        ...current[item.id],
        [key]: value,
      },
    }));
  const valid = (value) =>
    String(value).trim() !== "" &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 1000000;
  const save = async () => {
    if (busy || state.loading || state.error) return;
    const items = state.items
      .filter((item) => drafts[item.id])
      .map((item) => ({
        productId: item.id,
        expectedPoint: Number(item.reorder_point),
        expectedQuantity: Number(item.reorder_quantity),
        ...Object.fromEntries(
          Object.entries(drafts[item.id]).map(([key, value]) => [
            key,
            Number(value),
          ]),
        ),
      }));
    if (
      Object.values(drafts).some(
        (item) => !valid(item.reorderPoint) || !valid(item.reorderQuantity),
      )
    ) {
      toast.error("Use whole numbers from 0 to 1,000,000.");
      return;
    }
    if (
      !window.confirm(
        `Save reorder settings for ${items.length} parts? Stock quantities and supplier orders will not change.`,
      )
    )
      return;
    setBusy(true);
    try {
      await saveReorderSettings(items);
      setDrafts({});
      setSelected([]);
      setPage(1);
      setState((current) => ({ ...current, loading: true }));
      setReload((value) => value + 1);
      toast.success("Reorder settings saved. Stock quantities are unchanged.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4 pb-12">
      <Link
        to="/inventory"
        className="inline-flex min-h-11 items-center font-semibold text-primary-800"
      >
        ← Inventory
      </Link>
      <header className="rounded-xl border border-primary-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-primary-950">Replenishment</h1>
        <p className="mt-2 text-sm text-primary-700">
          Review available stock and configure when to reorder. Suggestions are
          not purchase orders.
        </p>
        <Link
          to="/inventory/receive"
          className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-blue-800 px-4 text-sm font-semibold text-white"
        >
          Receive stock
        </Link>
      </header>
      <fieldset
        disabled={busy}
        className="grid gap-3 rounded-xl border border-primary-200 bg-white p-4 sm:grid-cols-2"
      >
        <label className="text-sm font-semibold text-primary-800">
          View
          <select
            className={`${field} mt-1`}
            value={filter}
            onChange={(event) =>
              navigate(() => {
                setFilter(event.target.value);
                setPage(1);
              })
            }
          >
            {views.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-primary-800">
          Search part number or name
          <input
            className={`${field} mt-1`}
            value={query}
            onChange={(event) =>
              navigate(() => {
                setQuery(event.target.value);
                setPage(1);
              })
            }
          />
        </label>
      </fieldset>
      <p className="text-sm text-primary-700">
        Available = recorded on-hand minus reserved units. A threshold of 0
        disables reorder alerts; it does not mean stock is sufficient.
      </p>
      {admin && (
        <details className="rounded-xl border border-primary-200 bg-white p-4">
          <summary className="cursor-pointer font-bold text-primary-950">
            Bulk edit · {selected.length} selected
          </summary>
          <fieldset
            disabled={busy || state.loading || Boolean(state.error)}
            className="space-y-3 rounded-xl border border-primary-200 bg-white p-4"
          >
            <h2 className="font-bold text-primary-950">
              Set selected parts together
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-primary-800">
                Reorder point
                <input
                  className={field}
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  value={point}
                  onChange={(event) => setPoint(event.target.value)}
                />
              </label>
              <label className="text-sm text-primary-800">
                Preferred reorder quantity
                <input
                  className={field}
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn self-end border border-primary-300"
                disabled={!selected.length || !valid(point) || !valid(quantity)}
                onClick={() =>
                  setDrafts((current) => ({
                    ...current,
                    ...Object.fromEntries(
                      selected.map((id) => [
                        id,
                        { reorderPoint: point, reorderQuantity: quantity },
                      ]),
                    ),
                  }))
                }
              >
                Apply to {selected.length} selected
              </button>
            </div>
            <p className="text-xs text-primary-700">
              Applies to selected rows on this page only. Review, then Save
              settings.
            </p>
          </fieldset>
        </details>
      )}
      {admin && dirty && (
        <fieldset
          disabled={busy || state.loading || Boolean(state.error)}
          className="sticky top-16 z-10 flex flex-wrap gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 shadow-sm"
        >
          <button
            type="button"
            className="btn bg-blue-800 text-white"
            disabled={!dirty || busy}
            onClick={save}
          >
            {busy ? "Saving…" : `Save settings (${Object.keys(drafts).length})`}
          </button>
          {dirty && (
            <button
              type="button"
              className="btn border border-primary-300 bg-white"
              onClick={() => setDrafts({})}
            >
              Discard edits
            </button>
          )}
        </fieldset>
      )}
      {state.error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
        >
          {state.error}
          <button
            type="button"
            disabled={busy}
            className="ml-3 min-h-11 font-bold underline"
            onClick={() => navigate(() => setReload((value) => value + 1))}
          >
            Reload
          </button>
        </div>
      )}
      {state.loading ? (
        <p role="status">Loading inventory settings…</p>
      ) : state.error ? null : (
        <>
          <p className="text-sm text-primary-700">
            {state.total} matching active parts · Page {page} of{" "}
            {Math.max(1, Math.ceil(state.total / 24))}
          </p>
          {!state.items.length && (
            <p className="rounded-xl border border-primary-200 bg-white p-6 text-primary-800">
              No parts match this view. Try No threshold or search all active
              parts.
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {state.items.map((item) => (
              <article
                key={item.id}
                className="min-w-0 space-y-3 rounded-xl border border-primary-200 bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  {admin && (
                    <input
                      type="checkbox"
                      disabled={busy}
                      aria-label={`Select ${item.sku}`}
                      checked={selected.includes(item.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, item.id]
                            : current.filter((id) => id !== item.id),
                        )
                      }
                      className="mt-1 h-5 w-5"
                    />
                  )}
                  <div className="min-w-0">
                    <h2 className="break-all font-mono font-bold text-primary-950">
                      {item.sku}
                    </h2>
                    <p className="break-words text-sm text-primary-800">
                      {item.name}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-primary-800">
                  On hand: {item.on_hand} · Available:{" "}
                  <strong>{item.available}</strong>
                </p>
                {admin ? (
                  <fieldset disabled={busy} className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-semibold text-primary-800">
                      Reorder point
                      <input
                        className={`${field} mt-1`}
                        type="number"
                        min="0"
                        max="1000000"
                        step="1"
                        value={
                          drafts[item.id]?.reorderPoint ?? item.reorder_point
                        }
                        onChange={(event) =>
                          patch(item, "reorderPoint", event.target.value)
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold text-primary-800">
                      Reorder quantity
                      <input
                        className={`${field} mt-1`}
                        type="number"
                        min="0"
                        max="1000000"
                        step="1"
                        value={
                          drafts[item.id]?.reorderQuantity ??
                          item.reorder_quantity
                        }
                        onChange={(event) =>
                          patch(item, "reorderQuantity", event.target.value)
                        }
                      />
                    </label>
                  </fieldset>
                ) : (
                  <p className="text-sm text-primary-800">
                    Reorder point: {item.reorder_point} · Preferred quantity:{" "}
                    {item.reorder_quantity}
                  </p>
                )}
                <p className="text-sm text-primary-700">
                  Suggested quantity:{" "}
                  {item.suggested_quantity > 0
                    ? item.suggested_quantity
                    : "Not configured / not due"}{" "}
                  — based on saved settings, not a demand forecast.
                </p>
                <Link
                  to={buildLocator3DUrl({
                    id: item.id,
                    sku: item.sku,
                    name: item.name,
                  })}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-800 underline"
                >
                  Find in warehouse
                </Link>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <button
              type="button"
              className="btn border border-primary-300"
              disabled={page <= 1 || busy}
              onClick={() => navigate(() => setPage((value) => value - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn border border-primary-300"
              disabled={page * 24 >= state.total || busy}
              onClick={() => navigate(() => setPage((value) => value + 1))}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

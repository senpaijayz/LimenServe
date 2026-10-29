import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useAuth } from "../../../context/useAuth";
import { getProductCatalog, getSuppliers } from "../../../services/catalogApi";
import {
  getSupplierOrder,
  saveSupplierOrder,
} from "../../../services/supplierOrderApi";

const field = "input mt-1 min-h-11 w-full min-w-0";
const empty = () => ({
  requestId: crypto.randomUUID(),
  supplierId: "",
  externalReference: "",
  expectedDate: "",
  notes: "",
  items: [],
  submitted: false,
  payload: null,
});
export default function SupplierOrderEditor() {
  const { id } = useParams();
  const { user } = useAuth();
  return (
    <SupplierOrderEditorWorkspace
      key={`${user?.id}:${id || "new"}`}
      id={id}
      user={user}
    />
  );
}
function SupplierOrderEditorWorkspace({ id, user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(empty);
  const [ready, setReady] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageNote, setStorageNote] = useState("");
  const [reload, setReload] = useState(0);
  const flight = useRef(false);
  const storageKey = user?.id
    ? `limen:supplier-draft:v1:${user.id}:${id || "new"}`
    : null;
  useEffect(() => {
    let active = true;
    Promise.all([
      getSuppliers(),
      id ? getSupplierOrder(id) : Promise.resolve(null),
    ])
      .then(([choices, order]) => {
        if (!active) return;
        if (order && order.stage !== "draft")
          throw new Error(
            "Only draft orders can be edited. Reopen this order to review its history.",
          );
        setSuppliers(choices);
        let recovered = null;
        try {
          recovered = JSON.parse(localStorage.getItem(storageKey) || "null");
        } catch {
          /* Offer a fresh form without destroying unreadable storage. */
        }
        const recoveredWork =
          recovered?.submitted ||
          recovered?.supplierId ||
          recovered?.externalReference ||
          recovered?.expectedDate ||
          recovered?.notes ||
          recovered?.items?.length;
        if (
          recovered?.requestId &&
          Array.isArray(recovered.items) &&
          recoveredWork
        ) {
          setDraft(recovered);
          setStorageNote(
            "Recovered draft on this device. Any newly selected parts were not added over it.",
          );
        } else if (order)
          setDraft({
            ...empty(),
            id: order.id,
            expectedVersion: order.version,
            supplierId: order.supplierId,
            externalReference: order.externalReference,
            expectedDate: order.expectedDate || "",
            notes: order.notes,
            items: order.items.map((i) => ({
              productId: i.productId,
              sku: i.sku,
              name: i.name,
              quantity: String(i.quantity),
            })),
          });
        else {
          const seed = location.state?.supplierOrderSeed;
          setDraft({
            ...empty(),
            supplierId: seed?.supplierId || "",
            items: Array.isArray(seed?.items) ? seed.items.slice(0, 100) : [],
          });
        }
        setReady(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, storageKey, location.state, reload]);
  useEffect(() => {
    if (!ready || !storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      setStorageNote("Device storage is unavailable. Keep this page open.");
    }
  }, [draft, ready, storageKey]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      getProductCatalog({
        q: q.trim(),
        page: 1,
        pageSize: 8,
        includeCategories: false,
      })
        .then((data) => {
          if (active) setResults(data.products || []);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q]);
  const change = (patch) => {
    if (!busy && !draft.submitted)
      setDraft((current) => ({ ...current, ...patch }));
  };
  const submit = async () => {
    if (flight.current) return;
    let payload = draft.payload;
    if (!draft.submitted) {
      if (
        !draft.supplierId ||
        !draft.items.length ||
        draft.items.some(
          (i) =>
            !i.productId ||
            String(i.quantity).trim() === "" ||
            !Number.isInteger(Number(i.quantity)) ||
            Number(i.quantity) < 1 ||
            Number(i.quantity) > 1000000,
        )
      ) {
        setError(
          "Choose a supplier and enter whole quantities from 1 to 1,000,000 for each part.",
        );
        return;
      }
      payload = {
        id: id || null,
        requestId: draft.requestId,
        expectedVersion: draft.expectedVersion || null,
        supplierId: draft.supplierId,
        externalReference: draft.externalReference,
        expectedDate: draft.expectedDate || null,
        notes: draft.notes,
        items: draft.items.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
        })),
      };
    }
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const submitted = { ...draft, submitted: true, payload };
      localStorage.setItem(storageKey, JSON.stringify(submitted));
      setDraft(submitted);
      const saved = await saveSupplierOrder(payload);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* The saved draft can be reopened from its order page. */
      }
      navigate(`/inventory/orders/${saved.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      if (e.requestRejected)
        setDraft((current) => ({
          ...current,
          submitted: false,
          payload: null,
        }));
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  if (user?.role !== "admin")
    return <p>Only administrators can create or edit supplier order drafts.</p>;
  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-12">
      <Link
        to={id ? `/inventory/orders/${id}` : "/inventory/orders"}
        className="inline-flex min-h-11 items-center font-semibold text-blue-800"
      >
        ← Supplier orders
      </Link>
      <header className="rounded-xl border border-primary-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-primary-950">
          {id ? "Edit order draft" : "New supplier order draft"}
        </h1>
        <p className="mt-2 text-sm text-primary-700">
          Save planned quantities first. This does not purchase parts, notify
          the supplier or add stock.
        </p>
        <p role="status" className="mt-2 text-xs text-primary-700">
          {storageNote}
        </p>
      </header>
      {id && (
        <button
          type="button"
          className="btn border border-primary-300"
          disabled={busy || draft.submitted}
          onClick={() => {
            if (
              !window.confirm(
                "Replace local edits with the latest saved order draft?",
              )
            )
              return;
            try {
              localStorage.removeItem(storageKey);
              setReady(false);
              setError("");
              setReload((x) => x + 1);
            } catch {
              setError(
                "Device storage could not be cleared. Keep this page open.",
              );
            }
          }}
        >
          Reload saved draft
        </button>
      )}
      {!id && ready && (
        <button
          type="button"
          className="btn border border-red-300 text-red-700"
          disabled={busy || draft.submitted}
          onClick={() => {
            if (
              window.confirm(
                "Clear this unsaved draft from this device? Saved orders and history will not change.",
              )
            ) {
              setDraft(empty());
              setQ("");
              setResults([]);
              setError("");
              setStorageNote("New empty draft.");
            }
          }}
        >
          Clear unsaved draft
        </button>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
        >
          {error}
          {!ready && (
            <button
              type="button"
              className="ml-3 min-h-11 font-semibold underline"
              onClick={() => {
                setError("");
                setReload((x) => x + 1);
              }}
            >
              Retry loading
            </button>
          )}
        </p>
      )}
      {!ready ? (
        <p role="status">Loading order form…</p>
      ) : (
        <>
          {draft.submitted && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
              This draft was submitted. Keep its details unchanged and retry the
              same request to find its saved result.
            </p>
          )}
          <fieldset
            disabled={busy || draft.submitted}
            className="space-y-4 rounded-xl border border-primary-200 bg-white p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Supplier
                <select
                  className={field}
                  value={draft.supplierId}
                  onChange={(e) => change({ supplierId: e.target.value })}
                >
                  <option value="">Choose supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Supplier reference (optional)
                <input
                  className={field}
                  maxLength={120}
                  value={draft.externalReference}
                  onChange={(e) =>
                    change({ externalReference: e.target.value })
                  }
                />
              </label>
              <label className="text-sm font-semibold">
                Expected delivery date (if confirmed)
                <input
                  type="date"
                  className={field}
                  value={draft.expectedDate}
                  onChange={(e) => change({ expectedDate: e.target.value })}
                />
              </label>
              <label className="text-sm font-semibold">
                Notes
                <input
                  className={field}
                  maxLength={1000}
                  value={draft.notes}
                  onChange={(e) => change({ notes: e.target.value })}
                />
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Find a part
              <input
                className={field}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Part number or name"
              />
            </label>
            <div className="divide-y">
              {results.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className="block min-h-11 w-full py-2 text-left"
                  disabled={
                    draft.items.length >= 100 ||
                    draft.items.some((i) => i.productId === p.id)
                  }
                  onClick={() => {
                    change({
                      items: [
                        ...draft.items,
                        {
                          productId: p.id,
                          sku: p.sku,
                          name: p.name,
                          quantity: "",
                        },
                      ],
                    });
                    setQ("");
                    setResults([]);
                  }}
                >
                  <strong className="font-mono">{p.sku}</strong>
                  <span className="ml-2 text-sm">{p.name}</span>
                </button>
              ))}
            </div>
            <h2 className="font-bold">Order lines · {draft.items.length}</h2>
            {!draft.items.length && (
              <p className="text-sm text-primary-700">
                Search for a part to add it to this order draft.
              </p>
            )}
            <div className="divide-y">
              {draft.items.map((i) => (
                <div
                  key={i.productId || i.sku}
                  className="grid grid-cols-[minmax(0,1fr)_90px_44px] items-center gap-2 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-all font-mono font-bold text-primary-950">
                      {i.sku}
                    </p>
                    <p className="break-words text-sm text-primary-700">
                      {i.name}
                    </p>
                  </div>
                  <label className="text-xs font-semibold">
                    Quantity
                    <input
                      className={field}
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      value={i.quantity}
                      onChange={(e) =>
                        change({
                          items: draft.items.map((x) =>
                            x.productId === i.productId
                              ? { ...x, quantity: e.target.value }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove ${i.sku}`}
                    className="min-h-11 rounded-lg text-xl text-red-700 hover:bg-red-50"
                    onClick={() =>
                      change({ items: draft.items.filter((x) => x !== i) })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            className="btn bg-blue-800 text-white"
            disabled={busy}
            onClick={submit}
          >
            {busy
              ? "Saving…"
              : draft.submitted
                ? "Check / retry saved draft"
                : "Save order draft"}
          </button>
        </>
      )}
    </div>
  );
}

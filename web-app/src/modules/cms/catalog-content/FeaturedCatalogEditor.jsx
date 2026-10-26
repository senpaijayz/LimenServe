import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "../../../components/ui/Toast";
import {
  deleteCmsFeaturedCatalogItem,
  getCmsCatalogContent,
  saveCmsFeaturedCatalogItem,
} from "../api/cmsCatalogApi";
import { createEmptyFeaturedCatalogItem } from "./cmsCatalogContentModel";
import PackageRecordSearch from "../packages/PackageRecordSearch";
import PackageField from "../packages/PackageField";

const noop = () => {};
const placements = [
  { value: "catalog_featured", label: "Genuine Parts featured" },
  { value: "estimate_recommended", label: "Estimate recommended" },
];

export default function FeaturedCatalogEditor({ onUnsavedChange = noop }) {
  const { success, error: showError } = useToast();
  const [state, setState] = useState({ items: [], loading: true, error: "" });
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const loadRef = useRef(null);
  const dirty = draft !== null && JSON.stringify(draft) !== baseline;
  useEffect(() => {
    onUnsavedChange(dirty);
  }, [dirty, onUnsavedChange]);
  useEffect(() => () => onUnsavedChange(false), [onUnsavedChange]);
  useEffect(() => {
    let active = true;
    loadRef.current ||= getCmsCatalogContent();
    loadRef.current
      .then((result) => {
        if (active)
          setState({
            items: result.featuredItems || [],
            loading: false,
            error: "",
          });
      })
      .catch((error) => {
        if (active)
          setState((value) => ({
            ...value,
            loading: false,
            error: error.message,
          }));
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const patch = (value) => setDraft((current) => ({ ...current, ...value }));
  const close = () => {
    if (dirty && !window.confirm("Discard unsaved featured-product changes?"))
      return;
    setDraft(null);
    setBaseline("");
  };
  const save = async () => {
    if (!draft.productId) {
      showError("Choose a saved catalog product first.");
      return;
    }
    if (
      state.items.some(
        (item) =>
          item.id !== draft.id &&
          item.productId === draft.productId &&
          item.placementKey === draft.placementKey,
      )
    ) {
      showError(
        "This product is already featured in that placement. Edit its existing entry instead.",
      );
      return;
    }
    setBusy(true);
    try {
      const saved = await saveCmsFeaturedCatalogItem(draft);
      setState((current) => ({
        ...current,
        items: draft.id
          ? current.items.map((item) => (item.id === saved.id ? saved : item))
          : [...current.items, saved],
      }));
      setDraft(null);
      setBaseline("");
      loadRef.current = null;
      success("Featured product saved.");
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!draft.id) {
      close();
      return;
    }
    if (
      !window.confirm(
        "Remove this featured-product placement? The inventory product stays in the catalog.",
      )
    )
      return;
    setBusy(true);
    try {
      await deleteCmsFeaturedCatalogItem(draft.id);
      setState((current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== draft.id),
      }));
      setDraft(null);
      setBaseline("");
      loadRef.current = null;
      success("Featured placement removed. The product was not deleted.");
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="min-w-0 space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-primary-950">
            Featured products
          </h2>
          <p className="mt-1 text-sm text-primary-700">
            Choose parts to highlight on the customer website. Offers are
            managed separately in Packages & Bundles.
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            onClick={() => {
              const item = createEmptyFeaturedCatalogItem();
              setDraft(item);
              setBaseline("");
            }}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-primary-300 px-4 text-sm font-semibold text-primary-900"
          >
            <Plus className="h-4 w-4" />
            Add featured product
          </button>
        )}
      </header>
      {state.loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-primary-700"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading featured products…
        </p>
      )}
      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              loadRef.current = null;
              setRetry((value) => value + 1);
            }}
          >
            Retry
          </button>
        </p>
      )}
      {draft ? (
        <>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="flex min-h-10 items-center gap-2 text-sm font-semibold text-primary-700"
          >
            <ArrowLeft className="h-4 w-4" />
            All featured products
          </button>
          <fieldset
            disabled={busy}
            className="min-w-0 space-y-4 rounded-2xl border border-primary-200 p-4"
          >
            <PackageField
              label="Placement"
              value={draft.placementKey}
              options={placements}
              onChange={(placementKey) => patch({ placementKey })}
            />
            <div className="rounded-xl bg-primary-50 p-3">
              <p className="font-bold text-primary-950">
                {draft.sku || "Choose a part"}
              </p>
              <p className="mt-1 text-sm text-primary-700">
                {draft.name || "Search the real catalog below."}
              </p>
            </div>
            <PackageRecordSearch
              kind="product"
              selectedIds={draft.productId ? [draft.productId] : []}
              onSelect={(product) =>
                patch({
                  productId: product.id,
                  sku: product.sku,
                  name: product.name,
                  category: product.category,
                })
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <PackageField
                label="Label (optional)"
                value={draft.label || ""}
                onChange={(label) => patch({ label })}
              />
              <PackageField
                label="Badge (optional)"
                value={draft.badge || ""}
                onChange={(badge) => patch({ badge })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-primary-900">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => patch({ isActive: event.target.checked })}
              />
              Show this placement on the website
            </label>
          </fieldset>
          <div className="sticky bottom-0 flex flex-wrap justify-between gap-3 border-t border-primary-200 bg-white/95 p-3 backdrop-blur">
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Remove placement
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={close}
                className="min-h-11 rounded-xl border border-primary-300 px-4 text-sm font-semibold text-primary-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !draft.productId}
                onClick={save}
                className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {busy ? "Saving…" : "Save placement"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {!state.loading && !state.items.length && (
            <p className="rounded-xl border border-dashed border-primary-300 p-6 text-sm text-primary-700">
              No featured products yet.
            </p>
          )}
          {state.items.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                setDraft(structuredClone(item));
                setBaseline(JSON.stringify(item));
              }}
              className="flex min-h-20 w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-white p-4 text-left hover:border-blue-400"
            >
              <span className="min-w-0">
                <strong className="block break-words text-primary-950">
                  {item.sku} — {item.name}
                </strong>
                <span className="mt-1 block text-xs text-primary-700">
                  {placements.find((value) => value.value === item.placementKey)
                    ?.label || item.placementKey}
                </span>
              </span>
              <span className="text-xs font-semibold text-blue-800">
                {item.isActive ? "Visible · Edit" : "Hidden · Edit"}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

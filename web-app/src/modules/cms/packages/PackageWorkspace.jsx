import { useEffect, useState } from "react";
import {
  Archive,
  Copy,
  Eye,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useAuth } from "../../../context/useAuth";
import { useToast } from "../../../components/ui/Toast";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import {
  duplicateManagedPackage,
  getManagedPackage,
  initializeManagedPackages,
  listManagedPackages,
  previewPackageInitialization,
  transitionManagedPackage,
} from "../../../services/managedPackagesApi";
import { formatCurrency } from "../../../utils/formatters";
import PackageEditor from "./PackageEditor";
import PackageField from "./PackageField";
import {
  newPackageDraft,
  PACKAGE_STATUS_OPTIONS,
  PACKAGE_TYPE_OPTIONS,
  readPackageRecovery,
} from "./packageEditorModel";

const noop = () => {};
const typeLabel = (type) =>
  PACKAGE_TYPE_OPTIONS.find((option) => option.value === type)?.label || type;
const statusStyles = {
  published: "border-emerald-200 bg-emerald-50 text-emerald-800",
  draft: "border-amber-200 bg-amber-50 text-amber-900",
  unpublished: "border-primary-200 bg-primary-50 text-primary-800",
  archived: "border-primary-300 bg-primary-100 text-primary-700",
};

function InitializationPanel({ onClose, onChanged }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    candidates: [],
    notes: [],
    result: null,
  });
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [promotionPolicies, setPromotionPolicies] = useState({});
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        previewPackageInitialization(controller.signal)
          .then((result) => {
            if (!active) return;
            setState({
              loading: false,
              error: "",
              candidates: result.candidates || [],
              notes: result.notes || [],
              result: null,
            });
            setSelected(
              (result.candidates || [])
                .filter((candidate) => !candidate.alreadyExists)
                .map((candidate) => candidate.key),
            );
          })
          .catch((error) => {
            if (active)
              setState((value) => ({
                ...value,
                loading: false,
                error: error.message,
              }));
          }),
      0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [retry]);
  const initialize = async (candidateKeys = selected) => {
    if (!candidateKeys.length) return;
    setBusy(true);
    try {
      const approvedPolicies = Object.fromEntries(
        candidateKeys
          .filter(
            (key) =>
              promotionPolicies[key]?.pricing?.mode !== "catalog" &&
              promotionPolicies[key],
          )
          .map((key) => [key, promotionPolicies[key]]),
      );
      const result = await initializeManagedPackages(
        candidateKeys,
        approvedPolicies,
      );
      setState((value) => ({ ...value, result, error: "" }));
      setSelected([]);
      onChanged();
    } catch (error) {
      setState((value) => ({ ...value, error: error.message }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-primary-950">
          Starter package review
        </h3>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="min-h-10 rounded-xl border border-primary-300 bg-white px-3 text-sm font-semibold text-primary-800"
        >
          Close
        </button>
      </div>
      <p className="text-sm leading-relaxed text-primary-800">
        Candidates use saved catalog records and recorded relationships. No
        unapproved discounts are invented. Verified candidates can be published;
        uncertain candidates stay drafts. Running this again does not overwrite
        packages you already have.
      </p>
      {state.loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-primary-700"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Reviewing current records…
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
            onClick={() => setRetry((value) => value + 1)}
            className="ml-2 font-semibold underline"
          >
            Retry preview
          </button>
        </p>
      )}
      {state.notes.map((note) => (
        <p key={note} className="text-sm text-primary-800">
          {note}
        </p>
      ))}
      <div className="space-y-2">
        {state.candidates.map((candidate) => (
          <div
            key={candidate.key}
            className="flex items-start gap-3 rounded-xl border border-primary-200 bg-white p-3"
          >
            <input
              type="checkbox"
              aria-label={`Select ${candidate.name}`}
              className="mt-1 h-4 w-4"
              checked={selected.includes(candidate.key)}
              disabled={
                busy || candidate.alreadyExists || Boolean(state.result)
              }
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, candidate.key]
                    : current.filter((key) => key !== candidate.key),
                )
              }
            />
            <div className="min-w-0 flex-1">
              <strong className="block text-sm text-primary-950">
                {candidate.name}
              </strong>
              <span className="mt-1 block text-xs text-primary-700">
                {typeLabel(candidate.type)} · {candidate.itemCount} items ·{" "}
                {candidate.alreadyExists
                  ? "Already saved — will not overwrite"
                  : candidate.publishable
                    ? "Verified for publication"
                    : "Draft — needs review"}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-primary-600">
                {candidate.reviewNotes}
              </span>
              {candidate.packageTotal != null && (
                <span className="mt-2 block text-sm font-semibold text-primary-900">
                  Current catalog total:{" "}
                  {formatCurrency(candidate.packageTotal)}
                </span>
              )}
              {!candidate.alreadyExists &&
                selected.includes(candidate.key) &&
                !state.result && (
                  <details className="mt-3 rounded-xl border border-primary-200 bg-primary-50 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-primary-800">
                      Optional approved starter pricing
                    </summary>
                    <p className="my-2 text-xs leading-relaxed text-primary-700">
                      Leave catalog pricing selected unless you approve a real
                      offer. This records your pricing approval, but does not
                      publish the package or approve vehicle fitment.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <PackageField
                        label="Starter pricing"
                        value={
                          promotionPolicies[candidate.key]?.pricing?.mode ||
                          "catalog"
                        }
                        disabled={busy}
                        onChange={(mode) =>
                          setPromotionPolicies((current) => ({
                            ...current,
                            [candidate.key]: {
                              pricing: { mode, strategy: "live", value: 0 },
                            },
                          }))
                        }
                        options={[
                          {
                            value: "catalog",
                            label: "Catalog prices — no discount",
                          },
                          {
                            value: "percentage",
                            label: "Approved percentage off",
                          },
                          {
                            value: "fixed_discount",
                            label: "Approved amount off",
                          },
                          {
                            value: "fixed_price",
                            label: "Approved package total",
                          },
                        ]}
                      />
                      {promotionPolicies[candidate.key]?.pricing?.mode &&
                        promotionPolicies[candidate.key].pricing.mode !==
                          "catalog" && (
                          <PackageField
                            label={
                              promotionPolicies[candidate.key].pricing.mode ===
                              "percentage"
                                ? "Approved discount (%)"
                                : "Approved amount (₱)"
                            }
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={busy}
                            value={
                              promotionPolicies[candidate.key].pricing.value
                            }
                            onChange={(value) =>
                              setPromotionPolicies((current) => ({
                                ...current,
                                [candidate.key]: {
                                  pricing: {
                                    ...current[candidate.key].pricing,
                                    value: value === "" ? "" : Number(value),
                                  },
                                },
                              }))
                            }
                          />
                        )}
                    </div>
                  </details>
                )}
            </div>
          </div>
        ))}
      </div>
      {!state.loading && !state.candidates.length && !state.error && (
        <p className="text-sm text-primary-800">
          No new supported candidates were found. You can create a package
          manually from verified records.
        </p>
      )}
      {state.result && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
        >
          <strong>
            {state.result.failed
              ? "Initialization finished with items to review."
              : "Initialization completed."}
          </strong>
          <p className="mt-1">
            Created: {state.result.created} · Published:{" "}
            {state.result.published} · Drafts: {state.result.drafts} · Already
            present/skipped: {state.result.skipped}
            {state.result.failed > 0 && (
              <> · Not saved: {state.result.failed}</>
            )}
          </p>
          {Object.entries(state.result.byType || {}).map(([type, count]) => (
            <p key={type}>
              {typeLabel(type)}: {count}
            </p>
          ))}
          {(state.result.errors || []).map((item) => (
            <p key={item.key} className="mt-2 text-red-800">
              {item.message} Refresh the preview to retry that candidate.
            </p>
          ))}
        </div>
      )}
      {!state.result && state.candidates.some((candidate) => !candidate.alreadyExists) && (
        <button
          type="button"
          onClick={() => initialize()}
          disabled={busy || state.loading || !selected.length}
          className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy
            ? "Saving verified candidates…"
            : `Save ${selected.length} selected candidates`}
        </button>
      )}
      {!state.result && state.candidates.length > 0 &&
        state.candidates.every((candidate) => candidate.alreadyExists) && (
          <button
            type="button"
            disabled={busy || state.loading}
            onClick={() => initialize(state.candidates.map((candidate) => candidate.key))}
            className="min-h-11 rounded-xl border border-primary-300 bg-white px-4 text-sm font-semibold text-primary-900 disabled:opacity-50"
          >
            {busy ? "Checking saved starters…" : "Verify saved starters — no changes"}
          </button>
        )}
    </section>
  );
}

export default function PackageWorkspace({ onUnsavedChange = noop }) {
  const { user } = useAuth();
  const { success, error: showError } = useToast();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState("");
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [editor, setEditor] = useState(null);
  const [editorRecovery, setEditorRecovery] = useState(null);
  const [recovery, setRecovery] = useState(() => readPackageRecovery(user?.id));
  const [showInitialization, setShowInitialization] = useState(false);
  const [list, setList] = useState({
    packages: [],
    pagination: { totalCount: 0, totalPages: 1 },
    loading: true,
    error: "",
  });
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setList((value) => ({ ...value, loading: true, error: "" }));
      try {
        const result = await listManagedPackages(
          { search, type, status, page, pageSize: 12 },
          controller.signal,
        );
        if (!controller.signal.aborted)
          setList({ ...result, loading: false, error: "" });
      } catch (error) {
        if (!controller.signal.aborted)
          setList((value) => ({
            ...value,
            loading: false,
            error: error.message,
          }));
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, type, status, page, reload]);
  const changed = () => setReload((value) => value + 1);
  const discardRecovery = () => {
    try {
      sessionStorage.removeItem(`limen-package-editor:${user?.id}`);
    } catch {
      /* Storage may be unavailable. */
    }
    setRecovery(null);
  };
  const canStartEditor = () =>
    !recovery ||
    window.confirm(
      "Another package has an unsaved recovery copy in this tab. Discard that copy and open a different package?",
    );
  const create = () => {
    if (!canStartEditor()) return;
    discardRecovery();
    setEditorRecovery(null);
    setEditor(newPackageDraft());
  };
  const open = async (id, preview = false) => {
    if (!canStartEditor()) return;
    setBusy(id);
    try {
      const draft = await getManagedPackage(id);
      discardRecovery();
      setEditorRecovery(preview ? { step: 5 } : null);
      setEditor(draft);
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy("");
    }
  };
  const copy = async (id) => {
    if (!canStartEditor()) return;
    setBusy(id);
    try {
      const draft = await duplicateManagedPackage(id);
      discardRecovery();
      setEditorRecovery(null);
      setEditor(await getManagedPackage(draft.id));
      changed();
      success("A separate draft copy was created. It is not published.");
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy("");
    }
  };
  const transition = (pkg, action) => setTransitionTarget({ pkg, action });
  const confirmTransition = async () => {
    if (!transitionTarget || busy) return;
    const { pkg, action } = transitionTarget;
    setBusy(pkg.id);
    try {
      await transitionManagedPackage(pkg.id, pkg.expectedRevision, action);
      changed();
      success(
        action === "restore"
          ? "Package restored. Review it before publishing."
          : action === "archive"
            ? "Package archived."
            : "Package unpublished.",
      );
      setTransitionTarget(null);
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy("");
    }
  };
  if (editor)
    return (
      <PackageEditor
        key={editor.id}
        initialDraft={editor}
        recovery={editorRecovery}
        userId={user?.id}
        onClose={() => {
          setEditor(null);
          setEditorRecovery(null);
          setRecovery(null);
        }}
        onCommitted={changed}
        onUnsavedChange={onUnsavedChange}
      />
    );
  return (
    <div className="min-w-0 space-y-5 p-4 sm:p-6">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-800">
            Offer catalog
          </p>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold text-primary-950">
            <Package className="h-5 w-5 text-blue-700" />
            Packages & Bundles
          </h2>
          <p className="mt-2 max-w-xl text-sm text-primary-700">
            Build an offer, review the exact items and total, then publish when
            ready. Published changes appear without a website redeploy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowInitialization((value) => !value)}
            className="min-h-11 rounded-xl border border-primary-300 bg-white px-4 text-sm font-semibold text-primary-800"
          >
            Starter data
          </button>
          <button
            type="button"
            onClick={create}
            disabled={Boolean(busy)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create package
          </button>
        </div>
      </header>
      {recovery && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p>
            <strong>Unsaved package recovered:</strong>{" "}
            {recovery.draft.name || "New package"}
            <span className="mt-1 block text-xs">
              This copy is from this browser tab. Saved and published records
              were not changed.
            </span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditorRecovery(recovery);
                setEditor(recovery.draft);
                setRecovery(null);
              }}
              className="min-h-11 rounded-xl bg-primary-950 px-3 font-semibold text-white"
            >
              Continue editing
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "Discard this unsaved recovery copy? Saved records stay unchanged.",
                  )
                )
                  discardRecovery();
              }}
              className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 font-semibold"
            >
              Discard copy
            </button>
          </div>
        </div>
      )}
      {showInitialization && (
        <InitializationPanel
          onClose={() => setShowInitialization(false)}
          onChanged={changed}
        />
      )}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_180px_auto]">
        <label className="block text-sm font-semibold text-primary-800">
          Find a package
          <span className="relative mt-1.5 block">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-primary-500" />
            <input
              value={search}
              maxLength={120}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Package name or key"
              className="min-h-11 w-full rounded-xl border border-primary-300 bg-white pl-10 pr-3 text-sm font-normal text-primary-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </span>
        </label>
        <PackageField
          label="Package type"
          value={type}
          onChange={(value) => {
            setType(value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All packages" },
            ...PACKAGE_TYPE_OPTIONS,
          ]}
        />
        <PackageField
          label="Publication"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All statuses" },
            ...PACKAGE_STATUS_OPTIONS.map((value) => ({
              value,
              label: value[0].toUpperCase() + value.slice(1),
            })),
          ]}
        />
        <button
          type="button"
          aria-label="Refresh packages"
          onClick={changed}
          disabled={list.loading}
          className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary-300 px-4 text-sm font-semibold text-primary-800 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${list.loading ? "animate-spin" : ""}`}
          />
          <span className="md:hidden">Refresh</span>
        </button>
      </div>
      {list.loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-primary-700"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading packages…
        </p>
      )}
      {list.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {list.error}
          <button
            type="button"
            onClick={changed}
            className="ml-2 font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}
      {!list.loading && !list.error && !list.packages.length && (
        <div className="rounded-2xl border border-dashed border-primary-300 bg-primary-50 p-8 text-center">
          <Package className="mx-auto h-7 w-7 text-primary-600" />
          <h3 className="mt-3 font-semibold text-primary-950">
            {search || type || status
              ? "No packages match these filters"
              : "Your package catalog is ready to build"}
          </h3>
          <p className="mt-2 text-sm text-primary-700">
            {search || type || status
              ? "Change the search or filters to see other packages."
              : "Review starter data from saved records, or create your first package."}
          </p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {list.packages.map((pkg) => {
          const price = pkg.variants[0];
          const compatibility = [
            ...new Set(
              pkg.eligibility.map((rule) =>
                rule.verified
                  ? rule.mode === "universal"
                    ? "Approved universal use"
                    : [
                        rule.model || rule.family,
                        rule.yearFrom &&
                          (rule.yearTo !== rule.yearFrom
                            ? `${rule.yearFrom}–${rule.yearTo}`
                            : rule.yearFrom),
                      ]
                        .filter(Boolean)
                        .join(" ")
                  : "Unverified",
              ),
            ),
          ];
          return (
            <article
              key={pkg.id}
              className="min-w-0 rounded-2xl border border-primary-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-blue-800">
                    {typeLabel(pkg.type)}
                  </p>
                  <h3 className="mt-1 break-words text-lg font-semibold text-primary-950">
                    {pkg.name}
                  </h3>
                  <p className="mt-1 break-all text-xs text-primary-600">
                    {pkg.packageKey}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[pkg.status] || statusStyles.draft}`}
                >
                  {pkg.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-primary-700">
                {pkg.itemCount} item definitions · {pkg.variants.length} options
              </p>
              <p className="mt-1 break-words text-xs text-primary-600">
                {compatibility.join(" · ") || "Compatibility not reviewed"}
              </p>
              {pkg.hasUnpublishedChanges && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {pkg.status === "published"
                    ? "Draft changes are not live. Current published revision: "
                    : `${pkg.status === "archived" ? "Archived" : "Unpublished"} — hidden from new quotations. Last published revision: `}
                  {pkg.publishedName} · revision {pkg.publishedRevisionNumber}.
                </p>
              )}
              <div className="mt-4 rounded-xl bg-primary-50 p-3">
                <p className="text-xs font-semibold text-primary-700">
                  {pkg.status === "published"
                    ? "Current published pricing"
                    : "Working draft pricing"}
                  {pkg.variants.length > 1 ? ` · ${price?.label}` : ""}
                </p>
                {price?.error || !price ? (
                  <p className="mt-2 text-sm text-amber-900">
                    {price?.error || "Add items and preview pricing."}
                  </p>
                ) : (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm tabular-nums">
                    <div>
                      <span className="block text-xs text-primary-600">
                        Catalog
                      </span>
                      <strong className="mt-1 block text-primary-950">
                        {formatCurrency(price.catalogTotal)}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-xs text-primary-600">
                        Package
                      </span>
                      <strong className="mt-1 block text-blue-800">
                        {formatCurrency(price.packageTotal)}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-xs text-primary-600">
                        Savings
                      </span>
                      <strong className="mt-1 block text-emerald-800">
                        {formatCurrency(price.savings)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-primary-600">
                Updated{" "}
                {pkg.updatedAt ? new Date(pkg.updatedAt).toLocaleString() : "—"}{" "}
                ·{" "}
                {pkg.sourceKind === "manual"
                  ? "Administrator-created"
                  : `${pkg.sourceKind} data${pkg.seedCustomized ? " · customized" : ""}`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    Boolean(busy) || pkg.status === "archived" || list.loading
                  }
                  onClick={() => open(pkg.id)}
                  className="min-h-10 rounded-xl bg-primary-950 px-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy === pkg.id ? "Working…" : "Edit"}
                </button>
                <button
                  type="button"
                  aria-label={`Preview ${pkg.name}`}
                  disabled={Boolean(busy) || pkg.status === "archived"}
                  onClick={() => open(pkg.id, true)}
                  className="flex min-h-10 items-center gap-1 rounded-xl border border-primary-300 px-3 text-sm font-semibold text-primary-800"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </button>
                <button
                  type="button"
                  aria-label={`Duplicate ${pkg.name}`}
                  disabled={Boolean(busy)}
                  onClick={() => copy(pkg.id)}
                  className="flex min-h-10 items-center gap-1 rounded-xl border border-primary-300 px-3 text-sm font-semibold text-primary-800"
                >
                  <Copy className="h-4 w-4" />
                  Duplicate
                </button>
                {pkg.status === "published" && (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => transition(pkg, "unpublish")}
                    className="min-h-10 rounded-xl border border-primary-300 px-3 text-sm font-semibold text-primary-800"
                  >
                    Unpublish
                  </button>
                )}
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    transition(
                      pkg,
                      pkg.status === "archived" ? "restore" : "archive",
                    )
                  }
                  className="flex min-h-10 items-center gap-1 rounded-xl border border-primary-300 px-3 text-sm font-semibold text-primary-800"
                >
                  <Archive className="h-4 w-4" />
                  {pkg.status === "archived" ? "Restore" : "Archive"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-primary-200 pt-4 text-sm text-primary-700">
        <span>
          {list.pagination.totalCount} packages · Page {page} of{" "}
          {list.pagination.totalPages || 1}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={list.loading || page <= 1}
            onClick={() => setPage((value) => value - 1)}
            className="min-h-11 rounded-xl border border-primary-300 px-4 font-semibold disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={list.loading || page >= (list.pagination.totalPages || 1)}
            onClick={() => setPage((value) => value + 1)}
            className="min-h-11 rounded-xl border border-primary-300 px-4 font-semibold disabled:opacity-40"
          >
            Next page
          </button>
        </div>
      </footer>
      <ConfirmDialog
        isOpen={Boolean(transitionTarget)}
        title={transitionTarget?.action === "restore" ? "Restore package?" : transitionTarget?.action === "archive" ? "Archive package?" : "Unpublish package?"}
        message={transitionTarget?.action === "restore"
          ? `Restore “${transitionTarget.pkg.name}” as an unpublished draft? Review its items and eligibility before publishing again.`
          : `${transitionTarget?.action === "archive" ? "Archive" : "Unpublish"} “${transitionTarget?.pkg.name || "this package"}”? It will no longer appear in new quotations. Previously saved quotations and their prices stay unchanged.${transitionTarget?.action === "archive" ? " You can restore this package later." : ""}`}
        confirmLabel={transitionTarget?.action === "restore" ? "Restore draft" : transitionTarget?.action === "archive" ? "Archive package" : "Unpublish package"}
        confirmVariant={transitionTarget?.action === "restore" ? "primary" : "danger"}
        isLoading={Boolean(busy)}
        onConfirm={confirmTransition}
        onClose={() => { if (!busy) setTransitionTarget(null); }}
      />
    </div>
  );
}

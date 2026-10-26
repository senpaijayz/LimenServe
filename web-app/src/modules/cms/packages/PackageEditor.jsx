import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useToast } from "../../../components/ui/Toast";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { uploadCmsImage } from "../../../services/cmsApi";
import {
  previewManagedPackage,
  publishManagedPackage,
  saveManagedPackage,
} from "../../../services/managedPackagesApi";
import ManagedPackageCard from "../../public/components/ManagedPackageCard";
import PackageEligibilityEditor from "./PackageEligibilityEditor";
import PackageField from "./PackageField";
import PackageItemsEditor from "./PackageItemsEditor";
import PackageActivity from "./PackageActivity";
import {
  duplicateVariant,
  newPackageVariant,
  PACKAGE_STEPS,
  PACKAGE_STEP_GUIDANCE,
  PACKAGE_TYPE_OPTIONS,
  packageSlug,
  PRICING_OPTIONS,
} from "./packageEditorModel";

const noop = () => {};
const readImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error("The image could not be read. Try another file."));
    reader.readAsDataURL(file);
  });

export default function PackageEditor({
  initialDraft,
  recovery = null,
  userId,
  onClose,
  onCommitted = noop,
  onUnsavedChange = noop,
}) {
  const { success, error: toastError } = useToast();
  const [draft, setDraft] = useState(initialDraft);
  const [savedSnapshot, setSavedSnapshot] = useState(
    recovery?.savedSnapshot ??
      (initialDraft.expectedRevision > 0 ? JSON.stringify(initialDraft) : ""),
  );
  const [step, setStep] = useState(recovery?.step ?? 0);
  const [variantId, setVariantId] = useState(
    recovery?.variantId ?? initialDraft.variants[0]?.id ?? "",
  );
  const [eligibilityScope, setEligibilityScope] = useState("package");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [viewport, setViewport] = useState("desktop");
  const [lastSaved, setLastSaved] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [confirmPublication, setConfirmPublication] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const snapshot = JSON.stringify(draft);
  const dirty = snapshot !== savedSnapshot;
  const variant =
    draft.variants.find((value) => value.id === variantId) || draft.variants[0];
  const previewCurrent = preview?.snapshot === snapshot;
  const patch = (value) => {
    setError("");
    setDraft((current) => ({ ...current, ...value }));
  };
  const patchVariant = (value) =>
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((entry) =>
        entry.id === variant?.id ? { ...entry, ...value } : entry,
      ),
    }));

  useEffect(() => {
    onUnsavedChange(dirty);
  }, [dirty, onUnsavedChange]);
  useEffect(() => () => onUnsavedChange(false), [onUnsavedChange]);
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(() => {
      try {
        if (dirty) {
          sessionStorage.setItem(
            `limen-package-editor:${userId}`,
            JSON.stringify({
              draft: JSON.parse(snapshot),
              savedSnapshot,
              step,
              variantId,
              updatedAt: Date.now(),
            }),
          );
          setRecoveryMessage(
            "A recovery copy is kept in this browser tab. Use Save Draft to store it in the system.",
          );
        } else {
          sessionStorage.removeItem(`limen-package-editor:${userId}`);
          setRecoveryMessage("");
        }
      } catch {
        setRecoveryMessage(
          "This browser could not keep a recovery copy. Save your draft before leaving.",
        );
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [snapshot, savedSnapshot, dirty, step, variantId, userId]);

  useEffect(() => {
    if (step < 4 || busy || !draft.name.trim() || !draft.packageKey.trim())
      return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewBusy(true);
      setPreviewError("");
      try {
        const result = await previewManagedPackage(
          JSON.parse(snapshot),
          controller.signal,
        );
        if (!controller.signal.aborted) setPreview({ snapshot, data: result });
      } catch (failure) {
        if (!controller.signal.aborted) setPreviewError(failure.message);
      } finally {
        if (!controller.signal.aborted) setPreviewBusy(false);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [snapshot, step, busy, draft.name, draft.packageKey]);

  const close = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    discardAndClose();
  };
  const discardAndClose = () => {
    try {
      sessionStorage.removeItem(`limen-package-editor:${userId}`);
    } catch {
      /* Storage may be unavailable. */
    }
    onClose();
  };
  const goNext = () => {
    if (step === 1 && !draft.name.trim()) {
      setError("Give your package a name before continuing. This is the name customers will see.");
      return;
    }
    if (step === 1 && !draft.packageKey.trim()) {
      setError("Add an internal key under Optional settings before continuing. Use lowercase letters, numbers and hyphens.");
      return;
    }
    if (step === 2 && !variant?.items.some((item) => item.active)) {
      setError("Add at least one part or service to this option before continuing. You can also save a draft and finish later.");
      return;
    }
    setError("");
    setStep((value) => value + 1);
  };
  const goToStep = (value) => {
    setError("");
    setStep(value);
  };
  const adoptSaved = (saved) => {
    const labels = new Map(
      draft.variants
        .flatMap((value) => value.items)
        .map((item) => [item.id, item.display]),
    );
    const hydrated = {
      ...saved,
      publication_status:
        saved.publication_status || draft.publication_status || "draft",
      variants: saved.variants.map((value) => ({
        ...value,
        items: value.items.map((item) => ({
          ...item,
          display: item.display || labels.get(item.id),
        })),
      })),
    };
    setDraft(hydrated);
    setSavedSnapshot(JSON.stringify(hydrated));
    setLastSaved(new Date().toISOString());
    return hydrated;
  };
  const save = async (publish = false) => {
    setBusy(true);
    setError("");
    let saved = null;
    try {
      saved = await saveManagedPackage(draft);
      adoptSaved(saved);
      if (publish) {
        const published = await publishManagedPackage(
          saved.id,
          saved.expectedRevision,
        );
        adoptSaved(published.package);
      }
      onCommitted();
      success(
        publish
          ? "Package published. New quotations can use this approved revision."
          : "Package draft saved. The published version has not changed.",
      );
    } catch (failure) {
      if (saved) onCommitted();
      setError(
        `${saved && publish ? "Your draft was saved, but publication failed. " : ""}${failure.message}`,
      );
      toastError(
        publish
          ? "Package was not published. Review the message in the editor."
          : failure.message,
      );
    } finally {
      setBusy(false);
    }
  };
  const uploadImage = async (file) => {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Choose a JPG, PNG, or WEBP image up to 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const dataUrl = await readImage(file);
      const asset = await uploadCmsImage({
        dataUrl,
        fileName: file.name,
        folder: "packages",
      });
      patch({ imageUrl: asset.publicUrl });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const addOption = (copy = false) => {
    if (draft.variants.length >= 8) return;
    const next =
      copy && variant
        ? duplicateVariant(variant, draft.variants.length)
        : newPackageVariant(draft.variants.length);
    patch({ variants: [...draft.variants, next] });
    setVariantId(next.id);
  };
  const currentRules =
    eligibilityScope === "package"
      ? draft.eligibility
      : draft.variants.find((entry) => entry.id === eligibilityScope)
          ?.eligibility || [];
  const setRules = (eligibility) =>
    eligibilityScope === "package"
      ? patch({ eligibility })
      : patch({
          variants: draft.variants.map((entry) =>
            entry.id === eligibilityScope ? { ...entry, eligibility } : entry,
          ),
        });
  const allItems = draft.variants.flatMap((value) => value.items);
  const parts = [
    ...new Map(
      allItems
        .filter((item) => item.kind === "product")
        .map((item) => [item.productId, item]),
    ).values(),
  ];
  const services = [
    ...new Map(
      allItems
        .filter((item) => item.kind === "service")
        .map((item) => [item.serviceId, item]),
    ).values(),
  ];

  return (
    <section className="min-w-0 bg-white pb-32 sm:pb-0" aria-label="Package editor">
      <header className="space-y-4 border-b border-primary-200 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="mb-3 flex min-h-10 items-center gap-2 text-sm font-semibold text-primary-700"
            >
              <ArrowLeft className="h-4 w-4" />
              All packages
            </button>
            <h2 className="break-words text-xl font-semibold text-primary-950">
              {draft.name || "Create a package"}
            </h2>
            <p className="mt-1 text-sm text-primary-700">
              {draft.expectedRevision === 0
                ? "New package · not saved yet"
                : dirty
                ? "Unsaved changes"
                : lastSaved
                  ? `Saved at ${new Date(lastSaved).toLocaleTimeString()}`
                  : `Saved draft · revision ${draft.expectedRevision || "new"}`}
              {draft.publication_status === "published"
                ? " · The last published revision remains live while you edit."
                : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
            Step {step + 1} / 7
          </span>
        </div>
        <label className="block text-sm font-semibold text-primary-800 md:hidden">
          Editing section
          <select
            value={step}
            onChange={(event) => goToStep(Number(event.target.value))}
            disabled={busy}
            className="mt-1 min-h-11 w-full rounded-xl border border-primary-300 bg-white px-3"
          >
            {PACKAGE_STEPS.map((label, index) => (
              <option key={label} value={index}>
                {index + 1}. {label}
              </option>
            ))}
          </select>
        </label>
        <nav
          aria-label="Package creation steps"
          className="hidden grid-cols-7 gap-2 md:grid"
        >
          {PACKAGE_STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              disabled={busy}
              aria-current={step === index ? "step" : undefined}
              onClick={() => goToStep(index)}
              className={`min-h-12 rounded-xl border px-2 py-2 text-xs font-semibold ${step === index ? "border-blue-600 bg-blue-50 text-blue-950" : "border-primary-200 text-primary-700 hover:bg-primary-50"}`}
            >
              <span className="block text-xs">{index + 1}</span>
              {label}
            </button>
          ))}
        </nav>
        {recoveryMessage && (
          <p className="text-xs text-primary-600">{recoveryMessage}</p>
        )}
      </header>
      <fieldset disabled={busy} className="min-w-0 space-y-5 p-4 sm:p-6">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Help for this step">
          <h3 className="font-semibold text-blue-950">{step + 1}. {PACKAGE_STEPS[step]}</h3>
          <p className="mt-1 text-sm leading-6 text-blue-950">{PACKAGE_STEP_GUIDANCE[step]}</p>
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </div>
        )}
        {step === 0 && (
          <>
            <div>
              <h3 className="text-lg font-semibold text-primary-950">
                What are you offering?
              </h3>
              <p className="mt-1 text-sm text-primary-700">
                Choose the closest match. This helps you organize the package;
                it does not add items or approve vehicle compatibility for you.
              </p>
            </div>
            <div className="space-y-3 sm:hidden">
              <PackageField
                label="Package type"
                value={draft.type}
                options={PACKAGE_TYPE_OPTIONS}
                onChange={(type) => patch({ type })}
              />
              <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-relaxed text-blue-950">
                {PACKAGE_TYPE_OPTIONS.find((option) => option.value === draft.type)?.description}
              </p>
            </div>
            <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
              {PACKAGE_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={draft.type === option.value}
                  onClick={() => patch({ type: option.value })}
                  className={`min-h-28 rounded-2xl border p-4 text-left ${draft.type === option.value ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-primary-200 hover:border-blue-400"}`}
                >
                  <strong className="block text-primary-950">
                    {option.label}
                  </strong>
                  <span className="mt-2 block text-sm text-primary-700">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <PackageField
              label="Package name"
              className="sm:col-span-2"
              placeholder="Enter the name customers will see"
              maxLength={180}
              value={draft.name}
              onChange={(name) =>
                patch({
                  name,
                  ...(!draft.packageKey ||
                  draft.packageKey === packageSlug(draft.name)
                    ? { packageKey: packageSlug(name) || `package-${draft.id.slice(0, 8)}` }
                    : {}),
                })
              }
            />
            <PackageField
              className="sm:col-span-2"
              label="Customer description"
              placeholder="Explain what is included and anything the customer needs to know."
              multiline
              maxLength={2000}
              value={draft.description}
              onChange={(description) => patch({ description })}
            />
            <details className="rounded-xl border border-primary-200 p-4 sm:col-span-2">
            <summary className="cursor-pointer text-sm font-semibold text-primary-900">Optional settings: organization, image link & internal notes</summary>
            <p className="mt-2 text-xs leading-5 text-primary-700">You can leave these as they are. The internal key is filled in from the name; customers do not see it.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <PackageField
              label="Package key"
              value={draft.packageKey}
              maxLength={120}
              onChange={(packageKey) => patch({ packageKey })}
              hint="Unique internal identity. Use lowercase letters, numbers, and hyphens."
            />
            <PackageField
              label="Category"
              maxLength={100}
              value={draft.category}
              onChange={(category) => patch({ category })}
            />
            <PackageField
              label="Service group (optional)"
              maxLength={80}
              value={draft.serviceGroup}
              onChange={(serviceGroup) => patch({ serviceGroup })}
            />
            <PackageField
              label="Display priority"
              type="number"
              min="0"
              step="1"
              value={draft.priority}
              onChange={(value) => patch({ priority: Number(value) })}
              hint="Lower numbers appear first."
            />
            <PackageField
              label="Image URL"
              value={draft.imageUrl}
              onChange={(imageUrl) => patch({ imageUrl })}
            />
            <PackageField
              className="sm:col-span-2"
              label="Internal notes (not shown to customers)"
              multiline
              maxLength={4000}
              value={draft.internalNotes}
              onChange={(internalNotes) => patch({ internalNotes })}
            />
            </div>
            </details>
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-primary-300 bg-primary-50 px-4 text-sm font-semibold text-primary-800">
              <Upload className="h-4 w-4" />
              Upload package image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  void uploadImage(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {draft.imageUrl && (
              <img
                src={draft.imageUrl}
                alt="Package preview"
                className="h-28 max-w-full rounded-xl object-contain"
              />
            )}
          </div>
        )}
        {[2, 4].includes(step) && (
          <details key={`options:${step}`} open={draft.variants.length > 1} className="space-y-3 rounded-2xl border border-primary-200 bg-primary-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-primary-950">{draft.variants.length > 1 ? `Manage ${draft.variants.length} package options` : 'Need Good / Better / Best options? (optional)'}</summary>
            <p className="text-sm leading-6 text-primary-700">Skip this for a single package. Open it only if customers should choose between different sets of items or prices.</p>
            <div className="flex flex-wrap items-end gap-3">
              <PackageField
                className="min-w-48 flex-1"
                label="Package option"
                value={variant?.id || ""}
                options={draft.variants.map((value) => ({
                  value: value.id,
                  label: value.label,
                }))}
                onChange={setVariantId}
              />
              <button
                type="button"
                onClick={() => addOption()}
                disabled={draft.variants.length >= 8}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-primary-300 bg-white px-3 text-sm font-semibold text-primary-800"
              >
                <Plus className="h-4 w-4" />
                Add option
              </button>
              <button
                type="button"
                onClick={() => addOption(true)}
                disabled={!variant || draft.variants.length >= 8}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-primary-300 bg-white px-3 text-sm font-semibold text-primary-800"
              >
                <Copy className="h-4 w-4" />
                Copy option
              </button>
            </div>
            <p className="text-xs text-primary-600">
              One complete package is the default. Add and name options such as
              Good, Better, or Best only when you have approved their individual
              contents and prices.
            </p>
            {variant && (
              <div className="grid gap-3 sm:grid-cols-2">
                <PackageField
                  label="Option name"
                  value={variant.label}
                  maxLength={120}
                  onChange={(label) => patchVariant({ label })}
                />
                <PackageField
                  label="Stable option key"
                  value={variant.key}
                  maxLength={80}
                  onChange={(key) => patchVariant({ key })}
                />
                <label className="flex items-center gap-2 text-sm text-primary-800">
                  <input
                    type="checkbox"
                    checked={variant.active}
                    onChange={(event) =>
                      patchVariant({ active: event.target.checked })
                    }
                  />
                  Include this option when published
                </label>
                {draft.variants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Remove this option from the working draft? Published and issued records stay unchanged.",
                        )
                      )
                        return;
                      patch({
                        variants: draft.variants.filter(
                          (value) => value.id !== variant.id,
                        ),
                      });
                      if (eligibilityScope === variant.id) setEligibilityScope("package");
                      setVariantId(
                        draft.variants.find((value) => value.id !== variant.id)
                          ?.id || "",
                      );
                    }}
                    className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove draft option
                  </button>
                )}
              </div>
            )}
          </details>
        )}
        {step === 2 && variant && (
          <PackageItemsEditor
            variant={variant}
            packageType={draft.type}
            itemLimit={Math.min(40, 120 - allItems.length + variant.items.length)}
            onChange={patchVariant}
          />
        )}
        {step === 3 && (
          <>
            {(draft.variants.length > 1 || draft.variants.some((option) => option.eligibility.length > 0) || eligibilityScope !== "package") && <PackageField
              label="Compatibility applies to"
              value={eligibilityScope}
              onChange={setEligibilityScope}
              options={[
                { value: "package", label: "Default for all package options" },
                ...draft.variants.map((value) => ({
                  value: value.id,
                  label: `${value.label} — separate rules`,
                })),
              ]}
            />}
            {eligibilityScope !== "package" && (
              <p className="text-sm text-primary-700">
                An option with no separate rules uses the package defaults.
                Adding rules here replaces those defaults for this option.
              </p>
            )}
            <PackageEligibilityEditor
              rules={currentRules}
              onChange={setRules}
              productEvidenceRequired={parts.length > 0}
            />
            {parts.length > 0 && (
              <section className="space-y-3 rounded-2xl border border-primary-200 bg-primary-50 p-4">
                <PackageField
                  label="How are these parts / services related and compatible?"
                  value={draft.relationshipEvidence}
                  multiline
                  maxLength={2000}
                  onChange={(relationshipEvidence) =>
                    patch({ relationshipEvidence, relationshipVerified: false })
                  }
                  hint="Record a verified catalog relationship, manufacturer reference, or documented approval. A matching word or category is not enough."
                />
                <label className="flex items-start gap-2 text-sm text-primary-900">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={!draft.relationshipEvidence.trim()}
                    checked={draft.relationshipVerified}
                    onChange={(event) =>
                      patch({ relationshipVerified: event.target.checked })
                    }
                  />
                  I reviewed the relationship and compatibility of every
                  included part and service.
                </label>
              </section>
            )}
          </>
        )}
        {step === 4 && variant && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <PackageField
                label="Pricing method"
                value={variant.pricing.mode}
                options={PRICING_OPTIONS}
                onChange={(mode) =>
                  patchVariant({
                    pricing: { ...variant.pricing, mode, value: 0 },
                  })
                }
              />
              {variant.pricing.mode !== "catalog" && (
                <PackageField
                  label={
                    variant.pricing.mode === "percentage"
                      ? "Discount percentage"
                      : variant.pricing.mode === "fixed_discount"
                        ? "Amount off (PHP)"
                        : "Complete package price (PHP)"
                  }
                  type="number"
                  min="0"
                  max={
                    variant.pricing.mode === "percentage" ? "100" : "100000000"
                  }
                  step="0.01"
                  value={variant.pricing.value}
                  onChange={(value) =>
                    patchVariant({ pricing: { ...variant.pricing, value } })
                  }
                />
              )}
              <PackageField
                label="When source prices change"
                hint="Current prices update future offers when the catalog changes. Keeping approved prices means you must review them yourself. Saved quotes never change."
                value={variant.pricing.strategy}
                options={[
                  { value: "live", label: "Use current catalog prices" },
                  {
                    value: "snapshot",
                    label: "Keep catalog prices approved at publication",
                  },
                  {
                    value: "manual",
                    label: "Reprice only by explicit review and publication",
                  },
                ]}
                onChange={(strategy) =>
                  patchVariant({ pricing: { ...variant.pricing, strategy } })
                }
              />
            </div>
            <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-950">
              Already-issued quotes retain their saved prices. A new publication
              affects future offers only. Item-specific prices and complimentary
              labor are configured in Items.
            </p>
            <details className="space-y-3 rounded-2xl border border-primary-200 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-primary-950">When to recommend this package {draft.anchorProductId || draft.anchorCategory || draft.triggerServiceId ? '(rules already set)' : '(optional)'}</summary>
              <h4 className="font-semibold text-primary-950">
                Show it after a customer chooses a matching part or service
              </h4>
              <PackageField
                label="When this part is selected (optional)"
                value={draft.anchorProductId || ""}
                options={[
                  { value: "", label: "No specific part trigger" },
                  ...parts.map((item) => ({
                    value: item.productId,
                    label: `${item.display?.sku || ""} ${item.display?.name || item.productId}`,
                  })),
                ]}
                onChange={(anchorProductId) =>
                  patch({
                    anchorProductId: anchorProductId || null,
                    anchorCategory: "",
                    triggerServiceId: null,
                  })
                }
              />
              {draft.anchorProductId && (
                <PackageField
                  label="Minimum quantity of trigger part"
                  type="number"
                  min="1"
                  max="1000"
                  value={draft.minAnchorQuantity}
                  onChange={(value) =>
                    patch({ minAnchorQuantity: Number(value) })
                  }
                />
              )}
              <PackageField
                label="Or when a part in this exact category is selected"
                value={draft.anchorCategory}
                maxLength={100}
                onChange={(anchorCategory) =>
                  patch({
                    anchorCategory,
                    anchorProductId: null,
                    triggerServiceId: null,
                  })
                }
                hint="Leave all triggers empty for a standalone offer. Vehicle compatibility still applies."
              />
              <PackageField
                label="Or when this service is selected"
                value={draft.triggerServiceId || ""}
                options={[
                  { value: "", label: "No specific service trigger" },
                  ...services.map((item) => ({
                    value: item.serviceId,
                    label: item.display?.name || item.serviceId,
                  })),
                ]}
                onChange={(triggerServiceId) =>
                  patch({
                    triggerServiceId: triggerServiceId || null,
                    anchorProductId: null,
                    anchorCategory: "",
                  })
                }
              />
            </details>
          </>
        )}
        {step >= 4 && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-primary-950">
                {step >= 5 ? "Customer preview" : "Live price preview"}
              </h3>
              <div className="flex rounded-xl border border-primary-200 p-1">
                {["desktop", "mobile"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={viewport === value}
                    onClick={() => setViewport(value)}
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${viewport === value ? "bg-primary-950 text-white" : "text-primary-700"}`}
                  >
                    {value === "mobile" ? "Mobile" : "Desktop"}
                  </button>
                ))}
              </div>
            </div>
            {draft.name.trim() && draft.packageKey.trim() && (previewBusy || (!previewCurrent && !previewError)) ? (
              <p
                role="status"
                className="flex items-center gap-2 text-sm text-primary-700"
              >
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Checking current catalog prices…
              </p>
            ) : null}
            {previewError && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {previewError}
              </p>
            )}
            {previewCurrent && (
              <>
                <div
                  className={
                    viewport === "mobile"
                      ? "mx-auto w-full max-w-[390px]"
                      : "w-full max-w-3xl"
                  }
                >
                  <ManagedPackageCard
                    definition={preview.data.definition}
                    prices={preview.data.variants}
                  />
                </div>
                <p
                  className={`rounded-xl border p-3 text-sm ${preview.data.publishable ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
                >
                  {preview.data.publishable
                    ? "The current package passes publication checks. Review the exact items and price before publishing."
                    : `Draft — needs review: ${preview.data.publicationError}`}
                </p>
              </>
            )}
            {!draft.name && (
              <p className="text-sm text-primary-700">
                Add a package name in Name & details to load the preview. Its internal key is filled in for you.
              </p>
            )}
          </section>
        )}
        {step === 6 && draft.expectedRevision > 0 && <PackageActivity packageId={draft.id} revision={draft.expectedRevision} />}
        {step === 6 && (
          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4 text-sm leading-relaxed text-primary-800">
            <h3 className="font-semibold text-primary-950">
              Choose what happens next
            </h3>
            <p className="mt-2">
              Not ready for customers? Choose Save Draft. It keeps your work
              for staff without changing the current published offer. Ready to
              show it? Check the preview, then choose Save & Publish. Quotes
              already issued keep their saved prices.
            </p>
            {draft.publication_status === "published" && (
              <p className="mt-2 font-semibold">
                This package already has a live revision. Publishing replaces it
                for new quotations only.
              </p>
            )}
          </div>
        )}
      </fieldset>
      <footer className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t border-primary-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(15,23,42,0.05)] backdrop-blur sm:sticky sm:inset-x-auto sm:z-10 sm:p-4 sm:px-6">
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Back"
            disabled={busy || step === 0}
            onClick={() => goToStep(step - 1)}
            className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-primary-300 px-3 text-sm font-semibold text-primary-800 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <button
            type="button"
            disabled={busy || !draft.name.trim() || !draft.packageKey.trim()}
            onClick={() => save(false)}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-primary-300 bg-white px-3 text-sm font-semibold text-primary-900 disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Draft
          </button>
        </div>
        {step < 6 ? (
          <button
            type="button"
            disabled={busy}
            onClick={goNext}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            <span className="sm:hidden">Next</span>
            <span className="hidden sm:inline">Next: {PACKAGE_STEPS[step + 1]}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={
              busy ||
              previewBusy ||
              !previewCurrent ||
              !preview?.data.publishable
            }
            onClick={() => setConfirmPublication(true)}
            className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save & Publish"}
          </button>
        )}
      </footer>
      <ConfirmDialog
        isOpen={confirmDiscard}
        title="Leave without saving your changes?"
        message="Your latest changes have not been saved to the system. Choose Keep editing, then Save Draft if you want to keep them. Discard changes leaves your last saved draft and published package unchanged."
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        isLoading={busy}
        onClose={() => { if (!busy) setConfirmDiscard(false); }}
        onConfirm={() => { if (!busy) discardAndClose(); }}
      />
      <ConfirmDialog
        isOpen={confirmPublication}
        title={draft.publication_status === "published" ? "Update this published package?" : "Show this package to customers?"}
        message={`Publish ${draft.name || 'this package'} with the items and prices in your preview? Customers who match its vehicle and recommendation rules can then add it to a quote. Existing quotes will not change. Choose Cancel if you want to keep working on the draft.`}
        confirmLabel={draft.publication_status === "published" ? "Publish updated package" : "Publish package"}
        confirmVariant="primary"
        isLoading={busy}
        onClose={() => { if (!busy) setConfirmPublication(false); }}
        onConfirm={() => {
          if (busy) return;
          setConfirmPublication(false);
          if (previewBusy || !previewCurrent || !preview?.data.publishable) {
            setError("The preview changed. Check the items and price again before publishing.");
            return;
          }
          void save(true);
        }}
      />
    </section>
  );
}

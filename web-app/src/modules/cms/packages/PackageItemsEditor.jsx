import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import PackageField from "./PackageField";
import PackageRecordSearch from "./PackageRecordSearch";
import { newPackageItem } from "./packageEditorModel";
import { createPackageService } from "../../../services/managedPackagesApi";
import { formatCurrency } from "../../../utils/formatters";

function NewServiceForm({ onCreated, onCancel }) {
  const [draft, setDraft] = useState({
    code: "",
    name: "",
    description: "",
    category: "",
    price: "",
    durationMinutes: 30,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const patch = (value) => setDraft((current) => ({ ...current, ...value }));
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = await createPackageService(draft);
      onCreated(saved);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <h4 className="font-semibold text-blue-950">Create a saved service</h4>
      <p className="text-sm text-blue-900">
        This adds a real service to the catalog. It becomes selectable in
        packages and quotations.
      </p>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <PackageField
          label="Service code"
          maxLength={50}
          value={draft.code}
          onChange={(code) => patch({ code })}
        />
        <PackageField
          label="Service name"
          maxLength={180}
          value={draft.name}
          onChange={(name) => patch({ name })}
        />
        <PackageField
          label="Category"
          value={draft.category}
          maxLength={100}
          onChange={(category) => patch({ category })}
        />
        <PackageField
          label="Standard price (PHP)"
          type="number"
          min="0"
          step="0.01"
          value={draft.price}
          onChange={(price) => patch({ price })}
        />
        <PackageField
          label="Duration (minutes)"
          type="number"
          min="1"
          max="1440"
          value={draft.durationMinutes}
          onChange={(value) => patch({ durationMinutes: Number(value) })}
        />
        <PackageField
          className="sm:col-span-2"
          label="What does this service include?"
          value={draft.description}
          multiline
          maxLength={2000}
          onChange={(description) => patch({ description })}
        />
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving service…" : "Create service and add it"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-primary-300 bg-white px-4 text-sm font-semibold text-primary-800"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

export default function PackageItemsEditor({ variant, packageType, onChange, itemLimit = 40 }) {
  const [kind, setKind] = useState(
    packageType === "service" ? "service" : "product",
  );
  const [creatingService, setCreatingService] = useState(false);
  const actualKind =
    packageType === "service"
      ? "service"
      : packageType === "parts"
        ? "product"
        : kind;
  const selectedIds = variant.items
    .map((item) => (actualKind === "product" ? item.productId : item.serviceId))
    .filter(Boolean);
  const updateItem = (id, patch) =>
    onChange({
      items: variant.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  const add = (row, itemKind = actualKind) => {
    const alreadyAdded = variant.items.some(
      (item) =>
        item.kind === itemKind && (item.productId || item.serviceId) === row.id,
    );
    if (alreadyAdded || variant.items.length >= itemLimit) return;
    onChange({
      items: [
        ...variant.items,
        newPackageItem(row, itemKind, variant.items.length),
      ],
    });
  };
  const move = (index, offset) => {
    const items = [...variant.items];
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    onChange({
      items: items.map((item, displayOrder) => ({ ...item, displayOrder })),
    });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-primary-950">
          Included items · {variant.items.length}/{itemLimit}
        </h3>
        {!["parts", "service"].includes(packageType) && (
          <div className="flex rounded-xl border border-primary-200 bg-primary-50 p-1">
            {["product", "service"].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={actualKind === value}
                onClick={() => {
                  setKind(value);
                  setCreatingService(false);
                }}
                className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${actualKind === value ? "bg-primary-950 text-white" : "text-primary-700"}`}
              >
                {value === "product" ? "Parts" : "Services"}
              </button>
            ))}
          </div>
        )}
      </div>
      {!creatingService && variant.items.length < itemLimit && (
        <PackageRecordSearch
          key={actualKind}
          kind={actualKind}
          selectedIds={selectedIds}
          onSelect={add}
        />
      )}
      {actualKind === "service" && variant.items.length < itemLimit &&
        (creatingService ? (
          <NewServiceForm
            onCancel={() => setCreatingService(false)}
            onCreated={(row) => {
              add(row, "service");
              setCreatingService(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreatingService(true)}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 text-sm font-semibold text-blue-900"
          >
            <Plus className="h-4 w-4" />
            Create a service not yet in the catalog
          </button>
        ))}
      {!variant.items.length && (
        <p className="rounded-xl border border-dashed border-primary-300 p-4 text-sm text-primary-700">
          Choose saved parts or services above. New packages do not contain
          example products.
        </p>
      )}
      <div className="space-y-3">
        {variant.items.map((item, index) => (
          <article
            key={item.id}
            className="rounded-2xl border border-primary-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-all font-bold text-primary-950">
                  {item.display?.sku ||
                    (item.kind === "product" ? "Saved part" : "Saved service")}
                </p>
                <p className="mt-1 break-words text-sm text-primary-800">
                  {item.display?.name || item.productId || item.serviceId}
                </p>
                <p className="mt-1 text-xs text-primary-600">
                  {item.display?.price == null
                    ? "Current price shown in preview"
                    : `Current price: ${formatCurrency(item.display.price)}`}
                  {item.display?.model
                    ? ` · Source model: ${item.display.model}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${item.display?.sku || item.kind}`}
                onClick={() =>
                  onChange({
                    items: variant.items.filter(
                      (value) => value.id !== item.id,
                    ),
                  })
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <PackageField
                label="Quantity"
                type="number"
                min="1"
                max="1000"
                step="1"
                value={item.quantity}
                onChange={(value) =>
                  updateItem(item.id, { quantity: Number(value) })
                }
              />
              <PackageField
                label="Item pricing"
                value={item.priceMode}
                options={[
                  { value: "catalog", label: "Catalog price" },
                  { value: "override", label: "Approved unit price" },
                  ...(item.kind === "service"
                    ? [
                        {
                          value: "complimentary",
                          label: "Complimentary service",
                        },
                      ]
                    : []),
                ]}
                onChange={(priceMode) =>
                  updateItem(item.id, {
                    priceMode,
                    priceOverride: priceMode === "override" ? "" : null,
                  })
                }
              />
              {item.priceMode === "override" && (
                <PackageField
                  label="Approved unit price (PHP)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.priceOverride}
                  onChange={(priceOverride) =>
                    updateItem(item.id, { priceOverride })
                  }
                />
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-primary-800">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.required}
                  onChange={(event) =>
                    updateItem(item.id, { required: event.target.checked })
                  }
                />
                Required for this option
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.active}
                  onChange={(event) =>
                    updateItem(item.id, { active: event.target.checked })
                  }
                />
                Include in this option
              </label>
              <div className="ml-auto flex gap-1">
                <button
                  type="button"
                  aria-label="Move item up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary-200 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move item down"
                  disabled={index === variant.items.length - 1}
                  onClick={() => move(index, 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary-200 disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

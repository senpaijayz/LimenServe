import { useState } from "react";
import { Check, Package, Plus } from "lucide-react";
import { formatCurrency } from "../../../utils/formatters";

const availabilityLabels = {
  available: "Available",
  partially_available: "Some parts may need ordering",
  out_of_stock: "Parts currently out of stock",
  unknown: "Stock availability needs confirmation",
};

function eligibilityLabel(rule) {
  if (!rule.verified || rule.mode === "unverified")
    return "Compatibility needs review";
  if (rule.mode === "universal") return "Vehicle-independent offer";
  const vehicle = [
    rule.make,
    rule.model || rule.family,
    rule.variant,
    rule.engine,
  ]
    .filter(Boolean)
    .join(" · ");
  const years =
    rule.yearFrom && rule.yearTo
      ? rule.yearFrom === rule.yearTo
        ? String(rule.yearFrom)
        : `${rule.yearFrom}–${rule.yearTo}`
      : rule.yearFrom
        ? `From ${rule.yearFrom}`
        : rule.yearTo
          ? `Up to ${rule.yearTo}`
          : "";
  return [vehicle || "Selected recorded vehicle configuration", years]
    .filter(Boolean)
    .join(" · ");
}

export default function ManagedPackageCard({
  definition,
  prices = [],
  onAdd,
  addedVariantIds = [],
  busy = false,
  selectedVariantId,
  onVariantChange,
  initialVariantId = "",
  addLabel = "Add package",
}) {
  const [selectedId, setSelectedId] = useState(initialVariantId);
  const variants = prices.filter((price) =>
    definition.variants?.some(
      (variant) => variant.id === price.variantId && variant.active !== false,
    ),
  );
  const selected =
    variants.find(
      (variant) => variant.variantId === (selectedVariantId ?? selectedId),
    ) || variants[0];
  const added = selected && addedVariantIds.includes(selected.variantId);
  const selectedDefinition = definition.variants?.find(
    (variant) => variant.id === selected?.variantId,
  );
  const eligibility = selectedDefinition?.eligibility?.length
    ? selectedDefinition.eligibility
    : definition.eligibility || [];
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-primary-200 bg-white shadow-sm">
      {definition.imageUrl && (
        <img
          src={definition.imageUrl}
          alt=""
          loading="lazy"
          className="h-40 w-full object-cover"
        />
      )}
      <header className="border-b border-primary-100 bg-primary-950 p-5 text-white">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-200">
          <Package className="h-4 w-4" />
          Package
        </p>
        <h3 className="mt-2 break-words text-xl font-semibold text-white">
          {definition.name}
        </h3>
        {definition.description && (
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-primary-100">
            {definition.description}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <span className="text-sm text-primary-100">
            {selected?.label || "Complete package"}
          </span>
          <div className="text-right">
            <span className="block text-xs text-primary-200">
              Package total · before VAT
            </span>
            <strong className="text-2xl tabular-nums text-white">
              {selected?.valid === false || !selected
                ? "Price needs review"
                : formatCurrency(selected.packageTotal)}
            </strong>
          </div>
        </div>
      </header>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm text-primary-800">
          <p className="font-semibold">Vehicle eligibility</p>
          {eligibility.length ? (
            <ul className="mt-1 space-y-1">
              {eligibility.map((rule, index) => (
                <li key={rule.id || index}>{eligibilityLabel(rule)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">
              Compatibility needs review before publication.
            </p>
          )}
        </div>
        {variants.length > 1 && (
          <label className="block text-sm font-semibold text-primary-800">
            Choose an option
            <select
              className="mt-2 min-h-11 w-full rounded-xl border border-primary-300 bg-white px-3"
              value={selected?.variantId || ""}
              onChange={(event) => {
                setSelectedId(event.target.value);
                onVariantChange?.(event.target.value);
              }}
            >
              {variants.map((variant) => (
                <option key={variant.variantId} value={variant.variantId}>
                  {variant.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {selected?.valid === false ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {selected.error}
          </p>
        ) : (
          selected && (
            <>
              <ul
                className="max-h-80 overflow-y-auto divide-y divide-primary-100 pr-1"
                aria-label="Included package items"
              >
                {selected.lines.map((line) => (
                  <li
                    key={line.itemId}
                    className="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="break-all font-bold text-primary-950">
                        {line.sku ||
                          (line.kind === "service" ? "Labor" : "Part")}
                      </p>
                      <p className="mt-0.5 break-words text-sm text-primary-700">
                        {line.name}
                      </p>
                      <p className="mt-1 text-xs text-primary-600">
                        Qty {line.quantity}
                        {line.kind === "service" ? " · Service / labor" : ""}
                        {line.priceMode === "complimentary"
                          ? " · Complimentary"
                          : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm tabular-nums">
                      {line.savings > 0 && (
                        <span className="block text-xs text-primary-500 line-through">
                          {formatCurrency(line.catalogTotal)}
                        </span>
                      )}
                      <strong className="text-primary-950">
                        {formatCurrency(line.effectiveTotal)}
                      </strong>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">
                <div className="flex justify-between gap-3">
                  <span>Catalog total</span>
                  <span>{formatCurrency(selected.catalogTotal)}</span>
                </div>
                {selected.savings > 0 && (
                  <div className="mt-1 flex justify-between gap-3 font-semibold text-emerald-700">
                    <span>Package savings</span>
                    <span>{formatCurrency(selected.savings)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between gap-3 border-t border-primary-200 pt-2 font-bold">
                  <span>With VAT (12%)</span>
                  <span>{formatCurrency(selected.grandTotal)}</span>
                </div>
              </div>
              <p
                className={`rounded-xl border px-3 py-2 text-xs font-medium ${selected.availability === "available" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
              >
                {availabilityLabels[selected.availability] ||
                  availabilityLabels.unknown}
                . A quotation does not hold or deduct stock.
              </p>
            </>
          )
        )}
        {onAdd && (
          <button
            type="button"
            disabled={busy || added || !selected || selected.valid === false}
            onClick={() => onAdd(definition, selected)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {added ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {busy ? "Adding…" : added ? "Package added" : addLabel}
          </button>
        )}
      </div>
    </article>
  );
}

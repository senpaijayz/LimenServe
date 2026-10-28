import { useState } from "react";
import { Link } from "react-router";

const field = "input min-h-11 w-full min-w-0 mt-1";
export default function ReplenishmentSupplyPlan({
  item,
  value,
  onChange,
  suppliers,
  ready,
  admin,
  disabled,
}) {
  const supplierName =
    suppliers.find((s) => s.id === value.supplierId)?.name ||
    (value.supplierId === item.supplier_id ? item.supplier_name : "") ||
    (value.supplierId ? "Selected supplier" : "No supplier");
  return (
    <details className="rounded-lg border border-primary-200 p-3">
      <summary className="cursor-pointer break-words text-sm font-semibold text-primary-800">
        Supplier · {supplierName}
      </summary>
      {admin ? (
        <fieldset disabled={disabled} className="mt-3 space-y-3">
          <label className="block text-xs font-semibold text-primary-800">
            Supplier
            <select
              className={field}
              disabled={!ready}
              value={value.supplierId}
              onChange={(event) => onChange("supplierId", event.target.value)}
            >
              <option value="">No supplier</option>
              {value.supplierId &&
                !suppliers.some((s) => s.id === value.supplierId) && (
                  <option value={value.supplierId}>
                    {supplierName} (current)
                  </option>
                )}
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-primary-800">
            Expected delivery (calendar days)
            <input
              className={field}
              type="number"
              min="0"
              max="3650"
              step="1"
              placeholder="Unknown"
              disabled={!value.supplierId || !ready}
              value={value.leadTimeDays}
              onChange={(event) => onChange("leadTimeDays", event.target.value)}
            />
          </label>
          <p className="text-xs text-primary-600">
            Leave blank if unknown. Use 0 for same-day delivery. Changing or
            clearing the supplier clears its old delivery estimate.
          </p>
          <Link
            className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-800 underline"
            to="/suppliers"
          >
            Manage suppliers
          </Link>
        </fieldset>
      ) : (
        <p className="mt-3 text-sm text-primary-700">
          Expected delivery:{" "}
          {value.leadTimeDays === ""
            ? "Unknown"
            : `${value.leadTimeDays} calendar days`}
        </p>
      )}
      <p className="mt-2 text-xs text-primary-600">
        Planning estimate only. No supplier order or promised arrival date.
      </p>
    </details>
  );
}

export function BulkSupplyPlan({
  selected,
  disabled,
  suppliers,
  ready,
  onApply,
}) {
  const [mode, setMode] = useState("keep");
  const [supplierId, setSupplierId] = useState("");
  const [daysMode, setDaysMode] = useState("keep");
  const [days, setDays] = useState("");
  const validDays =
    days.trim() !== "" &&
    Number.isInteger(Number(days)) &&
    Number(days) >= 0 &&
    Number(days) <= 3650;
  return (
    <fieldset
      disabled={disabled || !ready}
      className="space-y-3 border-t border-primary-200 pt-4"
    >
      <h2 className="font-semibold text-primary-950">
        Supplier and delivery planning
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-primary-800">
          Supplier action
          <select
            className={field}
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="keep">Keep each part’s supplier</option>
            <option value="choose">Choose one supplier</option>
            <option value="clear">Clear supplier and delivery estimate</option>
          </select>
        </label>
        {mode === "choose" && (
          <label className="text-sm text-primary-800">
            Supplier
            <select
              className={field}
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            >
              <option value="">Choose supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode !== "clear" && (
          <label className="text-sm text-primary-800">
            Delivery estimate
            <select
              className={field}
              value={daysMode}
              onChange={(event) => setDaysMode(event.target.value)}
            >
              <option value="keep">
                Keep existing days for unchanged suppliers
              </option>
              <option value="unknown">Set as unknown</option>
              <option value="days">Set calendar days</option>
            </select>
          </label>
        )}
        {mode !== "clear" && daysMode === "days" && (
          <label className="text-sm text-primary-800">
            Calendar days
            <input
              className={field}
              type="number"
              min="0"
              max="3650"
              step="1"
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
          </label>
        )}
      </div>
      <p className="text-xs text-primary-600">
        A changed supplier starts with an unknown delivery time unless you enter
        new days. Applying here only edits the selected rows; Save settings
        commits the whole batch.
      </p>
      <button
        type="button"
        className="btn border border-primary-300"
        disabled={
          !selected ||
          (mode === "keep" && daysMode === "keep") ||
          (mode === "choose" && !supplierId) ||
          (mode !== "clear" && daysMode === "days" && !validDays)
        }
        onClick={() => onApply({ mode, supplierId, daysMode, days })}
      >
        Apply supplier plan to {selected} selected
      </button>
    </fieldset>
  );
}

import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import PackageField from "./PackageField";
import PackageRecordSearch from "./PackageRecordSearch";
import { newEligibilityRule } from "./packageEditorModel";

const modes = [
  { value: "unverified", label: "Unverified — keep as draft" },
  { value: "exact", label: "Exact recorded configuration" },
  { value: "model_year", label: "Approved model / year range" },
  { value: "family", label: "Verified vehicle family" },
  { value: "universal", label: "Explicitly approved universal use" },
];

export default function PackageEligibilityEditor({
  rules,
  onChange,
  productEvidenceRequired = false,
}) {
  const update = (id, patch) =>
    onChange(
      rules.map((rule) =>
        rule.id === id ? { ...rule, verified: false, ...patch } : rule,
      ),
    );
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-relaxed text-blue-950">
        Vehicle choices identify saved configurations. They do not prove that a
        part fits.
        {productEvidenceRequired &&
          " Confirm the selected parts against a reliable fitment source before approving this package."}{" "}
        Make and trim are not recorded in the current vehicle source.
      </div>
      {!rules.length && (
        <p className="rounded-xl border border-dashed border-primary-300 p-4 text-sm text-primary-700">
          No compatibility approval yet. This package can be saved as a draft,
          but cannot be published.
        </p>
      )}
      {rules.map((rule, index) => (
        <section
          key={rule.id}
          className="space-y-4 rounded-2xl border border-primary-200 bg-white p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold text-primary-950">
              Compatibility rule {index + 1}
            </h4>
            <button
              type="button"
              aria-label={`Remove compatibility rule ${index + 1}`}
              onClick={() =>
                onChange(rules.filter((value) => value.id !== rule.id))
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <PackageField
            label="How does this package apply?"
            value={rule.mode}
            options={modes}
            onChange={(mode) =>
              update(rule.id, {
                mode,
                fitmentId: mode === "exact" ? rule.fitmentId : null,
              })
            }
          />
          {["exact", "model_year", "family"].includes(rule.mode) && (
            <>
              <PackageRecordSearch
                kind="vehicle"
                selectedIds={rule.fitmentId ? [rule.fitmentId] : []}
                onSelect={(row) =>
                  update(rule.id, {
                    fitmentId: rule.mode === "exact" ? row.id : null,
                    model: row.model_name,
                    family: row.vehicle_family || "",
                    engine: row.engine || "",
                    yearFrom: row.year,
                    yearTo: row.year,
                  })
                }
              />
              {rule.fitmentId && (
                <p className="rounded-xl bg-primary-50 p-3 text-sm font-semibold text-primary-900">
                  Selected: {rule.model} · {rule.yearFrom} ·{" "}
                  {rule.engine || "Engine not recorded"}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <PackageField
                  label="Model"
                  value={rule.model}
                  onChange={(model) => update(rule.id, { model })}
                  disabled={rule.mode === "exact"}
                />
                <PackageField
                  label="Engine (if recorded)"
                  value={rule.engine}
                  onChange={(engine) => update(rule.id, { engine })}
                  disabled={rule.mode === "exact"}
                />
                <PackageField
                  label="From year"
                  type="number"
                  min="1900"
                  max="2200"
                  value={rule.yearFrom}
                  onChange={(year) =>
                    update(rule.id, { yearFrom: year ? Number(year) : null })
                  }
                  disabled={rule.mode === "exact"}
                />
                <PackageField
                  label="Through year"
                  type="number"
                  min="1900"
                  max="2200"
                  value={rule.yearTo}
                  onChange={(year) =>
                    update(rule.id, { yearTo: year ? Number(year) : null })
                  }
                  disabled={rule.mode === "exact"}
                />
                {rule.mode === "family" && (
                  <PackageField
                    label="Recorded vehicle family"
                    value={rule.family}
                    onChange={(family) => update(rule.id, { family })}
                  />
                )}
              </div>
            </>
          )}
          {rule.mode === "universal" && (
            <p className="text-sm text-amber-900">
              Use universal eligibility only when these services or parts are
              genuinely vehicle-independent. It is not a substitute for missing
              fitment information.
            </p>
          )}
          <PackageField
            label="Approval evidence / source"
            value={rule.evidence}
            multiline
            maxLength={1000}
            placeholder="Record the catalog, manufacturer reference, or documented administrator review that supports this rule."
            onChange={(evidence) => update(rule.id, { evidence })}
          />
          <label className="flex items-start gap-3 rounded-xl bg-primary-50 p-3 text-sm text-primary-900">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={rule.verified}
              disabled={rule.mode === "unverified" || !rule.evidence.trim()}
              onChange={(event) =>
                update(rule.id, { verified: event.target.checked })
              }
            />
            <span>
              <span className="flex items-center gap-1 font-semibold">
                <ShieldCheck className="h-4 w-4" />I reviewed and approve this
                eligibility
              </span>
              <span className="mt-1 block text-xs text-primary-600">
                Changing this rule requires reviewing it again. Approval is
                recorded when you save.
              </span>
            </span>
          </label>
        </section>
      ))}
      <button
        type="button"
        disabled={rules.length >= 30}
        onClick={() => onChange([...rules, newEligibilityRule()])}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 text-sm font-semibold text-blue-900 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Add compatibility rule
      </button>
    </div>
  );
}

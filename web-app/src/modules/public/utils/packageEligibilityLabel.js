export function eligibilityLabel(rule) {
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

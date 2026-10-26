// Formatting only. Package definitions and prices come from published CMS records.
export function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function formatVehicleDisplayLabel(vehicle) {
  return [vehicle?.model, vehicle?.year, vehicle?.engine].filter(Boolean).join(' ') || 'your Mitsubishi vehicle';
}

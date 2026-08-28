export function parsePriceListVersionYear(value, effectiveFrom) {
  const provided = String(value ?? '').trim();
  if (provided) {
    if (!/^\d{4}$/.test(provided)) {
      return null;
    }

    const parsed = Number(provided);
    return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2200 ? parsed : null;
  }

  const inferred = Number.parseInt(String(effectiveFrom || '').slice(0, 4), 10);
  return Number.isInteger(inferred) && inferred >= 2000 && inferred <= 2200 ? inferred : null;
}

export function parsePriceListActivation(value, fallback = true) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function comparePriceListRows(previousRows = [], nextRows = []) {
  const previous = new Map((previousRows ?? []).filter((row) => row?.sku).map((row) => [String(row.sku).trim().toUpperCase(), row]));
  const next = new Map((nextRows ?? []).filter((row) => row?.sku).map((row) => [String(row.sku).trim().toUpperCase(), row]));
  const skus = [...new Set([...previous.keys(), ...next.keys()])].sort();

  return skus.map((sku) => {
    const oldRow = previous.get(sku);
    const newRow = next.get(sku);
    const previousPrice = oldRow?.price == null ? null : Number(oldRow.price);
    const newPrice = newRow?.price == null ? null : Number(newRow.price);
    const difference = previousPrice == null || newPrice == null
      ? null
      : Number((newPrice - previousPrice).toFixed(2));

    return {
      sku,
      name: newRow?.name ?? oldRow?.name ?? sku,
      previousPrice,
      newPrice,
      difference,
      status: !oldRow ? 'new_part' : !newRow ? 'removed_from_list' : difference === 0 ? 'unchanged' : 'new_price',
    };
  });
}

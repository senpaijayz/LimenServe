// An overlay can retain a part from an older workbook at the same sheet/row
// occupied by a different part in the new workbook. The active projection
// requires distinct sheet/row keys; never discard either part to satisfy it.
export function disambiguateSourceLocations(items, preferredSkus = new Set()) {
  const maxBySheet = new Map();
  for (const item of items) {
    const sheet = String(item.sourceSheet || 'Uploaded pricelist');
    const line = Math.max(1, Number(item.sourceLineNumber) || 1);
    maxBySheet.set(sheet, Math.max(maxBySheet.get(sheet) || 0, line));
  }
  const used = new Set();
  const normalized = items.map((item) => ({ ...item }));
  const order = normalized.map((_, index) => index).sort((a, b) =>
    Number(preferredSkus.has(normalized[b].sku)) - Number(preferredSkus.has(normalized[a].sku)) || a - b);
  let adjusted = 0;
  for (const index of order) {
    const item = normalized[index];
    const sheet = String(item.sourceSheet || 'Uploaded pricelist');
    let line = Math.max(1, Number(item.sourceLineNumber) || 1);
    let key = JSON.stringify([sheet, line]);
    if (used.has(key)) {
      line = (maxBySheet.get(sheet) || 0) + 1;
      maxBySheet.set(sheet, line);
      key = JSON.stringify([sheet, line]);
      adjusted++;
    }
    item.sourceSheet = sheet;
    item.sourceLineNumber = line;
    used.add(key);
  }
  return { items: normalized, adjusted };
}

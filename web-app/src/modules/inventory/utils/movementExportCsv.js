const zone = 'Asia/Manila';
export function manilaDay(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function movementDateBounds(range) {
  const days = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 }[range];
  if (!days) return { startDate: undefined, endDate: undefined };
  const endDate = manilaDay();
  const start = new Date(`${endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}
export function csvCell(value) {
  let text = String(value ?? '');
  // Human spreadsheet export, not a lossless re-import format. Quote every cell
  // and prefix formula-like text; genuine numeric stock deltas remain numeric.
  if (typeof value !== 'number' && (/^[\s\uFEFF]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/.test(text))) text = `\t${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const localTime = (value) => value ? new Intl.DateTimeFormat('en-PH', { timeZone: zone, dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)) : '';
export function buildMovementCsv(snapshot) {
  const { movements, filters, generatedAt, totalCount } = snapshot;
  if (!Array.isArray(movements) || snapshot.tooLarge || movements.length !== Number(totalCount)) throw new Error('The export was incomplete. No file was created; please retry.');
  const rows = [
    ['LimenServe inventory movement history'], ['Generated (Philippine time)', localTime(generatedAt)],
    ['Search', filters.search || '(none)'], ['Movement type', filters.type],
    ['Business dates from', filters.startDate || '(all)'], ['Business dates through', filters.endDate || '(all)'],
    ['Matching records', totalCount], ['Spreadsheet note', 'Import part numbers as Text to keep leading zeros. Formula-like text is prefixed for viewing; use original records for machine imports.'], [],
    ['Movement ID', 'Part Number', 'Product', 'Action', 'Previous Stock', 'Change', 'New Stock', 'Supplier', 'Reference', 'Staff', 'Business Date', 'Recorded (Philippine time)', 'Recorded (UTC)', 'Notes'],
    ...movements.map((m) => [m.id, m.sku || '', m.productName || 'Unknown product', m.movementType, m.previousStock ?? '', m.quantity ?? '', m.newStock ?? '', m.supplierName || '', m.referenceNumber || m.referenceType || '', m.performedBy || '', m.businessDate || '', localTime(m.createdAt), m.createdAt || '', m.notes || '']),
  ];
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
export function downloadMovementCsv(snapshot) {
  const blob = new Blob([buildMovementCsv(snapshot)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `inventory-history-${manilaDay(new Date(snapshot.generatedAt))}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

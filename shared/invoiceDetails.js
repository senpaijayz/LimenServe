export const INVOICE_FIELDS = [
  ['customerAddress', 'Customer address', 300],
  ['customerTin', 'Customer TIN', 40],
  ['businessStyle', 'Business style', 120],
  ['terms', 'Payment terms', 120],
  ['poNumber', 'P.O. number', 80],
  ['oscaPwdId', 'OSCA / PWD ID number', 80],
  ['customerContact', 'Customer contact', 80],
  ['receivedBy', 'Received by (printed name)', 120],
];

export function normalizeInvoiceDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Review the additional invoice details.');
  if (Object.keys(value).some(key => !INVOICE_FIELDS.some(([field]) => field === key))) throw new Error('Unknown invoice detail.');
  return Object.fromEntries(INVOICE_FIELDS.flatMap(([key, label, limit]) => {
    if (value[key] === undefined) return [];
    if (typeof value[key] !== 'string' || value[key].length > limit) throw new Error(`Keep ${label.toLowerCase()} within ${limit} characters.`);
    const text = value[key].trim();
    return text ? [[key, text]] : [];
  }));
}

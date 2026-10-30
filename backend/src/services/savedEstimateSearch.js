const statuses = new Set(['', 'draft', 'sent', 'approved', 'rejected', 'expired', 'converted_sale', 'converted_service']);
const validities = new Set(['current', 'past', 'all']);

export function parseSavedEstimateSearch(query = {}) {
  const scalar = (value, fallback) => value === undefined ? fallback : typeof value === 'string' ? value : null;
  const search = scalar(query.search, '')?.trim();
  const status = scalar(query.status, '');
  const validity = scalar(query.validity, 'current');
  const page = scalar(query.page, '1');
  const pageSize = scalar(query.pageSize, '8');
  if (search == null || [...search].length > 100 || !statuses.has(status) || !validities.has(validity)
      || !/^\d+$/.test(page ?? '') || !/^\d+$/.test(pageSize ?? '')
      || Number(page) < 1 || Number(page) > 100000 || Number(pageSize) < 1 || Number(pageSize) > 24) {
    const error = new Error('Choose valid quotation filters and page details.');
    error.status = 400;
    throw error;
  }
  return { p_search: search, p_status: status, p_validity: validity, p_page: Number(page), p_page_size: Number(pageSize) };
}

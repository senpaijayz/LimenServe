const PROTECTED_CMS_PAGE_SLUGS = new Set(['home', 'about', 'service-orders']);

export function normalizeCmsPageSlug(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function assertDeletableCmsPageSlug(value) {
  const slug = normalizeCmsPageSlug(value);

  if (!slug) {
    const error = new Error('CMS page slug is required.');
    error.statusCode = 400;
    throw error;
  }

  if (PROTECTED_CMS_PAGE_SLUGS.has(slug)) {
    const error = new Error('Default CMS pages cannot be deleted.');
    error.statusCode = 409;
    throw error;
  }

  return slug;
}

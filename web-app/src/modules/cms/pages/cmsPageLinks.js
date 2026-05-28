const NAV_GROUP_LABELS = {
  primary: 'Top navigation',
  footer_shop: 'Footer shop',
  footer_company: 'Footer company',
};

export const PROTECTED_CMS_PAGE_SLUGS = new Set(['home', 'about', 'service-orders']);
const APP_ROUTE_SLUGS_WITHOUT_CMS_PAGE_CONTENT = new Set([
  'catalog',
  'estimate',
  'login',
  'dashboard',
  'inventory',
  'products',
  'suppliers',
  'pos',
  'quotation',
  'services',
  'reports',
  'users',
  'cms',
  'locator-3d',
]);

function isAllowedAbsoluteUrl(url) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    return false;
  }

  const currentHost = typeof window !== 'undefined' ? window.location?.hostname : '';
  const allowedHosts = new Set([
    currentHost,
    'limen-serve.vercel.app',
    'localhost',
    '127.0.0.1',
  ].filter(Boolean));

  return allowedHosts.has(url.hostname);
}

export function normalizeCmsPageSlugFromHref(href) {
  const rawHref = String(href || '').trim();

  if (!rawHref || rawHref.startsWith('#')) {
    return '';
  }

  if (/^(mailto|tel|sms|javascript):/i.test(rawHref)) {
    return '';
  }

  try {
    const baseUrl = 'https://limen-serve.vercel.app';
    const parsedUrl = new URL(rawHref, baseUrl);

    if (/^https?:\/\//i.test(rawHref) && !isAllowedAbsoluteUrl(parsedUrl)) {
      return '';
    }

    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (segments.length === 0) {
      return 'home';
    }

    if (segments.length > 1) {
      return '';
    }

    return segments[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  } catch {
    return '';
  }
}

export function buildPageLinkOptions(navigationItems = []) {
  const seenSlugs = new Set();
  const options = [];

  for (const item of Array.isArray(navigationItems) ? navigationItems : []) {
    if (item?.status === 'archived' || item?.isVisible === false) {
      continue;
    }

    const slug = normalizeCmsPageSlugFromHref(item?.href);
    if (!slug || seenSlugs.has(slug) || APP_ROUTE_SLUGS_WITHOUT_CMS_PAGE_CONTENT.has(slug)) {
      continue;
    }

    seenSlugs.add(slug);
    const groupLabel = NAV_GROUP_LABELS[item?.groupKey] || NAV_GROUP_LABELS[item?.group_key] || 'Navigation';
    const label = String(item?.label || item?.href || slug).trim();
    const href = String(item?.href || '').trim() || `/${slug}`;

    options.push({
      value: slug,
      label: `${groupLabel} - ${label} (${href})`,
    });
  }

  return options;
}

export function withCurrentPageLinkOption(options = [], slug = '') {
  const normalizedSlug = normalizeCmsPageSlugFromHref(slug) || String(slug || '').trim();

  if (!normalizedSlug || options.some((option) => option.value === normalizedSlug)) {
    return options;
  }

  return [
    ...options,
    {
      value: normalizedSlug,
      label: `Current page - /${normalizedSlug}`,
    },
  ];
}

export function canDeleteCmsPage(page) {
  const slug = String(page?.slug || '').trim().toLowerCase();
  return Boolean(page?.id) && !page?.isLocalDraft && !PROTECTED_CMS_PAGE_SLUGS.has(slug);
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Globe2,
  LoaderCircle,
  Navigation,
  PackageSearch,
  Plus,
  Save,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import CatalogContentCmsPanel from '../catalog-content/CatalogContentCmsPanel';
import {
  buildPageLinkOptions,
  canDeleteCmsPage,
  normalizeCmsPageSlugFromHref,
  withCurrentPageLinkOption,
} from './cmsPageLinks';
import { useToast } from '../../../components/ui/Toast';
import {
  deleteCmsPage,
  getCmsPage,
  getPublicCmsSite,
  listCmsPages,
  saveCmsNavigation,
  saveCmsPage,
  saveCmsSiteSettings,
  uploadCmsImage,
} from '../../../services/cmsApi';

const SECTION_TYPES = [
  { value: 'hero', label: 'Hero banner' },
  { value: 'feature_grid', label: 'Feature cards' },
  { value: 'rich_text', label: 'Text block' },
  { value: 'stats', label: 'Stats row' },
  { value: 'cta', label: 'Call to action' },
  { value: 'faq', label: 'FAQ list' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const SECTION_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'archived', label: 'Archived' },
];

const NAV_GROUP_OPTIONS = [
  { value: 'primary', label: 'Top navigation' },
  { value: 'footer_shop', label: 'Footer shop' },
  { value: 'footer_company', label: 'Footer company' },
];

const DEFAULT_SETTINGS = {
  company_name: '',
  brand_kicker: '',
  brand_title: '',
  logo_url: '',
  primary_phone: '',
  landline: '',
  business_hours: '',
  address: '',
  footer_note: '',
};

function createDefaultSection(sectionType = 'rich_text', index = 0) {
  const sectionKey = `${sectionType}-${Date.now()}-${index + 1}`;
  const baseSection = {
    sectionKey,
    sectionType,
    title: 'New section',
    status: 'draft',
    sortOrder: (index + 1) * 10,
    settings: {},
    visibility: {},
  };

  if (sectionType === 'hero') {
    return {
      ...baseSection,
      title: 'Hero section',
      content: {
        eyebrow: 'Welcome',
        title: 'Main headline',
        subtitle: 'Short supporting message for customers.',
        body: '',
        primaryCta: { label: 'Primary action', href: '/catalog' },
        secondaryCta: { label: 'Secondary action', href: '/estimate' },
        imageUrl: '',
        imageAlt: '',
        imageEyebrow: '',
        imageTitle: '',
        storeLabel: '',
        storeValue: '',
        catalogLabel: '',
        catalogValue: '',
        quotesLabel: '',
        quotesValue: '',
        searchPlaceholder: '',
        searchButtonLabel: '',
        badgeOne: '',
        badgeTwo: '',
        badgeThree: '',
        vehicleTags: '',
      },
    };
  }

  if (sectionType === 'feature_grid') {
    return {
      ...baseSection,
      title: 'Feature cards',
      content: {
        eyebrow: 'Highlights',
        title: 'Section headline',
        subtitle: 'Short supporting copy.',
        items: [
          { title: 'Feature title', description: 'Feature description', href: '', imageUrl: '', imageAlt: '' },
        ],
      },
    };
  }

  if (sectionType === 'stats') {
    return {
      ...baseSection,
      title: 'Stats',
      content: {
        title: 'Stats',
        items: [
          { value: '10+', label: 'Metric label' },
        ],
      },
    };
  }

  if (sectionType === 'cta') {
    return {
      ...baseSection,
      title: 'Call to action',
      content: {
        eyebrow: 'Next step',
        title: 'Invite customers to act',
        subtitle: 'Short supporting copy.',
        phone: '',
        landline: '',
        hours: '',
        address: '',
        primaryCta: { label: 'Get started', href: '/estimate' },
        secondaryCta: { label: 'Browse parts', href: '/catalog' },
      },
    };
  }

  if (sectionType === 'faq') {
    return {
      ...baseSection,
      title: 'Questions',
      content: {
        title: 'Frequently Asked Questions',
        items: [
          { question: 'Question', answer: 'Answer' },
        ],
      },
    };
  }

  return {
    ...baseSection,
    title: 'Text block',
    content: {
      eyebrow: 'About',
      title: 'Section headline',
      body: 'Write public content here.',
    },
  };
}

function createHomePageDraft() {
  return createPageDraft({
    slug: 'home',
    title: 'Homepage',
    pageType: 'landing',
    templateKey: 'public_home',
    status: 'published',
    seo: {
      title: 'Limen Auto Parts Center',
      description: 'Search genuine and aftermarket auto parts from Limen Auto Parts Center.',
      keywords: 'auto parts, Mitsubishi, Pasay, Limen',
    },
    sections: [
      {
        ...createDefaultSection('hero', 0),
        sectionKey: 'home-hero',
        title: 'Homepage Hero',
        status: 'published',
        content: {
          eyebrow: 'Limen Autoparts Center',
          title: 'Genuine and aftermarket auto parts customers can trust.',
          subtitle: 'Search by part name, part number, or vehicle model and move straight into a cleaner quotation flow backed by a real auto parts store in Pasay City.',
          primaryCta: { label: 'Shop Parts', href: '/catalog' },
          secondaryCta: { label: 'Request a Quote', href: '/estimate' },
          imageUrl: '',
          imageAlt: 'Limen Auto Parts Center storefront',
          imageEyebrow: 'Pasay City flagship store',
          imageTitle: 'Real counter service, fitment checks, and faster quote turnaround for walk-in and online inquiries.',
          storeLabel: 'Store',
          storeValue: 'Real local support',
          catalogLabel: 'Catalog',
          catalogValue: 'Search by part or vehicle',
          quotesLabel: 'Quotes',
          quotesValue: 'Fast response flow',
          badgeOne: 'Genuine Parts',
          badgeTwo: 'Fast Delivery in PH',
          badgeThree: 'Search by Vehicle',
          vehicleTags: 'Montero Sport, Triton, Xforce, Xpander, Mirage, L300',
          searchPlaceholder: 'Search by part name, vehicle make/model/year, or part number',
          searchButtonLabel: 'Search Parts',
        },
      },
      {
        ...createDefaultSection('feature_grid', 1),
        sectionKey: 'home-features',
        title: 'Shop Categories',
        status: 'published',
        content: {
          eyebrow: 'Shop by Category',
          title: 'Browse fast-moving auto parts categories',
          subtitle: 'Start with the part family customers usually ask for, then narrow by Mitsubishi model or exact part number inside the catalog.',
          ctaLabel: 'View full catalog',
          ctaHref: '/catalog',
          cardCtaLabel: 'Browse category',
          items: [
            { title: 'Engine Parts', description: 'Filters, timing components, gaskets, and cooling parts.', href: '/catalog?q=engine' },
            { title: 'Brakes', description: 'Pads, rotors, brake hardware, and wear items for daily safety.', href: '/catalog?q=brake' },
            { title: 'Suspension', description: 'Shocks, bushings, steering links, and ride-control parts.', href: '/catalog?q=suspension' },
            { title: 'Electrical', description: 'Sensors, charging parts, relays, and wiring support.', href: '/catalog?q=electrical' },
            { title: 'Body Parts', description: 'Panels, lamps, trims, mirrors, and exterior replacement parts.', href: '/catalog?q=body parts' },
            { title: 'Maintenance', description: 'Tune-up items and service kits for regular preventive work.', href: '/catalog?q=maintenance' },
          ],
        },
      },
      {
        ...createDefaultSection('feature_grid', 2),
        sectionKey: 'home-best-sellers',
        title: 'Best Sellers',
        status: 'published',
        content: {
          eyebrow: 'Best Sellers',
          title: 'Featured parts anchored to real Mitsubishi vehicle lines',
          primaryActionLabel: 'Add to Quote',
          secondaryActionLabel: 'Quick View',
          items: [
            { title: 'Montero Sport Oil Filter', description: 'Best for PMS and daily service visits', eyebrow: 'Montero Sport', badge: 'Best Seller', partNo: 'ME-013307', price: 'PHP 1,245', href: '/catalog?q=Montero%20Sport%20Oil%20Filter', imageUrl: '', imageAlt: 'Montero Sport Oil Filter' },
            { title: 'Triton Front Brake Pads', description: 'Fast-moving pickup wear-item replacement', eyebrow: 'Triton', badge: 'Best Seller', partNo: 'MB-699200', price: 'PHP 3,980', href: '/catalog?q=Triton%20Front%20Brake%20Pads', imageUrl: '', imageAlt: 'Triton Front Brake Pads' },
            { title: 'Xforce Air Filter', description: 'Clean intake maintenance for newer compact SUVs', eyebrow: 'Xforce', badge: 'Best Seller', partNo: '1500A760', price: 'PHP 1,760', href: '/catalog?q=Xforce%20Air%20Filter', imageUrl: '', imageAlt: 'Xforce Air Filter' },
            { title: 'Xpander Cabin Filter Set', description: 'Popular MPV maintenance item for family-use vehicles', eyebrow: 'Xpander', badge: 'Best Seller', partNo: '7803A167', price: 'PHP 2,140', href: '/catalog?q=Xpander%20Cabin%20Filter%20Set', imageUrl: '', imageAlt: 'Xpander Cabin Filter Set' },
          ],
        },
      },
      {
        ...createDefaultSection('feature_grid', 3),
        sectionKey: 'home-trust-signals',
        title: 'Why customers trust Limen',
        status: 'published',
        content: {
          eyebrow: 'Why customers trust Limen',
          title: 'Built to look credible before the customer even asks for a quote.',
          subtitle: 'Customers shopping for vehicle parts need clarity first.',
          body: 'Fast responses, correct fitment help, and a better quote process.',
          kicker: 'Why customers buy here',
          summary: 'Reliable parts, visible pricing, and store-backed support.',
          badgeLabel: 'Serious fitment and quotation support',
          trustLabel: 'Trust signals',
          trustTags: 'Genuine Parts, Secure Payments, Local Store Pickup',
          items: [
            { title: 'Genuine Parts Available', description: 'OEM-focused inventory for Mitsubishi and other popular vehicle lines.' },
            { title: 'Fast Delivery in the Philippines', description: 'Quick quotation support and local fulfillment for urgent repair needs.' },
            { title: 'Trusted Local Store', description: 'Real in-store assistance in Pasay City for fitment checks and customer support.' },
          ],
        },
      },
      {
        ...createDefaultSection('stats', 4),
        sectionKey: 'home-stats',
        title: 'Customer Confidence Stats',
        status: 'published',
        content: {
          title: 'Customer confidence',
          items: [
            { value: 'OEM', label: 'Genuine parts support' },
            { value: 'PH', label: 'Local delivery and pickup' },
            { value: 'Real', label: 'Store-based customer support' },
          ],
        },
      },
      {
        ...createDefaultSection('cta', 5),
        sectionKey: 'home-cta',
        title: 'Homepage CTA',
        status: 'published',
        content: {
          eyebrow: 'Ready to order',
          title: 'Search parts now or move straight into a quote request.',
          primaryCta: { label: 'Browse Catalog', href: '/catalog' },
          secondaryCta: { label: 'Request a Quote', href: '/estimate' },
        },
      },
    ],
  });
}

function createAboutPageDraft() {
  return createPageDraft({
    slug: 'about',
    title: 'About Limen',
    pageType: 'landing',
    templateKey: 'public_about',
    status: 'published',
    seo: {
      title: 'About Limen Auto Parts Center',
      description: 'Learn about Limen Auto Parts Center and its digital service workflow.',
      keywords: 'about Limen, Mitsubishi parts, Pasay auto parts',
    },
    sections: [
      {
        ...createDefaultSection('hero', 0),
        sectionKey: 'about-hero',
        title: 'About Hero',
        status: 'published',
        content: {
          eyebrow: 'About',
          title: 'Limen Auto Parts Center',
          subtitle: 'A family-owned auto parts business in Pasay City that has been serving customers for 13 years with genuine Mitsubishi parts, dependable service, and a more modern way to manage inventory and quotations through LimenServe.',
        },
      },
      {
        ...createDefaultSection('rich_text', 1),
        sectionKey: 'about-story',
        title: 'Our Story & Operations',
        status: 'published',
        content: {
          eyebrow: 'About',
          title: 'Our Story & Operations',
          body: 'Limen Auto Parts Center is an established family-owned auto parts retail shop located along EDSA in Pasay City, Metro Manila.\n\nThe shop operates in a two-floor commercial space, with the first floor serving as the main sales area and the second floor serving as the stockroom.\n\nThrough LimenServe, the business is transitioning from manual, paper-based processes to a more organized digital workflow.',
        },
      },
      {
        ...createDefaultSection('stats', 2),
        sectionKey: 'about-stats',
        title: 'Business Snapshot',
        status: 'published',
        content: {
          title: 'Business Snapshot',
          items: [
            { value: '13 Years', label: 'In Service' },
            { value: 'Pasay City', label: 'Metro Manila' },
            { value: '2 Floors', label: 'Sales and Stockroom' },
            { value: 'Family-Owned', label: 'Local Business' },
          ],
        },
      },
      {
        ...createDefaultSection('feature_grid', 3),
        sectionKey: 'about-pillars',
        title: 'What We Stand For',
        status: 'published',
        content: {
          title: 'What We Stand For',
          subtitle: 'The values that shape how Limen Auto Parts Center serves customers and manages daily operations.',
          items: [
            { title: 'Genuine Mitsubishi Parts', description: 'The business focuses on supplying genuine Mitsubishi parts so customers can rely on accurate fitment, dependable quality, and trusted replacement components.' },
            { title: 'Faster and More Organized Service', description: 'LimenServe is designed to reduce delays in stock checking, quotation preparation, and transaction handling.' },
            { title: 'Digital Modernization', description: 'The system supports a shift from paper-based records to digital inventory, quotation, service-order, and stockroom management.' },
          ],
        },
      },
      {
        ...createDefaultSection('rich_text', 4),
        sectionKey: 'about-mechanics',
        title: 'Mechanics Section',
        status: 'published',
        content: {
          title: 'Meet Our Mechanics',
          body: 'Published mechanic profiles are loaded from the mechanics database.',
          loadingText: 'Loading mechanics from the database...',
          emptyText: 'No public mechanic profiles have been published yet.',
          teamLabel: 'Limen service team',
          fallbackBio: 'Experienced Mitsubishi service technician.',
          scheduleLabel: 'Schedule:',
          dateLabel: 'Available date:',
          dateFallback: 'General availability',
          contactLabel: 'Contact:',
          contactFallback: 'Contact shop for assignment',
        },
      },
      {
        ...createDefaultSection('cta', 5),
        sectionKey: 'about-location',
        title: 'Visit the Facility',
        status: 'published',
        content: {
          title: 'Visit the Facility',
          address: '1308, 264 Epifanio de los Santos Ave, Pasay City, 1308 Metro Manila',
          mapUrl: 'https://maps.google.com/maps?q=Limen%20Auto%20Parts%20Center,%201308,%20264%20Epifanio%20de%20los%20Santos%20Ave,%20Pasay%20City,%201308%20Metro%20Manila&t=&z=16&ie=UTF8&iwloc=&output=embed',
        },
      },
    ],
  });
}

function createServiceOrdersPageDraft() {
  return createPageDraft({
    slug: 'service-orders',
    title: 'Service Orders',
    pageType: 'landing',
    templateKey: 'public_service_orders',
    status: 'published',
    seo: {
      title: 'Service Orders',
      description: 'Learn how Limen handles service intake, estimates, service-order tracking, and release.',
      keywords: 'service orders, auto service, Limen',
    },
    sections: [
      {
        ...createDefaultSection('hero', 0),
        sectionKey: 'service-orders-hero',
        title: 'Service Orders Hero',
        status: 'published',
        content: {
          eyebrow: 'Service Order Workflow',
          title: 'Service Orders',
          subtitle: 'Handled with structure and clarity',
          body: 'LimenServe supports service-order handling for repair and installation requests, from customer intake and cost estimation to status tracking and completion.',
        },
      },
      {
        ...createDefaultSection('feature_grid', 1),
        sectionKey: 'service-orders-process',
        title: 'Service Process',
        status: 'published',
        content: {
          title: 'How the service-order process works',
          subtitle: "Aligned with the system's service management module",
          stepLabel: 'Step',
          items: [
            { title: 'Initial Assessment', description: 'Bring your vehicle concerns to our team so we can review the issue, required parts, and recommended service scope.' },
            { title: 'Estimate and Approval', description: 'We prepare a service estimate covering parts and labor before work proceeds.' },
            { title: 'Service Order Tracking', description: 'Once approved, the request is recorded as a service order and monitored through active shop status updates.' },
            { title: 'Completion and Release', description: 'Completed work is finalized, documented, and prepared for customer release.' },
          ],
        },
      },
      {
        ...createDefaultSection('stats', 2),
        sectionKey: 'service-orders-support',
        title: 'Service Support Items',
        status: 'published',
        content: {
          title: 'Included in service handling',
          items: [
            { label: 'General repair requests and service intake' },
            { label: 'Parts replacement and installation support' },
            { label: 'Labor and parts estimate preparation' },
            { label: 'Service order status handling from intake to completion' },
          ],
        },
      },
      {
        ...createDefaultSection('cta', 3),
        sectionKey: 'service-orders-assistance',
        title: 'Request Assistance',
        status: 'published',
        content: {
          eyebrow: 'Contact',
          title: 'Request assistance',
          subtitle: 'For service concerns, visit the shop or contact the team so your request can be assessed and recorded properly.',
          phone: '(0915) 522 5629',
          landline: 'Landline: 02 8551 3518',
          hours: 'Mon-Sat: 8:00 AM-5:00 PM | Sun: 8:00 AM-12:00 PM',
          address: '1308, 264 Epifanio de los Santos Ave, Pasay City, Metro Manila',
          primaryCta: { label: 'Get Estimate', href: '/estimate' },
          secondaryCta: { label: 'View Parts', href: '/catalog' },
        },
      },
    ],
  });
}

function ensureEditablePublicPages(pages = []) {
  const requiredPages = [
    { slug: 'home', title: 'Homepage', sectionCount: 6 },
    { slug: 'about', title: 'About Limen', sectionCount: 6 },
    { slug: 'service-orders', title: 'Service Orders', sectionCount: 4 },
  ];
  const rows = [...pages];

  requiredPages.forEach((requiredPage) => {
    if (!rows.some((page) => page.slug === requiredPage.slug)) {
      rows.push({
        id: `draft-${requiredPage.slug}`,
        slug: requiredPage.slug,
        title: requiredPage.title,
        status: 'published',
        sectionCount: requiredPage.sectionCount,
        isLocalDraft: true,
      });
    }
  });

  return rows;
}

function defaultDraftForSlug(slug) {
  if (slug === 'home') return createHomePageDraft();
  if (slug === 'about') return createAboutPageDraft();
  if (slug === 'service-orders') return createServiceOrdersPageDraft();
  return null;
}

function mergeRequiredSections(page) {
  const defaultPage = defaultDraftForSlug(page?.slug);
  if (!defaultPage) {
    return page;
  }

  const existingSections = Array.isArray(page.sections) ? page.sections : [];
  const existingKeys = new Set(existingSections.map((section) => section.sectionKey || section.section_key));
  const missingSections = defaultPage.sections.filter((section) => !existingKeys.has(section.sectionKey));

  return {
    ...defaultPage,
    ...page,
    seo: {
      ...defaultPage.seo,
      ...(page.seo ?? {}),
    },
    sections: [...existingSections, ...missingSections].sort((a, b) => Number(a.sortOrder ?? a.sort_order ?? 0) - Number(b.sortOrder ?? b.sort_order ?? 0)),
  };
}

function createPageDraft(overrides = {}) {
  return {
    slug: '',
    title: '',
    pageType: 'landing',
    templateKey: 'default',
    status: 'draft',
    seo: {
      title: '',
      description: '',
      keywords: '',
    },
    metadata: {},
    sections: [],
    ...overrides,
  };
}

function normalizeStringValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function normalizeSettings(settings = {}) {
  return Object.keys(DEFAULT_SETTINGS).reduce((result, key) => {
    result[key] = normalizeStringValue(settings?.[key]);
    return result;
  }, {});
}

function normalizePage(page = {}) {
  const seo = page.seo && typeof page.seo === 'object' ? page.seo : {};
  return createPageDraft({
    ...page,
    seo: {
      ...seo,
      title: normalizeStringValue(seo.title),
      description: normalizeStringValue(seo.description),
      keywords: Array.isArray(seo.keywords) ? seo.keywords.join(', ') : normalizeStringValue(seo.keywords),
    },
    sections: Array.isArray(page.sections) ? page.sections.map((section, index) => ({
      ...createDefaultSection(section.sectionType || section.section_type || 'rich_text', index),
      ...section,
      sectionType: section.sectionType || section.section_type || 'rich_text',
      sectionKey: section.sectionKey || section.section_key || `section-${index + 1}`,
      sortOrder: Number(section.sortOrder ?? section.sort_order ?? (index + 1) * 10),
      content: section.content && typeof section.content === 'object' ? section.content : {},
      settings: section.settings && typeof section.settings === 'object' ? section.settings : {},
      visibility: section.visibility && typeof section.visibility === 'object' ? section.visibility : {},
    })) : [],
  });
}

function normalizeNavigationItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: item.id || '',
    label: normalizeStringValue(item.label),
    href: normalizeStringValue(item.href || '/'),
    groupKey: item.groupKey || item.group_key || 'primary',
    sortOrder: Number(item.sortOrder ?? item.sort_order ?? (index + 1) * 10),
    isVisible: item.isVisible ?? item.is_visible ?? true,
    opensNewTab: item.opensNewTab ?? item.opens_new_tab ?? false,
    status: item.status || 'published',
    metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
  }));
}

function makeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBeforeSave(pageDraft) {
  const normalizedSlug = makeSlug(pageDraft.slug || pageDraft.title);

  if (!normalizedSlug) {
    throw new Error('Page slug is required.');
  }

  if (!String(pageDraft.title || '').trim()) {
    throw new Error('Page title is required.');
  }

  return {
    ...pageDraft,
    slug: normalizedSlug,
    title: String(pageDraft.title || '').trim(),
    seo: {
      ...pageDraft.seo,
      title: normalizeStringValue(pageDraft.seo?.title),
      description: normalizeStringValue(pageDraft.seo?.description),
      keywords: normalizeStringValue(pageDraft.seo?.keywords),
    },
    sections: (pageDraft.sections ?? []).map((section, index) => ({
      ...section,
      sectionKey: makeSlug(section.sectionKey || section.title || `${section.sectionType}-${index + 1}`),
      title: normalizeStringValue(section.title),
      sortOrder: toInteger(section.sortOrder, (index + 1) * 10),
      content: section.content ?? {},
      settings: section.settings ?? {},
      visibility: section.visibility ?? {},
    })),
  };
}

function buildCmsPageSummary(page = {}) {
  return {
    id: page.id || `draft-${page.slug}`,
    slug: page.slug,
    title: page.title || page.slug,
    status: page.status || 'draft',
    sectionCount: Array.isArray(page.sections) ? page.sections.length : Number(page.sectionCount ?? page.section_count ?? 0),
    updatedAt: page.updatedAt || page.updated_at || new Date().toISOString(),
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read selected image.'));
    reader.readAsDataURL(file);
  });
}

function getImageFileName(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  const withoutQuery = rawValue.split('?')[0];
  const lastSegment = withoutQuery.split('/').filter(Boolean).pop() || withoutQuery;

  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

function StatusBadge({ status }) {
  const styles = {
    published: 'bg-accent-success/10 text-accent-success',
    draft: 'bg-accent-warning/10 text-accent-warning',
    hidden: 'bg-primary-100 text-primary-500',
    archived: 'bg-primary-100 text-primary-500',
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${styles[status] || styles.draft}`}>
      {status || 'draft'}
    </span>
  );
}

function Field({ label, value, onChange, placeholder = '', helper = '', type = 'text' }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-900 outline-none transition focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10"
      />
      {helper && <span className="mt-2 block text-xs text-primary-500">{helper}</span>}
    </label>
  );
}

function ImageUploadField({
  label,
  value,
  onChange,
  onUpload,
  uploadKey,
  uploadingKey,
  helper = 'Upload JPG, PNG, WEBP, or SVG up to 5MB.',
}) {
  const isUploading = uploadingKey === uploadKey;
  const fileName = getImageFileName(value);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    await onUpload(file, uploadKey, onChange);
  };

  return (
    <div className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4">
      <div className="grid gap-4 md:grid-cols-[140px_1fr]">
        <div className="flex h-32 items-center justify-center overflow-hidden rounded-2xl border border-primary-200 bg-white">
          {value ? (
            <img src={value} alt={label} className="h-full w-full object-contain p-2" loading="lazy" />
          ) : (
            <div className="px-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-primary-400">
              No image
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">{label}</span>
            <input
              type="text"
              value={fileName}
              readOnly
              placeholder="No image selected"
              className="mt-2 w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-900 outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-primary-200 bg-white px-4 text-sm font-semibold text-accent-primary shadow-sm transition hover:bg-primary-100 ${isUploading ? 'pointer-events-none opacity-70' : ''}`}>
              {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isUploading ? 'Uploading...' : 'Upload image'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={handleFileChange}
                disabled={isUploading}
              />
            </label>
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-accent-danger hover:bg-red-100"
              >
                Clear image
              </button>
            )}
          </div>
          <p className="text-xs leading-5 text-primary-500">{helper}</p>
        </div>
      </div>
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder = '', rows = 4, helper = '' }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">{label}</span>
      <textarea
        value={value ?? ''}
        placeholder={placeholder}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm leading-6 text-primary-900 outline-none transition focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10"
      />
      {helper && <span className="mt-2 block text-xs text-primary-500">{helper}</span>}
    </label>
  );
}

function SelectField({ label, value, onChange, options, helper = '' }) {
  const hasCurrentOption = options.some((option) => option.value === (value ?? ''));

  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-900 outline-none transition focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10"
      >
        {!hasCurrentOption && <option value="">{value ? `Current value: ${value}` : 'Choose an option'}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {helper && <span className="mt-2 block text-xs text-primary-500">{helper}</span>}
    </label>
  );
}

function CheckboxField({ label, checked, onChange }) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm font-semibold text-primary-700">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-primary-300 text-accent-primary focus:ring-accent-primary"
      />
      {label}
    </label>
  );
}

function RepeatableRows({ title, items, emptyItem, renderItem, onChange }) {
  const rows = Array.isArray(items) ? items : [];
  const updateRow = (index, patch) => {
    onChange(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const removeRow = (index) => {
    onChange(rows.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="text-sm font-bold text-primary-950">{title}</h4>
        <button
          type="button"
          onClick={() => onChange([...rows, { ...emptyItem }])}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2 text-xs font-bold text-accent-primary hover:bg-primary-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Add row
        </button>
      </div>
      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-primary-300 bg-white p-4 text-sm text-primary-500">No rows yet.</div>
        ) : rows.map((item, index) => (
          <div key={index} className="rounded-2xl border border-primary-200 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="grid gap-3 md:grid-cols-2">
                {renderItem(item, (patch) => updateRow(index, patch), index)}
              </div>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 text-accent-danger hover:bg-red-100"
                aria-label="Remove row"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionContentEditor({ section, onContentChange, onImageUpload, uploadingKey }) {
  const content = section.content && typeof section.content === 'object' ? section.content : {};
  const sectionKey = section.sectionKey || section.section_key || '';
  const isHomeFeatures = sectionKey === 'home-features';
  const isBestSellers = sectionKey === 'home-best-sellers';
  const isTrustSection = sectionKey === 'home-trust-signals';
  const isServiceProcess = sectionKey === 'service-orders-process';
  const isMechanicsSection = sectionKey === 'about-mechanics';
  const updateContent = (patch) => onContentChange({ ...content, ...patch });
  const updatePrimaryCta = (patch) => updateContent({ primaryCta: { ...(content.primaryCta ?? {}), ...patch } });
  const updateSecondaryCta = (patch) => updateContent({ secondaryCta: { ...(content.secondaryCta ?? {}), ...patch } });

  if (section.sectionType === 'hero') {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Top text" value={content.eyebrow} onChange={(value) => updateContent({ eyebrow: value })} />
        </div>
        <Field label="Headline" value={content.title} onChange={(value) => updateContent({ title: value })} />
        <TextAreaField label="Subtitle" value={content.subtitle} rows={3} onChange={(value) => updateContent({ subtitle: value })} />
        <TextAreaField label="Description" value={content.body} rows={3} onChange={(value) => updateContent({ body: value })} />
        <ImageUploadField
          label="Hero image"
          value={content.imageUrl}
          onChange={(value) => updateContent({ imageUrl: value })}
          onUpload={onImageUpload}
          uploadKey={`section-${section.sectionKey || section.id || 'hero'}-image`}
          uploadingKey={uploadingKey}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Main button text" value={content.primaryCta?.label} onChange={(value) => updatePrimaryCta({ label: value })} />
          <Field label="Main button link" value={content.primaryCta?.href} onChange={(value) => updatePrimaryCta({ href: value })} />
          <Field label="Second button text" value={content.secondaryCta?.label} onChange={(value) => updateSecondaryCta({ label: value })} />
          <Field label="Second button link" value={content.secondaryCta?.href} onChange={(value) => updateSecondaryCta({ href: value })} />
          <Field label="Image alt text" value={content.imageAlt} onChange={(value) => updateContent({ imageAlt: value })} />
        </div>
        <div className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4">
          <h4 className="mb-3 text-sm font-bold text-primary-950">Image Text</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Top text" value={content.imageEyebrow} onChange={(value) => updateContent({ imageEyebrow: value })} />
            <Field label="Headline" value={content.imageTitle} onChange={(value) => updateContent({ imageTitle: value })} />
            <Field label="Info 1 title" value={content.storeLabel} onChange={(value) => updateContent({ storeLabel: value })} />
            <Field label="Info 1 text" value={content.storeValue} onChange={(value) => updateContent({ storeValue: value })} />
            <Field label="Info 2 title" value={content.catalogLabel} onChange={(value) => updateContent({ catalogLabel: value })} />
            <Field label="Info 2 text" value={content.catalogValue} onChange={(value) => updateContent({ catalogValue: value })} />
            <Field label="Info 3 title" value={content.quotesLabel} onChange={(value) => updateContent({ quotesLabel: value })} />
            <Field label="Info 3 text" value={content.quotesValue} onChange={(value) => updateContent({ quotesValue: value })} />
          </div>
        </div>
        <div className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4">
          <h4 className="mb-3 text-sm font-bold text-primary-950">Homepage Search And Badges</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Badge 1" value={content.badgeOne} onChange={(value) => updateContent({ badgeOne: value })} />
            <Field label="Badge 2" value={content.badgeTwo} onChange={(value) => updateContent({ badgeTwo: value })} />
            <Field label="Badge 3" value={content.badgeThree} onChange={(value) => updateContent({ badgeThree: value })} />
            <Field label="Vehicle chips" value={content.vehicleTags} onChange={(value) => updateContent({ vehicleTags: value })} helper="Comma-separated list, e.g. Montero Sport, Triton, Xforce." />
            <Field label="Search placeholder" value={content.searchPlaceholder} onChange={(value) => updateContent({ searchPlaceholder: value })} />
            <Field label="Search button label" value={content.searchButtonLabel} onChange={(value) => updateContent({ searchButtonLabel: value })} />
          </div>
        </div>
      </div>
    );
  }

  if (section.sectionType === 'feature_grid') {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Top text" value={content.eyebrow} onChange={(value) => updateContent({ eyebrow: value })} />
          <Field label="Headline" value={content.title} onChange={(value) => updateContent({ title: value })} />
          {isHomeFeatures && <Field label="Button text" value={content.ctaLabel} onChange={(value) => updateContent({ ctaLabel: value })} />}
          {isHomeFeatures && <Field label="Button link" value={content.ctaHref} onChange={(value) => updateContent({ ctaHref: value })} />}
          {isHomeFeatures && <Field label="Card button text" value={content.cardCtaLabel} onChange={(value) => updateContent({ cardCtaLabel: value })} />}
          {isBestSellers && <Field label="Main button text" value={content.primaryActionLabel} onChange={(value) => updateContent({ primaryActionLabel: value })} />}
          {isBestSellers && <Field label="Second button text" value={content.secondaryActionLabel} onChange={(value) => updateContent({ secondaryActionLabel: value })} />}
          {isServiceProcess && <Field label="Step text" value={content.stepLabel} onChange={(value) => updateContent({ stepLabel: value })} />}
          {isTrustSection && <Field label="Top panel text" value={content.kicker} onChange={(value) => updateContent({ kicker: value })} />}
          {isTrustSection && <Field label="Highlight badge" value={content.badgeLabel} onChange={(value) => updateContent({ badgeLabel: value })} />}
          {isTrustSection && <Field label="Trust heading" value={content.trustLabel} onChange={(value) => updateContent({ trustLabel: value })} />}
          {isTrustSection && <Field label="Trust badges" value={content.trustTags} onChange={(value) => updateContent({ trustTags: value })} helper="Comma-separated list." />}
        </div>
        <TextAreaField label="Subtitle" value={content.subtitle} rows={3} onChange={(value) => updateContent({ subtitle: value })} />
        {isTrustSection && <TextAreaField label="Top panel headline" value={content.summary} rows={2} onChange={(value) => updateContent({ summary: value })} />}
        {isTrustSection && <TextAreaField label="Quote text" value={content.body} rows={3} onChange={(value) => updateContent({ body: value })} />}
        <RepeatableRows
          title={isBestSellers ? 'Featured products' : isServiceProcess ? 'Service steps' : 'Cards'}
          items={content.items}
          emptyItem={{ title: '', description: '', href: '', imageUrl: '', imageAlt: '' }}
          onChange={(items) => updateContent({ items })}
          renderItem={(item, updateItem, itemIndex) => (
            <>
              {isBestSellers && <Field label="Vehicle" value={item.eyebrow} onChange={(value) => updateItem({ eyebrow: value })} placeholder="Montero Sport" />}
              {isBestSellers && <Field label="Badge" value={item.badge} onChange={(value) => updateItem({ badge: value })} placeholder="Best Seller" />}
              <Field label="Title" value={item.title} onChange={(value) => updateItem({ title: value })} />
              <Field label="Link" value={item.href} onChange={(value) => updateItem({ href: value })} placeholder="/catalog" />
              {isBestSellers && <Field label="Part number" value={item.partNo} onChange={(value) => updateItem({ partNo: value })} placeholder="ME-013307" />}
              {isBestSellers && <Field label="Price" value={item.price} onChange={(value) => updateItem({ price: value })} placeholder="PHP 1,245" />}
              {isBestSellers && <Field label="Image alt text" value={item.imageAlt} onChange={(value) => updateItem({ imageAlt: value })} />}
              <TextAreaField label="Description" value={item.description} rows={2} onChange={(value) => updateItem({ description: value })} />
              {isBestSellers && <div className="md:col-span-2">
                <ImageUploadField
                  label="Card image"
                  value={item.imageUrl}
                  onChange={(value) => updateItem({ imageUrl: value })}
                  onUpload={onImageUpload}
                  uploadKey={`section-${section.sectionKey || section.id || 'feature'}-item-${itemIndex}-image`}
                  uploadingKey={uploadingKey}
                  helper="Optional. Use this for Best Sellers, service visuals, or any public card that needs an editable image."
                />
              </div>}
            </>
          )}
        />
      </div>
    );
  }

  if (section.sectionType === 'stats') {
    return (
      <div className="space-y-4">
        <Field label="Section title" value={content.title} onChange={(value) => updateContent({ title: value })} />
        <RepeatableRows
          title="Stats or list items"
          items={content.items}
          emptyItem={{ value: '', label: '' }}
          onChange={(items) => updateContent({ items })}
          renderItem={(item, updateItem) => (
            <>
              <Field label="Value" value={item.value} onChange={(value) => updateItem({ value })} placeholder="13 Years" />
              <Field label="Label" value={item.label} onChange={(value) => updateItem({ label: value })} placeholder="In Service or service support item" />
            </>
          )}
        />
      </div>
    );
  }

  if (section.sectionType === 'cta') {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Top text" value={content.eyebrow} onChange={(value) => updateContent({ eyebrow: value })} />
          <Field label="Headline" value={content.title} onChange={(value) => updateContent({ title: value })} />
        </div>
        <TextAreaField label="Subtitle" value={content.subtitle} rows={3} onChange={(value) => updateContent({ subtitle: value })} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Phone" value={content.phone} onChange={(value) => updateContent({ phone: value })} />
          <Field label="Landline" value={content.landline} onChange={(value) => updateContent({ landline: value })} />
          <Field label="Business hours" value={content.hours} onChange={(value) => updateContent({ hours: value })} />
          <Field label="Address" value={content.address} onChange={(value) => updateContent({ address: value })} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Main button text" value={content.primaryCta?.label} onChange={(value) => updatePrimaryCta({ label: value })} />
          <Field label="Main button link" value={content.primaryCta?.href} onChange={(value) => updatePrimaryCta({ href: value })} />
          <Field label="Second button text" value={content.secondaryCta?.label} onChange={(value) => updateSecondaryCta({ label: value })} />
          <Field label="Second button link" value={content.secondaryCta?.href} onChange={(value) => updateSecondaryCta({ href: value })} />
        </div>
      </div>
    );
  }

  if (section.sectionType === 'faq') {
    return (
      <div className="space-y-4">
        <Field label="FAQ heading" value={content.title} onChange={(value) => updateContent({ title: value })} />
        <RepeatableRows
          title="Questions"
          items={content.items}
          emptyItem={{ question: '', answer: '' }}
          onChange={(items) => updateContent({ items })}
          renderItem={(item, updateItem) => (
            <>
              <Field label="Question" value={item.question} onChange={(value) => updateItem({ question: value })} />
              <TextAreaField label="Answer" value={item.answer} rows={2} onChange={(value) => updateItem({ answer: value })} />
            </>
          )}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Top text" value={content.eyebrow} onChange={(value) => updateContent({ eyebrow: value })} />
        <Field label="Headline" value={content.title} onChange={(value) => updateContent({ title: value })} />
        {isMechanicsSection && <Field label="Loading message" value={content.loadingText} onChange={(value) => updateContent({ loadingText: value })} />}
        {isMechanicsSection && <Field label="No mechanics message" value={content.emptyText} onChange={(value) => updateContent({ emptyText: value })} />}
        {isMechanicsSection && <Field label="Team text" value={content.teamLabel} onChange={(value) => updateContent({ teamLabel: value })} />}
      </div>
      <TextAreaField label="Body text" value={content.body} rows={6} onChange={(value) => updateContent({ body: value })} />
    </div>
  );
}

function SectionEditor({ section, index, total, onChange, onMove, onRemove, onImageUpload, uploadingKey }) {
  const updateSection = (patch) => onChange({ ...section, ...patch });

  return (
    <div className="overflow-hidden rounded-3xl border border-primary-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-primary-200 bg-primary-50/70 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary-950 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white">Section {index + 1}</span>
            <StatusBadge status={section.status} />
          </div>
          <h3 className="mt-2 truncate text-lg font-display font-semibold text-primary-950">{section.title || 'Untitled section'}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-primary-200 bg-white px-3 text-primary-600 disabled:opacity-40">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-primary-200 bg-white px-3 text-primary-600 disabled:opacity-40">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={onRemove} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-accent-danger hover:bg-red-100">
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        </div>
      </div>

      <div className="space-y-5 p-4 lg:p-5">
        <div className="max-w-sm">
          <SelectField label="Visibility" value={section.status} options={SECTION_STATUS_OPTIONS} onChange={(value) => updateSection({ status: value })} />
        </div>
        <SectionContentEditor
          section={section}
          onContentChange={(content) => updateSection({ content })}
          onImageUpload={onImageUpload}
          uploadingKey={uploadingKey}
        />
      </div>
    </div>
  );
}

const tabs = [
  { id: 'pages', label: 'Pages', icon: FileText },
  { id: 'catalog', label: 'Catalog Content', icon: PackageSearch },
  { id: 'settings', label: 'Site Settings', icon: Settings },
  { id: 'navigation', label: 'Navigation', icon: Navigation },
];

export default function CmsAdmin() {
  const { success, error: showError } = useToast();
  const skipNextPageLoadSlugRef = useRef('');
  const [activeTab, setActiveTab] = useState('pages');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState('');
  const [pageLoading, setPageLoading] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState('');
  const [uploadingKey, setUploadingKey] = useState('');
  const [pages, setPages] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [activeSectionKey, setActiveSectionKey] = useState('');
  const [pageDraft, setPageDraft] = useState(createPageDraft());
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_SETTINGS);
  const [navigationDraft, setNavigationDraft] = useState([]);

  const selectedPage = useMemo(
    () => pages.find((page) => page.slug === selectedSlug),
    [pages, selectedSlug],
  );
  const pageLinkOptions = useMemo(
    () => withCurrentPageLinkOption(buildPageLinkOptions(navigationDraft), pageDraft.slug),
    [navigationDraft, pageDraft.slug],
  );
  const activeSectionIndex = useMemo(() => {
    const sections = pageDraft.sections ?? [];
    if (sections.length === 0) return -1;

    const foundIndex = sections.findIndex((section) => (section.sectionKey || section.id) === activeSectionKey);
    return foundIndex >= 0 ? foundIndex : 0;
  }, [activeSectionKey, pageDraft.sections]);
  const activeSection = activeSectionIndex >= 0 ? pageDraft.sections[activeSectionIndex] : null;

  useEffect(() => {
    let active = true;

    async function loadCms() {
      setLoading(true);
      try {
        const [pageRows, site] = await Promise.all([
          listCmsPages(),
          getPublicCmsSite().catch(() => ({ settings: {}, navigation: [] })),
        ]);

        if (!active) {
          return;
        }

        const editablePages = ensureEditablePublicPages(pageRows);
        setPages(editablePages);
        setSettingsDraft(normalizeSettings(site?.settings ?? {}));
        setNavigationDraft(normalizeNavigationItems(site?.navigation ?? []));
        setSelectedSlug(editablePages[0]?.slug || '');
      } catch (loadError) {
        if (active) {
          showError(loadError.message || 'Failed to load CMS content.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadCms();

    return () => {
      active = false;
    };
  }, [showError]);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      if (!selectedSlug) {
        return;
      }

      if (skipNextPageLoadSlugRef.current === selectedSlug) {
        skipNextPageLoadSlugRef.current = '';
        return;
      }

      setPageLoading(true);
      try {
        const page = await getCmsPage(selectedSlug);
        if (!active || !page) {
          return;
        }

        setPageDraft(normalizePage(mergeRequiredSections(page)));
      } catch (loadError) {
        const fallbackDraft = defaultDraftForSlug(selectedSlug);
        if (active && fallbackDraft) {
          setPageDraft(fallbackDraft);
          return;
        }
        if (active) {
          showError(loadError.message || 'Failed to load selected page.');
        }
      } finally {
        if (active) {
          setPageLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [selectedSlug, showError]);

  useEffect(() => {
    const sections = pageDraft.sections ?? [];
    if (sections.length === 0) {
      setActiveSectionKey('');
      return;
    }

    const stillExists = sections.some((section) => (section.sectionKey || section.id) === activeSectionKey);
    if (!stillExists) {
      setActiveSectionKey(sections[0].sectionKey || sections[0].id || '');
    }
  }, [activeSectionKey, pageDraft.sections]);

  const applySavedPage = (savedPage) => {
    const normalizedPage = normalizePage(mergeRequiredSections(savedPage));
    const savedSummary = buildCmsPageSummary(normalizedPage);

    setPages((currentPages) => {
      const editablePages = ensureEditablePublicPages(currentPages);
      const existingIndex = editablePages.findIndex((page) => page.slug === savedSummary.slug);
      if (existingIndex < 0) {
        return [...editablePages, savedSummary];
      }

      return editablePages.map((page, index) => (index === existingIndex ? {
        ...page,
        ...savedSummary,
        isLocalDraft: false,
      } : page));
    });

    setPageDraft(normalizedPage);
    skipNextPageLoadSlugRef.current = selectedSlug === savedSummary.slug ? '' : savedSummary.slug;
    setSelectedSlug(savedSummary.slug);
  };

  const updatePageField = (field, value) => {
    setPageDraft((draft) => ({ ...draft, [field]: value }));
  };

  const handlePageLinkChange = (slug) => {
    updatePageField('slug', makeSlug(slug));
  };

  const updateSeoField = (field, value) => {
    setPageDraft((draft) => ({
      ...draft,
      seo: {
        ...(draft.seo ?? {}),
        [field]: value,
      },
    }));
  };

  const updateSection = (index, nextSection) => {
    setPageDraft((draft) => ({
      ...draft,
      sections: draft.sections.map((section, sectionIndex) => (sectionIndex === index ? nextSection : section)),
    }));
  };

  const moveSection = (index, direction) => {
    setPageDraft((draft) => {
      const sections = [...draft.sections];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= sections.length) {
        return draft;
      }
      const [moved] = sections.splice(index, 1);
      sections.splice(targetIndex, 0, moved);
      return {
        ...draft,
        sections: sections.map((section, sectionIndex) => ({
          ...section,
          sortOrder: (sectionIndex + 1) * 10,
        })),
      };
    });
  };

  const removeSection = (index) => {
    setPageDraft((draft) => ({
      ...draft,
      sections: draft.sections.filter((_, sectionIndex) => sectionIndex !== index),
    }));
  };

  const handleAddSection = (sectionType) => {
    const nextSection = createDefaultSection(sectionType, pageDraft.sections.length);
    setPageDraft((draft) => ({
      ...draft,
      sections: [...draft.sections, nextSection],
    }));
    setActiveSectionKey(nextSection.sectionKey);
  };

  const handleImageUpload = async (file, uploadKey, onUrlReady) => {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

    if (!allowedTypes.has(file.type)) {
      showError('Image upload failed. Upload a JPG, PNG, WEBP, or SVG image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError('Image upload failed. Image must be 5MB or smaller.');
      return;
    }

    setUploadingKey(uploadKey);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const asset = await uploadCmsImage({
        dataUrl,
        fileName: file.name,
        folder: uploadKey.includes('logo') ? 'logos' : `pages/${pageDraft.slug || 'draft'}`,
      });

      if (!asset?.publicUrl) {
        throw new Error('Upload finished but no image URL was returned.');
      }

      onUrlReady(asset.publicUrl);
      success(`Image uploaded successfully: ${getImageFileName(asset.publicUrl) || file.name}`);
    } catch (uploadError) {
      showError(uploadError.message || 'Image upload failed. Please try again.');
    } finally {
      setUploadingKey('');
    }
  };

  const handleCreatePage = () => {
    const existingSlugs = new Set(pages.map((page) => page.slug));
    const firstUnusedNavigationSlug = buildPageLinkOptions(navigationDraft)
      .find((option) => !existingSlugs.has(option.value))?.value;

    setSelectedSlug('');
    setPageDraft(createPageDraft({
      slug: firstUnusedNavigationSlug || 'new-page',
      title: 'New Page',
      status: 'draft',
      sections: [createDefaultSection('hero', 0)],
    }));
  };

  const handleSavePage = async () => {
    setSaving(true);
    setSavingMessage('Saving page changes...');
    try {
      const payload = normalizeBeforeSave(pageDraft);
      const savedPage = await saveCmsPage(payload);
      setSavingMessage('Updating CMS preview...');
      applySavedPage(savedPage);
      success(`CMS page saved successfully: ${savedPage.title || savedPage.slug}`);
    } catch (saveError) {
      showError(saveError.message || 'Failed to save CMS page. Please check the page fields and try again.');
    } finally {
      setSaving(false);
      setSavingMessage('');
    }
  };

  const handleDeletePage = async (page) => {
    if (!canDeleteCmsPage(page)) {
      showError('Default CMS pages are protected and cannot be deleted.');
      return;
    }

    const confirmed = window.confirm(`Delete "${page.title || page.slug}" from CMS pages? This also removes its saved sections and archives matching Navigation links.`);
    if (!confirmed) {
      return;
    }

    setDeletingSlug(page.slug);
    try {
      await deleteCmsPage(page.slug);
      const remainingPages = ensureEditablePublicPages((await listCmsPages()).filter((item) => item.slug !== page.slug));
      const currentSelectionStillExists = selectedSlug
        && selectedSlug !== page.slug
        && remainingPages.some((item) => item.slug === selectedSlug);
      const nextSelectedSlug = currentSelectionStillExists ? selectedSlug : remainingPages[0]?.slug || '';
      setPages(remainingPages);
      setSelectedSlug(nextSelectedSlug);
      if (!nextSelectedSlug) {
        setPageDraft(createPageDraft());
      }
      setNavigationDraft((items) => items.filter((item) => normalizeCmsPageSlugFromHref(item.href) !== page.slug));
      success(`CMS page deleted: ${page.title || page.slug}`);
    } catch (deleteError) {
      showError(deleteError.message || 'Failed to delete CMS page. Please try again.');
    } finally {
      setDeletingSlug('');
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setSavingMessage('Saving site settings...');
    try {
      await saveCmsSiteSettings(settingsDraft);
      success('Site settings saved successfully.');
    } catch (saveError) {
      showError(saveError.message || 'Failed to save site settings. Please try again.');
    } finally {
      setSaving(false);
      setSavingMessage('');
    }
  };

  const handleSaveNavigation = async () => {
    setSaving(true);
    setSavingMessage('Saving navigation...');
    try {
      const navigation = navigationDraft.map((item, index) => ({
        ...item,
        label: item.label || 'Untitled link',
        href: item.href || '/',
        sortOrder: toInteger(item.sortOrder, (index + 1) * 10),
      }));
      await saveCmsNavigation(navigation);
      setNavigationDraft(normalizeNavigationItems(navigation));
      success('Navigation saved successfully.');
    } catch (saveError) {
      showError(saveError.message || 'Failed to save navigation. Please try again.');
    } finally {
      setSaving(false);
      setSavingMessage('');
    }
  };

  const handleSaveActive = activeTab === 'pages'
    ? handleSavePage
    : activeTab === 'settings'
      ? handleSaveSettings
      : activeTab === 'navigation'
        ? handleSaveNavigation
        : undefined;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-primary-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 border-b border-primary-200 bg-[radial-gradient(circle_at_top_left,_rgba(30,58,138,0.08),_transparent_30%),linear-gradient(to_right,_#ffffff,_#f8fafc)] p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-accent-primary">
              <Globe2 className="h-3.5 w-3.5" />
              Website Editor
            </div>
            <h1 className="mt-4 text-3xl font-display font-bold text-primary-950">Content Management</h1>
          </div>
          {handleSaveActive ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveActive}
              className="btn btn-primary min-w-[160px]"
            >
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : `Save ${activeTab === 'pages' ? 'Page' : activeTab === 'settings' ? 'Settings' : 'Navigation'}`}
            </button>
          ) : (
            <div className="rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm font-semibold text-primary-600">
              Save each catalog card after editing.
            </div>
          )}
        </div>

        <div className="flex max-w-full gap-2 overflow-x-auto border-b border-primary-200 bg-primary-50 px-4 py-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-primary-950 text-white shadow-sm'
                    : 'border border-primary-200 bg-white text-primary-600 hover:text-primary-950'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {saving && (
          <div className="flex items-center gap-2 border-b border-accent-blue/20 bg-accent-blue/10 px-5 py-3 text-sm font-semibold text-accent-blue">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            {savingMessage || 'Saving CMS changes...'}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center text-primary-500">
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
            Loading CMS workspace...
          </div>
        ) : activeTab === 'pages' ? (
          <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
            <aside className="border-b border-primary-200 bg-primary-50 p-4 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-primary-500">Pages</h2>
                <button type="button" onClick={handleCreatePage} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2 text-xs font-bold text-accent-primary hover:bg-primary-100">
                  <Plus className="h-3.5 w-3.5" />
                  New
                </button>
              </div>
              <div className="space-y-2">
                {pages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-primary-300 bg-white p-4 text-sm text-primary-500">No CMS pages yet.</div>
                ) : pages.map((page) => {
                  const deleteAllowed = canDeleteCmsPage(page);
                  const isDeletingPage = deletingSlug === page.slug;

                  return (
                    <div
                      key={page.id || page.slug}
                      className={`grid grid-cols-[1fr_auto] items-stretch rounded-2xl border bg-white transition ${
                        selectedSlug === page.slug
                          ? 'border-accent-primary shadow-sm'
                          : 'border-primary-200 bg-white/70 hover:bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedSlug(page.slug)}
                        className="min-w-0 p-4 text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-semibold text-primary-950">{page.title}</span>
                          <StatusBadge status={page.status} />
                        </div>
                        <p className="mt-2 text-xs text-primary-500">/{page.slug} - {page.sectionCount ?? 0} sections</p>
                      </button>
                      <button
                        type="button"
                        disabled={!deleteAllowed || isDeletingPage}
                        onClick={() => handleDeletePage(page)}
                        title={deleteAllowed ? `Delete ${page.title || page.slug}` : 'Default CMS pages are protected'}
                        className="m-2 inline-flex w-10 items-center justify-center rounded-xl border border-transparent text-primary-400 transition hover:border-red-200 hover:bg-red-50 hover:text-accent-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-primary-400"
                      >
                        {isDeletingPage ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </aside>

            <main className="space-y-6 p-5 lg:p-6">
              {pageLoading && (
                <div className="flex items-center gap-2 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-500">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading selected page...
                </div>
              )}
              <section className="rounded-3xl border border-primary-200 bg-white p-5 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-xl font-display font-semibold text-primary-950">Page details</h2>
                  <p className="mt-1 text-sm text-primary-500">Basic page information and search preview text.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Page title" value={pageDraft.title} onChange={(value) => updatePageField('title', value)} />
                  <SelectField
                    label="Page link"
                    value={pageDraft.slug}
                    options={pageLinkOptions}
                    onChange={handlePageLinkChange}
                    helper="Choose from links saved in Navigation."
                  />
                  <SelectField label="Page status" value={pageDraft.status} options={STATUS_OPTIONS} onChange={(value) => updatePageField('status', value)} />
                  <Field label="Browser title" value={pageDraft.seo?.title} onChange={(value) => updateSeoField('title', value)} />
                  <div className="md:col-span-2">
                    <TextAreaField label="Search description" value={pageDraft.seo?.description} rows={3} onChange={(value) => updateSeoField('description', value)} />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-col gap-4 rounded-3xl border border-primary-200 bg-primary-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-xl font-display font-semibold text-primary-950">Page sections</h2>
                    <p className="mt-1 text-sm text-primary-500">Choose one section card to edit at a time, so the page stays clean and easy to work through.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SECTION_TYPES.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => handleAddSection(type.value)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2 text-xs font-bold text-accent-primary hover:bg-primary-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {pageDraft.sections.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-primary-300 bg-white p-8 text-center text-primary-500">
                    No sections yet. Add a hero, text block, feature cards, stats, CTA, or FAQ block.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {pageDraft.sections.map((section, index) => {
                        const sectionKey = section.sectionKey || section.id || `section-${index}`;
                        const isActive = index === activeSectionIndex;
                        const typeLabel = SECTION_TYPES.find((type) => type.value === section.sectionType)?.label || section.sectionType;

                        return (
                          <button
                            key={sectionKey}
                            type="button"
                            onClick={() => setActiveSectionKey(sectionKey)}
                            className={`rounded-3xl border p-4 text-left transition ${
                              isActive
                                ? 'border-accent-primary bg-white shadow-md'
                                : 'border-primary-200 bg-white/75 hover:border-primary-300 hover:bg-white'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-400">Section {index + 1}</p>
                                <h3 className="mt-2 truncate text-base font-display font-semibold text-primary-950">{section.title || 'Untitled section'}</h3>
                                <p className="mt-1 text-xs font-semibold text-primary-500">{typeLabel}</p>
                              </div>
                              <StatusBadge status={section.status} />
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {activeSection && (
                      <SectionEditor
                        key={activeSection.id || activeSection.sectionKey || activeSectionIndex}
                        section={activeSection}
                        index={activeSectionIndex}
                        total={pageDraft.sections.length}
                        onChange={(nextSection) => updateSection(activeSectionIndex, nextSection)}
                        onMove={moveSection}
                        onRemove={() => removeSection(activeSectionIndex)}
                        onImageUpload={handleImageUpload}
                        uploadingKey={uploadingKey}
                      />
                    )}
                  </>
                )}
                {selectedPage && <p className="text-xs text-primary-500">Last saved page: {selectedPage.updatedAt || 'not available'}</p>}
              </section>
            </main>
          </div>
        ) : activeTab === 'catalog' ? (
          <CatalogContentCmsPanel />
        ) : activeTab === 'settings' ? (
          <div className="space-y-6 p-5 lg:p-6">
            <section className="rounded-3xl border border-primary-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-display font-semibold text-primary-950">Company and contact details</h2>
              <p className="mt-1 text-sm text-primary-500">These values power the public header and footer.</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Company name" value={settingsDraft.company_name} onChange={(value) => setSettingsDraft((draft) => ({ ...draft, company_name: value }))} />
                <Field label="Brand kicker" value={settingsDraft.brand_kicker} onChange={(value) => setSettingsDraft((draft) => ({ ...draft, brand_kicker: value }))} />
                <Field label="Brand title" value={settingsDraft.brand_title} onChange={(value) => setSettingsDraft((draft) => ({ ...draft, brand_title: value }))} />
                <div className="md:col-span-2">
                  <ImageUploadField
                    label="Logo image"
                    value={settingsDraft.logo_url}
                    onChange={(value) => setSettingsDraft((draft) => ({ ...draft, logo_url: value }))}
                    onUpload={handleImageUpload}
                    uploadKey="site-logo"
                    uploadingKey={uploadingKey}
                    helper="This controls the public website logo. Save Settings after uploading to publish the new logo."
                  />
                </div>
                <Field label="Mobile number" value={settingsDraft.primary_phone} onChange={(value) => setSettingsDraft((draft) => ({ ...draft, primary_phone: value }))} />
                <Field label="Landline" value={settingsDraft.landline} onChange={(value) => setSettingsDraft((draft) => ({ ...draft, landline: value }))} />
                <Field label="Business hours" value={settingsDraft.business_hours} onChange={(value) => setSettingsDraft((draft) => ({ ...draft, business_hours: value }))} />
                <Field label="Footer note" value={settingsDraft.footer_note} onChange={(value) => setSettingsDraft((draft) => ({ ...draft, footer_note: value }))} />
                <div className="md:col-span-2">
                  <TextAreaField label="Address" value={settingsDraft.address} rows={3} onChange={(value) => setSettingsDraft((draft) => ({ ...draft, address: value }))} />
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-6 p-5 lg:p-6">
            <section className="rounded-3xl border border-primary-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-display font-semibold text-primary-950">Navigation links</h2>
                  <p className="mt-1 text-sm text-primary-500">Control public menu and footer links without editing code.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNavigationDraft((draft) => [...draft, {
                    label: 'New link',
                    href: '/',
                    groupKey: 'primary',
                    sortOrder: (draft.length + 1) * 10,
                    isVisible: true,
                    opensNewTab: false,
                    status: 'published',
                    metadata: {},
                  }])}
                  className="btn btn-secondary"
                >
                  <Plus className="h-4 w-4" />
                  Add Link
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {navigationDraft.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-primary-300 bg-primary-50 p-8 text-center text-primary-500">No navigation links yet.</div>
                ) : navigationDraft.map((item, index) => (
                  <div key={item.id || index} className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_180px_120px]">
                      <Field label="Label" value={item.label} onChange={(value) => setNavigationDraft((draft) => draft.map((row, rowIndex) => (rowIndex === index ? { ...row, label: value } : row)))} />
                      <Field label="Link" value={item.href} onChange={(value) => setNavigationDraft((draft) => draft.map((row, rowIndex) => (rowIndex === index ? { ...row, href: value } : row)))} />
                      <SelectField label="Group" value={item.groupKey} options={NAV_GROUP_OPTIONS} onChange={(value) => setNavigationDraft((draft) => draft.map((row, rowIndex) => (rowIndex === index ? { ...row, groupKey: value } : row)))} />
                      <Field label="Order" type="number" value={item.sortOrder} onChange={(value) => setNavigationDraft((draft) => draft.map((row, rowIndex) => (rowIndex === index ? { ...row, sortOrder: value } : row)))} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <CheckboxField label="Visible" checked={item.isVisible} onChange={(value) => setNavigationDraft((draft) => draft.map((row, rowIndex) => (rowIndex === index ? { ...row, isVisible: value } : row)))} />
                      <CheckboxField label="Open in new tab" checked={item.opensNewTab} onChange={(value) => setNavigationDraft((draft) => draft.map((row, rowIndex) => (rowIndex === index ? { ...row, opensNewTab: value } : row)))} />
                      <SelectField label="Status" value={item.status} options={STATUS_OPTIONS} onChange={(value) => setNavigationDraft((draft) => draft.map((row, rowIndex) => (rowIndex === index ? { ...row, status: value } : row)))} />
                      <button
                        type="button"
                        onClick={() => setNavigationDraft((draft) => draft.filter((_, rowIndex) => rowIndex !== index))}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-accent-danger hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

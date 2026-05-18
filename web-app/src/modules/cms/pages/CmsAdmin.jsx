import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Globe2,
  LoaderCircle,
  Navigation,
  Plus,
  Save,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import { useToast } from '../../../components/ui/Toast';
import {
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read selected image.'));
    reader.readAsDataURL(file);
  });
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
          <Field label={label} value={value} onChange={onChange} placeholder="/LogoLimen.jpg or uploaded image URL" />
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

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-900 outline-none transition focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
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
  const updateContent = (patch) => onContentChange({ ...content, ...patch });
  const updatePrimaryCta = (patch) => updateContent({ primaryCta: { ...(content.primaryCta ?? {}), ...patch } });
  const updateSecondaryCta = (patch) => updateContent({ secondaryCta: { ...(content.secondaryCta ?? {}), ...patch } });

  if (section.sectionType === 'hero') {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Small label" value={content.eyebrow} onChange={(value) => updateContent({ eyebrow: value })} />
        </div>
        <Field label="Headline" value={content.title} onChange={(value) => updateContent({ title: value })} />
        <TextAreaField label="Subtitle" value={content.subtitle} rows={3} onChange={(value) => updateContent({ subtitle: value })} />
        <TextAreaField label="Body paragraph" value={content.body} rows={3} onChange={(value) => updateContent({ body: value })} />
        <ImageUploadField
          label="Hero image"
          value={content.imageUrl}
          onChange={(value) => updateContent({ imageUrl: value })}
          onUpload={onImageUpload}
          uploadKey={`section-${section.sectionKey || section.id || 'hero'}-image`}
          uploadingKey={uploadingKey}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Primary button label" value={content.primaryCta?.label} onChange={(value) => updatePrimaryCta({ label: value })} />
          <Field label="Primary button link" value={content.primaryCta?.href} onChange={(value) => updatePrimaryCta({ href: value })} />
          <Field label="Secondary button label" value={content.secondaryCta?.label} onChange={(value) => updateSecondaryCta({ label: value })} />
          <Field label="Secondary button link" value={content.secondaryCta?.href} onChange={(value) => updateSecondaryCta({ href: value })} />
          <Field label="Image alt text" value={content.imageAlt} onChange={(value) => updateContent({ imageAlt: value })} />
        </div>
        <div className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4">
          <h4 className="mb-3 text-sm font-bold text-primary-950">Storefront image overlay</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Overlay small label" value={content.imageEyebrow} onChange={(value) => updateContent({ imageEyebrow: value })} />
            <Field label="Overlay headline" value={content.imageTitle} onChange={(value) => updateContent({ imageTitle: value })} />
            <Field label="Store metric label" value={content.storeLabel} onChange={(value) => updateContent({ storeLabel: value })} />
            <Field label="Store metric text" value={content.storeValue} onChange={(value) => updateContent({ storeValue: value })} />
            <Field label="Catalog metric label" value={content.catalogLabel} onChange={(value) => updateContent({ catalogLabel: value })} />
            <Field label="Catalog metric text" value={content.catalogValue} onChange={(value) => updateContent({ catalogValue: value })} />
            <Field label="Quotes metric label" value={content.quotesLabel} onChange={(value) => updateContent({ quotesLabel: value })} />
            <Field label="Quotes metric text" value={content.quotesValue} onChange={(value) => updateContent({ quotesValue: value })} />
          </div>
        </div>
        <div className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4">
          <h4 className="mb-3 text-sm font-bold text-primary-950">Homepage badges and vehicle chips</h4>
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
          <Field label="Small label" value={content.eyebrow} onChange={(value) => updateContent({ eyebrow: value })} />
          <Field label="Headline" value={content.title} onChange={(value) => updateContent({ title: value })} />
          <Field label="Section button label" value={content.ctaLabel} onChange={(value) => updateContent({ ctaLabel: value })} />
          <Field label="Section button link" value={content.ctaHref} onChange={(value) => updateContent({ ctaHref: value })} />
          <Field label="Card action label" value={content.cardCtaLabel} onChange={(value) => updateContent({ cardCtaLabel: value })} />
          <Field label="Primary action label" value={content.primaryActionLabel} onChange={(value) => updateContent({ primaryActionLabel: value })} />
          <Field label="Secondary action label" value={content.secondaryActionLabel} onChange={(value) => updateContent({ secondaryActionLabel: value })} />
          <Field label="Step label" value={content.stepLabel} onChange={(value) => updateContent({ stepLabel: value })} />
          <Field label="Kicker label" value={content.kicker} onChange={(value) => updateContent({ kicker: value })} />
          <Field label="Badge label" value={content.badgeLabel} onChange={(value) => updateContent({ badgeLabel: value })} />
          <Field label="Trust label" value={content.trustLabel} onChange={(value) => updateContent({ trustLabel: value })} />
          <Field label="Trust tags" value={content.trustTags} onChange={(value) => updateContent({ trustTags: value })} helper="Comma-separated list." />
        </div>
        <TextAreaField label="Subtitle" value={content.subtitle} rows={3} onChange={(value) => updateContent({ subtitle: value })} />
        <TextAreaField label="Summary text" value={content.summary} rows={2} onChange={(value) => updateContent({ summary: value })} />
        <TextAreaField label="Body / quote text" value={content.body} rows={3} onChange={(value) => updateContent({ body: value })} />
        <RepeatableRows
          title="Feature cards"
          items={content.items}
          emptyItem={{ title: '', description: '', href: '', imageUrl: '', imageAlt: '' }}
          onChange={(items) => updateContent({ items })}
          renderItem={(item, updateItem, itemIndex) => (
            <>
              <Field label="Small label / vehicle" value={item.eyebrow} onChange={(value) => updateItem({ eyebrow: value })} placeholder="Montero Sport" />
              <Field label="Badge" value={item.badge} onChange={(value) => updateItem({ badge: value })} placeholder="Best Seller" />
              <Field label="Card title" value={item.title} onChange={(value) => updateItem({ title: value })} />
              <Field label="Optional link" value={item.href} onChange={(value) => updateItem({ href: value })} placeholder="/catalog" />
              <Field label="Part number" value={item.partNo} onChange={(value) => updateItem({ partNo: value })} placeholder="ME-013307" />
              <Field label="Price" value={item.price} onChange={(value) => updateItem({ price: value })} placeholder="PHP 1,245" />
              <Field label="Image alt text" value={item.imageAlt} onChange={(value) => updateItem({ imageAlt: value })} />
              <TextAreaField label="Description" value={item.description} rows={2} onChange={(value) => updateItem({ description: value })} />
              <div className="md:col-span-2">
                <ImageUploadField
                  label="Card image"
                  value={item.imageUrl}
                  onChange={(value) => updateItem({ imageUrl: value })}
                  onUpload={onImageUpload}
                  uploadKey={`section-${section.sectionKey || section.id || 'feature'}-item-${itemIndex}-image`}
                  uploadingKey={uploadingKey}
                  helper="Optional. Use this for Best Sellers, service visuals, or any public card that needs an editable image."
                />
              </div>
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
          <Field label="Small label" value={content.eyebrow} onChange={(value) => updateContent({ eyebrow: value })} />
          <Field label="Headline" value={content.title} onChange={(value) => updateContent({ title: value })} />
          <Field label="Loading text" value={content.loadingText} onChange={(value) => updateContent({ loadingText: value })} />
          <Field label="Empty text" value={content.emptyText} onChange={(value) => updateContent({ emptyText: value })} />
          <Field label="Team label" value={content.teamLabel} onChange={(value) => updateContent({ teamLabel: value })} />
          <Field label="Fallback bio" value={content.fallbackBio} onChange={(value) => updateContent({ fallbackBio: value })} />
          <Field label="Schedule label" value={content.scheduleLabel} onChange={(value) => updateContent({ scheduleLabel: value })} />
          <Field label="Available date label" value={content.dateLabel} onChange={(value) => updateContent({ dateLabel: value })} />
          <Field label="Available date fallback" value={content.dateFallback} onChange={(value) => updateContent({ dateFallback: value })} />
          <Field label="Contact label" value={content.contactLabel} onChange={(value) => updateContent({ contactLabel: value })} />
          <Field label="Contact fallback" value={content.contactFallback} onChange={(value) => updateContent({ contactFallback: value })} />
        </div>
        <TextAreaField label="Subtitle" value={content.subtitle} rows={3} onChange={(value) => updateContent({ subtitle: value })} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Phone" value={content.phone} onChange={(value) => updateContent({ phone: value })} />
          <Field label="Landline" value={content.landline} onChange={(value) => updateContent({ landline: value })} />
          <Field label="Business hours" value={content.hours} onChange={(value) => updateContent({ hours: value })} />
          <Field label="Address" value={content.address} onChange={(value) => updateContent({ address: value })} />
          <Field label="Map embed URL" value={content.mapUrl} onChange={(value) => updateContent({ mapUrl: value })} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Primary button label" value={content.primaryCta?.label} onChange={(value) => updatePrimaryCta({ label: value })} />
          <Field label="Primary button link" value={content.primaryCta?.href} onChange={(value) => updatePrimaryCta({ href: value })} />
          <Field label="Secondary button label" value={content.secondaryCta?.label} onChange={(value) => updateSecondaryCta({ label: value })} />
          <Field label="Secondary button link" value={content.secondaryCta?.href} onChange={(value) => updateSecondaryCta({ href: value })} />
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
        <Field label="Small label" value={content.eyebrow} onChange={(value) => updateContent({ eyebrow: value })} />
        <Field label="Headline" value={content.title} onChange={(value) => updateContent({ title: value })} />
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Internal name" value={section.title} onChange={(value) => updateSection({ title: value })} />
          <SelectField
            label="Section type"
            value={section.sectionType}
            options={SECTION_TYPES}
            onChange={(value) => {
              const nextDefault = createDefaultSection(value, index);
              updateSection({
                sectionType: value,
                content: {
                  ...nextDefault.content,
                  ...(section.sectionType === value ? section.content : {}),
                },
              });
            }}
          />
          <SelectField label="Status" value={section.status} options={SECTION_STATUS_OPTIONS} onChange={(value) => updateSection({ status: value })} />
          <Field label="Order" type="number" value={section.sortOrder} onChange={(value) => updateSection({ sortOrder: value })} />
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
  { id: 'settings', label: 'Site Settings', icon: Settings },
  { id: 'navigation', label: 'Navigation', icon: Navigation },
];

export default function CmsAdmin() {
  const { success, error: showError } = useToast();
  const [activeTab, setActiveTab] = useState('pages');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const refreshPages = async (slugToSelect) => {
    const pageRows = await listCmsPages();
    const editablePages = ensureEditablePublicPages(pageRows);
    setPages(editablePages);
    setSelectedSlug(slugToSelect || editablePages[0]?.slug || '');
  };

  const updatePageField = (field, value) => {
    setPageDraft((draft) => ({ ...draft, [field]: value }));
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
      showError('Upload a JPG, PNG, WEBP, or SVG image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError('Image must be 5MB or smaller.');
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
      success('Image uploaded successfully');
    } catch (uploadError) {
      showError(uploadError.message || 'Failed to upload image.');
    } finally {
      setUploadingKey('');
    }
  };

  const handleCreatePage = () => {
    setSelectedSlug('');
    setPageDraft(createPageDraft({
      slug: 'new-page',
      title: 'New Page',
      status: 'draft',
      sections: [createDefaultSection('hero', 0)],
    }));
  };

  const handleSavePage = async () => {
    setSaving(true);
    try {
      const payload = normalizeBeforeSave(pageDraft);
      const savedPage = await saveCmsPage(payload);
      await refreshPages(savedPage.slug);
      setPageDraft(normalizePage(savedPage));
      success('CMS page saved successfully');
    } catch (saveError) {
      showError(saveError.message || 'Failed to save CMS page.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await saveCmsSiteSettings(settingsDraft);
      success('Site settings saved successfully');
    } catch (saveError) {
      showError(saveError.message || 'Failed to save site settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNavigation = async () => {
    setSaving(true);
    try {
      const navigation = navigationDraft.map((item, index) => ({
        ...item,
        label: item.label || 'Untitled link',
        href: item.href || '/',
        sortOrder: toInteger(item.sortOrder, (index + 1) * 10),
      }));
      await saveCmsNavigation(navigation);
      setNavigationDraft(normalizeNavigationItems(navigation));
      success('Navigation saved successfully');
    } catch (saveError) {
      showError(saveError.message || 'Failed to save navigation.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveActive = activeTab === 'pages'
    ? handleSavePage
    : activeTab === 'settings'
      ? handleSaveSettings
      : handleSaveNavigation;

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
            <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-600">
              Edit public website pages with simple forms. No JSON or code editing is required for basic page, navigation, and contact updates.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveActive}
            className="btn btn-primary min-w-[160px]"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save {activeTab === 'pages' ? 'Page' : activeTab === 'settings' ? 'Settings' : 'Navigation'}
          </button>
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
                ) : pages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => setSelectedSlug(page.slug)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedSlug === page.slug
                        ? 'border-accent-primary bg-white shadow-sm'
                        : 'border-primary-200 bg-white/70 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-primary-950">{page.title}</span>
                      <StatusBadge status={page.status} />
                    </div>
                    <p className="mt-2 text-xs text-primary-500">/{page.slug} - {page.sectionCount ?? 0} sections</p>
                  </button>
                ))}
              </div>
            </aside>

            <main className="space-y-6 p-5 lg:p-6">
              <section className="rounded-3xl border border-primary-200 bg-white p-5 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-xl font-display font-semibold text-primary-950">Page details</h2>
                  <p className="mt-1 text-sm text-primary-500">Basic page information and search preview text.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Page title" value={pageDraft.title} onChange={(value) => updatePageField('title', value)} />
                  <Field label="Page link" value={pageDraft.slug} onChange={(value) => updatePageField('slug', makeSlug(value))} helper="Example: about creates /about" />
                  <SelectField label="Page status" value={pageDraft.status} options={STATUS_OPTIONS} onChange={(value) => updatePageField('status', value)} />
                  <Field label="Template" value={pageDraft.templateKey} onChange={(value) => updatePageField('templateKey', value)} helper="Keep default unless a developer adds a custom template." />
                  <Field label="SEO title" value={pageDraft.seo?.title} onChange={(value) => updateSeoField('title', value)} />
                  <Field label="SEO keywords" value={pageDraft.seo?.keywords} onChange={(value) => updateSeoField('keywords', value)} placeholder="parts, mitsubishi, pasay" />
                  <div className="md:col-span-2">
                    <TextAreaField label="SEO description" value={pageDraft.seo?.description} rows={3} onChange={(value) => updateSeoField('description', value)} />
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

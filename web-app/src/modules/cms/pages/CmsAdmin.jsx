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
        primaryCta: { label: 'Primary action', href: '/catalog' },
        secondaryCta: { label: 'Secondary action', href: '/estimate' },
        imageUrl: '',
        imageAlt: '',
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
          { title: 'Feature title', description: 'Feature description', href: '' },
        ],
      },
    };
  }

  if (sectionType === 'stats') {
    return {
      ...baseSection,
      title: 'Stats',
      content: {
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
                {renderItem(item, (patch) => updateRow(index, patch))}
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
      </div>
    );
  }

  if (section.sectionType === 'feature_grid') {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Small label" value={content.eyebrow} onChange={(value) => updateContent({ eyebrow: value })} />
          <Field label="Headline" value={content.title} onChange={(value) => updateContent({ title: value })} />
        </div>
        <TextAreaField label="Subtitle" value={content.subtitle} rows={3} onChange={(value) => updateContent({ subtitle: value })} />
        <RepeatableRows
          title="Feature cards"
          items={content.items}
          emptyItem={{ title: '', description: '', href: '' }}
          onChange={(items) => updateContent({ items })}
          renderItem={(item, updateItem) => (
            <>
              <Field label="Card title" value={item.title} onChange={(value) => updateItem({ title: value })} />
              <Field label="Optional link" value={item.href} onChange={(value) => updateItem({ href: value })} placeholder="/catalog" />
              <TextAreaField label="Description" value={item.description} rows={2} onChange={(value) => updateItem({ description: value })} />
            </>
          )}
        />
      </div>
    );
  }

  if (section.sectionType === 'stats') {
    return (
      <RepeatableRows
        title="Stats"
        items={content.items}
        emptyItem={{ value: '', label: '' }}
        onChange={(items) => updateContent({ items })}
        renderItem={(item, updateItem) => (
          <>
            <Field label="Value" value={item.value} onChange={(value) => updateItem({ value })} placeholder="13 Years" />
            <Field label="Label" value={item.label} onChange={(value) => updateItem({ label: value })} placeholder="In Service" />
          </>
        )}
      />
    );
  }

  if (section.sectionType === 'cta') {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Small label" value={content.eyebrow} onChange={(value) => updateContent({ eyebrow: value })} />
          <Field label="Headline" value={content.title} onChange={(value) => updateContent({ title: value })} />
        </div>
        <TextAreaField label="Subtitle" value={content.subtitle} rows={3} onChange={(value) => updateContent({ subtitle: value })} />
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
  const [pageDraft, setPageDraft] = useState(createPageDraft());
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_SETTINGS);
  const [navigationDraft, setNavigationDraft] = useState([]);

  const selectedPage = useMemo(
    () => pages.find((page) => page.slug === selectedSlug),
    [pages, selectedSlug],
  );

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

        setPages(pageRows);
        setSettingsDraft(normalizeSettings(site?.settings ?? {}));
        setNavigationDraft(normalizeNavigationItems(site?.navigation ?? []));
        setSelectedSlug(pageRows[0]?.slug || '');
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

        setPageDraft(normalizePage(page));
      } catch (loadError) {
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

  const refreshPages = async (slugToSelect) => {
    const pageRows = await listCmsPages();
    setPages(pageRows);
    setSelectedSlug(slugToSelect || pageRows[0]?.slug || '');
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
    setPageDraft((draft) => ({
      ...draft,
      sections: [...draft.sections, createDefaultSection(sectionType, draft.sections.length)],
    }));
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
                    <p className="mt-1 text-sm text-primary-500">Add or edit the content blocks shown on this public page.</p>
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
                ) : pageDraft.sections.map((section, index) => (
                  <SectionEditor
                    key={section.id || section.sectionKey || index}
                    section={section}
                    index={index}
                    total={pageDraft.sections.length}
                    onChange={(nextSection) => updateSection(index, nextSection)}
                    onMove={moveSection}
                    onRemove={() => removeSection(index)}
                    onImageUpload={handleImageUpload}
                    uploadingKey={uploadingKey}
                  />
                ))}
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

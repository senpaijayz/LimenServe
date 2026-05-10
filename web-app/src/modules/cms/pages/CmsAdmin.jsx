import { useEffect, useMemo, useState } from 'react';
import { FileText, Globe2, LoaderCircle, Navigation, Save, Settings } from 'lucide-react';
import { useToast } from '../../../components/ui/Toast';
import {
  getCmsPage,
  getPublicCmsSite,
  listCmsPages,
  saveCmsNavigation,
  saveCmsPage,
  saveCmsSiteSettings,
} from '../../../services/cmsApi';

const DEFAULT_PAGE_DRAFT = {
  slug: '',
  title: '',
  pageType: 'landing',
  templateKey: 'default',
  status: 'draft',
  seo: {},
  metadata: {},
  sections: [],
};

function stringifyJson(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonField(value, label, fallback) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function CmsTextArea({ label, value, onChange, minHeight = 'min-h-[180px]', helper }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 font-mono text-sm leading-6 text-primary-900 outline-none transition focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10 ${minHeight}`}
        spellCheck={false}
      />
      {helper && <span className="mt-2 block text-xs text-primary-500">{helper}</span>}
    </label>
  );
}

function StatusBadge({ status }) {
  const styles = {
    published: 'bg-accent-success/10 text-accent-success',
    draft: 'bg-accent-warning/10 text-accent-warning',
    archived: 'bg-primary-100 text-primary-500',
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${styles[status] || styles.draft}`}>
      {status || 'draft'}
    </span>
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
  const [pages, setPages] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [pageDraft, setPageDraft] = useState(DEFAULT_PAGE_DRAFT);
  const [seoJson, setSeoJson] = useState('{}');
  const [sectionsJson, setSectionsJson] = useState('[]');
  const [settingsJson, setSettingsJson] = useState('{}');
  const [navigationJson, setNavigationJson] = useState('[]');

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
        setSettingsJson(stringifyJson(site?.settings ?? {}));
        setNavigationJson(stringifyJson(site?.navigation ?? []));

        const firstSlug = pageRows[0]?.slug || '';
        setSelectedSlug(firstSlug);
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
        setPageDraft(DEFAULT_PAGE_DRAFT);
        setSeoJson('{}');
        setSectionsJson('[]');
        return;
      }

      try {
        const page = await getCmsPage(selectedSlug);
        if (!active || !page) {
          return;
        }

        setPageDraft({
          ...DEFAULT_PAGE_DRAFT,
          ...page,
          sections: page.sections ?? [],
        });
        setSeoJson(stringifyJson(page.seo ?? {}));
        setSectionsJson(stringifyJson(page.sections ?? []));
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

  const handleSavePage = async () => {
    setSaving(true);
    try {
      const payload = {
        ...pageDraft,
        seo: parseJsonField(seoJson, 'SEO metadata', {}),
        sections: parseJsonField(sectionsJson, 'Sections', []),
      };

      const savedPage = await saveCmsPage(payload);
      await refreshPages(savedPage.slug);
      success('CMS page saved successfully');
    } catch (saveError) {
      showError(saveError.message || 'Failed to save CMS page.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePage = () => {
    setSelectedSlug('');
    setPageDraft({
      ...DEFAULT_PAGE_DRAFT,
      slug: 'new-page',
      title: 'New Page',
      sections: [
        {
          sectionKey: 'intro',
          sectionType: 'rich_text',
          title: 'Intro',
          status: 'draft',
          sortOrder: 10,
          content: {
            title: 'New Page',
            body: 'Write public content here.',
          },
          settings: {},
          visibility: {},
        },
      ],
    });
    setSeoJson('{}');
    setSectionsJson(stringifyJson([
      {
        sectionKey: 'intro',
        sectionType: 'rich_text',
        title: 'Intro',
        status: 'draft',
        sortOrder: 10,
        content: {
          title: 'New Page',
          body: 'Write public content here.',
        },
        settings: {},
        visibility: {},
      },
    ]));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const settings = parseJsonField(settingsJson, 'Site settings', {});
      await saveCmsSiteSettings(settings);
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
      const navigation = parseJsonField(navigationJson, 'Navigation', []);
      await saveCmsNavigation(navigation);
      success('Navigation saved successfully');
    } catch (saveError) {
      showError(saveError.message || 'Failed to save navigation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-primary-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 border-b border-primary-200 bg-[radial-gradient(circle_at_top_left,_rgba(30,58,138,0.08),_transparent_30%),linear-gradient(to_right,_#ffffff,_#f8fafc)] p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-accent-primary">
              <Globe2 className="h-3.5 w-3.5" />
              Headless CMS
            </div>
            <h1 className="mt-4 text-3xl font-display font-bold text-primary-950">Website Content Management</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-600">
              Manage public pages, website settings, and navigation without code changes. Publish updates to the public site through the database-backed CMS layer.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={activeTab === 'pages' ? handleSavePage : activeTab === 'settings' ? handleSaveSettings : handleSaveNavigation}
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
                <button type="button" onClick={handleCreatePage} className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-xs font-bold text-accent-primary hover:bg-primary-100">
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
                    <p className="mt-2 text-xs text-primary-500">/{page.slug} • {page.sectionCount ?? 0} sections</p>
                  </button>
                ))}
              </div>
            </aside>

            <main className="space-y-5 p-5 lg:p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">Slug</span>
                  <input
                    value={pageDraft.slug}
                    onChange={(event) => setPageDraft((draft) => ({ ...draft, slug: event.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                    className="mt-2 w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-900 outline-none focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">Status</span>
                  <select
                    value={pageDraft.status}
                    onChange={(event) => setPageDraft((draft) => ({ ...draft, status: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-900 outline-none focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">Page title</span>
                <input
                  value={pageDraft.title}
                  onChange={(event) => setPageDraft((draft) => ({ ...draft, title: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-900 outline-none focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10"
                />
              </label>
              <CmsTextArea label="SEO JSON" value={seoJson} onChange={setSeoJson} minHeight="min-h-[130px]" helper='Example: {"title":"Homepage","description":"Public SEO description"}' />
              <CmsTextArea label="Sections JSON" value={sectionsJson} onChange={setSectionsJson} minHeight="min-h-[360px]" helper="Use sectionType values: hero, feature_grid, stats, rich_text, cta, faq." />
              {selectedPage && <p className="text-xs text-primary-500">Last saved page: {selectedPage.updatedAt || 'not available'}</p>}
            </main>
          </div>
        ) : activeTab === 'settings' ? (
          <div className="p-5 lg:p-6">
            <CmsTextArea label="Public Site Settings JSON" value={settingsJson} onChange={setSettingsJson} minHeight="min-h-[460px]" helper="Settings are published immediately after save and consumed by the public header/footer." />
          </div>
        ) : (
          <div className="p-5 lg:p-6">
            <CmsTextArea label="Navigation JSON" value={navigationJson} onChange={setNavigationJson} minHeight="min-h-[460px]" helper="Each item supports label, href, groupKey, sortOrder, isVisible, opensNewTab, and status." />
          </div>
        )}
      </div>
    </div>
  );
}

import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CmsAdmin from '../modules/cms/pages/CmsAdmin';

const api = vi.hoisted(() => ({
  deleteCmsPage: vi.fn(),
  getCmsPage: vi.fn(),
  getPublicCmsSite: vi.fn(),
  listCmsPages: vi.fn(),
  saveCmsNavigation: vi.fn(),
  saveCmsPage: vi.fn(),
  saveCmsSiteSettings: vi.fn(),
  uploadCmsImage: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../services/cmsApi', () => ({
  deleteCmsPage: api.deleteCmsPage,
  getCmsPage: api.getCmsPage,
  getPublicCmsSite: api.getPublicCmsSite,
  listCmsPages: api.listCmsPages,
  saveCmsNavigation: api.saveCmsNavigation,
  saveCmsPage: api.saveCmsPage,
  saveCmsSiteSettings: api.saveCmsSiteSettings,
  uploadCmsImage: api.uploadCmsImage,
}));

vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ success: api.success, error: api.error }) }));
vi.mock('../components/ui/Modal', () => ({
  default: ({ isOpen, title, children }) => isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));
vi.mock('../modules/cms/catalog-content/CatalogContentCmsPanel', () => ({ default: () => <div>Catalog editor</div> }));
vi.mock('../modules/public/components/DynamicPageRenderer', () => ({ default: ({ page }) => <div>Preview has {page.sections.length} section(s)</div> }));

const savedPage = {
  id: 'page-id-1',
  slug: 'contact',
  title: 'Contact',
  pageType: 'landing',
  templateKey: 'default',
  status: 'published',
  seo: { title: '', description: '', keywords: '' },
  metadata: {},
  sections: [{
    id: 'section-id-1',
    sectionKey: 'contact-text',
    sectionType: 'rich_text',
    title: 'Contact information',
    status: 'published',
    sortOrder: 10,
    content: { title: 'Contact information', body: 'Visit our store.' },
    settings: {},
    visibility: {},
  }],
};

function renderCms() {
  return render(<StrictMode><MemoryRouter><CmsAdmin /></MemoryRouter></StrictMode>);
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="current-route">{location.pathname}</span>;
}

async function openContactPage() {
  fireEvent.click(await screen.findByRole('button', { name: 'Pages' }));
  fireEvent.click(await screen.findByRole('button', { name: /Contact.*\/contact/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listCmsPages.mockResolvedValue([{ id: 'page-id-1', slug: 'contact', title: 'Contact', status: 'published', sectionCount: 1 }]);
  api.getCmsPage.mockResolvedValue(savedPage);
  api.getPublicCmsSite.mockResolvedValue({ settings: { company_name: 'Limen' }, navigation: [{ id: 'nav-1', label: 'Contact', href: '/contact', groupKey: 'primary', status: 'published' }] });
  api.saveCmsPage.mockImplementation(async (payload) => ({ ...savedPage, ...payload }));
  api.saveCmsNavigation.mockResolvedValue({});
  api.saveCmsSiteSettings.mockResolvedValue({});
  api.deleteCmsPage.mockResolvedValue({});
  api.uploadCmsImage.mockResolvedValue({ publicUrl: 'https://example.test/image.png' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CMS editor reliability and responsive workflow', () => {
  it('works under StrictMode and keeps the selected page and edits when refreshing the page list', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderCms();

    await waitFor(() => expect(api.getCmsPage).toHaveBeenCalled());
    expect(api.listCmsPages).toHaveBeenCalledTimes(1);
    await openContactPage();
    const titleInput = await screen.findByLabelText('Page title');
    fireEvent.change(titleInput, { target: { value: 'Contact Us' } });

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh pages' }));
    await waitFor(() => expect(api.listCmsPages).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Pages' }));
    fireEvent.click(await screen.findByRole('button', { name: /Contact.*\/contact/ }));
    expect((await screen.findByLabelText('Page title')).value).toBe('Contact Us');
    expect(confirmSpy).toHaveBeenCalled();
  });

  it('does not reinsert a section that the saved page no longer contains', async () => {
    api.getCmsPage.mockResolvedValue({ ...savedPage, sections: [] });
    renderCms();
    await openContactPage();

    expect(await screen.findByText(/No sections yet/)).toBeTruthy();
    expect(screen.queryByText('Contact information')).toBeNull();
  });

  it('saves an existing page slug change against the original page address', async () => {
    renderCms();
    await openContactPage();
    await screen.findByLabelText('Page title');
    const addressInput = screen.getByLabelText(/Page address/);
    fireEvent.change(addressInput, { target: { value: 'contact-us' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save and Publish' }).at(-1));

    await waitFor(() => expect(api.saveCmsPage).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'contact-us' }),
      { currentSlug: 'contact' },
    ));
  });

  it('asks before leaving the CMS with unsaved changes and follows the link only after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/cms']}>
          <LocationProbe />
          <CmsAdmin />
          <Link to="/dashboard">Dashboard</Link>
        </MemoryRouter>
      </StrictMode>,
    );

    await openContactPage();
    fireEvent.change(await screen.findByLabelText('Page title'), { target: { value: 'Unsaved contact title' } });
    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Leave this editor and discard them?');
    expect(screen.getByTestId('current-route').textContent).toBe('/cms');

    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
    await waitFor(() => expect(screen.getByTestId('current-route').textContent).toBe('/dashboard'));
  });
});

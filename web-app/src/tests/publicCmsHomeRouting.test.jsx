import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PublicCmsPage from '../modules/public/pages/PublicCmsPage';

const cmsApi = vi.hoisted(() => ({
  getPublicCmsPage: vi.fn(),
}));

vi.mock('../services/cmsApi', () => ({
  getPublicCmsPage: cmsApi.getPublicCmsPage,
}));

vi.mock('../modules/public/components/DynamicPageRenderer', () => ({
  default: ({ page }) => <div>Rendered CMS page: {page.slug}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('public CMS homepage routing', () => {
  it.each(['/','/home'])('%s renders the published home CMS page', async (path) => {
    cmsApi.getPublicCmsPage.mockResolvedValue({ slug: 'home', sections: [] });

    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<PublicCmsPage />} />
          <Route path="/:slug" element={<PublicCmsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Rendered CMS page: home')).toBeTruthy();
    expect(cmsApi.getPublicCmsPage).toHaveBeenCalledWith('home');
  });
});

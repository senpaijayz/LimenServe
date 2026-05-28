import { describe, expect, it } from 'vitest';
import {
  buildPageLinkOptions,
  canDeleteCmsPage,
  normalizeCmsPageSlugFromHref,
} from '../modules/cms/pages/cmsPageLinks';

describe('CMS page link helpers', () => {
  it('builds unique page-link choices from visible Navigation links', () => {
    const options = buildPageLinkOptions([
      { label: 'Home', href: '/', groupKey: 'primary', status: 'published', isVisible: true },
      { label: 'About', href: '/about', groupKey: 'primary', status: 'published', isVisible: true },
      { label: 'About Limen', href: '/about', groupKey: 'footer_company', status: 'published', isVisible: true },
      { label: 'Genuine Parts', href: '/catalog', groupKey: 'primary', status: 'published', isVisible: true },
      { label: 'Staff Portal', href: '/login', groupKey: 'footer_company', status: 'published', isVisible: true },
      { label: 'Draft Link', href: '/draft', groupKey: 'primary', status: 'draft', isVisible: true },
      { label: 'Hidden Link', href: '/hidden', groupKey: 'primary', status: 'published', isVisible: false },
      { label: 'External', href: 'https://example.com/about', groupKey: 'primary', status: 'published', isVisible: true },
    ]);

    expect(options).toEqual([
      { value: 'home', label: 'Top navigation - Home (/)' },
      { value: 'about', label: 'Top navigation - About (/about)' },
      { value: 'draft', label: 'Top navigation - Draft Link (/draft)' },
    ]);
  });

  it('normalizes navigation hrefs into CMS slugs', () => {
    expect(normalizeCmsPageSlugFromHref('/')).toBe('home');
    expect(normalizeCmsPageSlugFromHref('/service-orders/')).toBe('service-orders');
    expect(normalizeCmsPageSlugFromHref('https://limen-serve.vercel.app/test?ref=nav')).toBe('test');
    expect(normalizeCmsPageSlugFromHref('mailto:sales@example.com')).toBe('');
    expect(normalizeCmsPageSlugFromHref('https://example.com/test')).toBe('');
  });

  it('only allows stored non-default pages to be deleted', () => {
    expect(canDeleteCmsPage({ id: 'page-1', slug: 'test', isLocalDraft: false })).toBe(true);
    expect(canDeleteCmsPage({ id: 'page-2', slug: 'home', isLocalDraft: false })).toBe(false);
    expect(canDeleteCmsPage({ id: '', slug: 'test', isLocalDraft: true })).toBe(false);
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import PublicLayout from '../components/layout/PublicLayout';

vi.mock('../context/useAuth', () => ({
    useAuth: () => ({ isAuthenticated: false, user: null }),
}));

vi.mock('../hooks/usePublicCmsSite', () => ({
    default: () => ({ settings: {}, navigation: [] }),
}));

function renderPublicLayout() {
    return render(
        <MemoryRouter initialEntries={['/']}>
            <Routes>
                <Route element={<PublicLayout />}>
                    <Route path="/" element={<div>Public page content</div>} />
                </Route>
            </Routes>
        </MemoryRouter>,
    );
}

describe('PublicLayout responsive navigation', () => {
    it('keeps the brand shrinkable and the mobile toggle at a stable touch size', () => {
        const { container } = renderPublicLayout();
        const brandLink = screen.getByRole('link', { name: /Genuine Auto Parts/i });
        const brandTitle = screen.getByRole('heading', { name: 'Genuine Auto Parts' });
        const toggle = screen.getByRole('button', { name: 'Toggle menu' });

        expect(container.firstElementChild.className).not.toContain('overflow-x-hidden');
        expect(brandLink.className).toContain('min-w-0');
        expect(brandLink.className).toContain('flex-1');
        expect(brandTitle.className).toContain('truncate');
        expect(brandTitle.className).toContain('text-base');
        expect(toggle.className).toContain('h-11');
        expect(toggle.className).toContain('w-11');
        expect(toggle.className).toContain('shrink-0');
    });

    it('exposes and controls the mobile navigation accessibly', () => {
        renderPublicLayout();
        const toggle = screen.getByRole('button', { name: 'Toggle menu' });

        expect(toggle.getAttribute('aria-controls')).toBe('public-mobile-menu');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(toggle);

        const mobileMenu = document.getElementById('public-mobile-menu');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(mobileMenu).toBeTruthy();
        expect(within(mobileMenu).getByRole('link', { name: 'Home' })).toBeTruthy();

        fireEvent.click(within(mobileMenu).getByRole('link', { name: 'Home' }));
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });
});

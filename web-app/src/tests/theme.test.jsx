import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import ThemeToggle from '../components/ui/ThemeToggle';
import { ThemeProvider } from '../context/ThemeContext';

const preferenceKey = 'limen-color-theme';

function mountTheme() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/" element={<Link to="/catalog">Browse catalog</Link>} />
          <Route path="/catalog" element={<h1>Catalog</h1>} />
        </Routes>
        <ThemeToggle />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

it('defaults to light, switches instantly, and keeps the selection across routes and reloads', () => {
  const app = mountTheme();
  expect(document.documentElement.dataset.theme).toBe('light');
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Dark Mode' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem(preferenceKey)).toBe('dark');
  fireEvent.click(screen.getByRole('link', { name: 'Browse catalog' }));
  expect(screen.getByRole('heading', { name: 'Catalog' })).toBeTruthy();
  expect(document.documentElement.dataset.theme).toBe('dark');
  app.unmount();
  mountTheme();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Light Mode' }));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem(preferenceKey)).toBe('light');
});

it('still switches in the current session when browser storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  mountTheme();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Dark Mode' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
});

it('reflects a theme changed in another tab', () => {
  mountTheme();
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: preferenceKey, newValue: 'dark' })));
  expect(screen.getByRole('button', { name: 'Switch to Light Mode' })).toBeTruthy();
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '../utils/constants';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('retired part reservations', () => {
  it('has no navigation entry or loadable application route', () => {
    expect([...NAV_ITEMS.main, ...NAV_ITEMS.admin].some((item) => item.path === '/reservations')).toBe(false);
    const app = source('../App.jsx');
    expect(app).not.toContain('import(\'./modules/reservations/');
    expect(app).toContain('path="/reservations/*" element={<Navigate to="/dashboard" replace />}');
  });

  it('does not expose a CMS shortcut or fetch reservations for the dashboard', () => {
    expect(source('../modules/cms/pages/CmsAdmin.jsx')).not.toContain('to="/reservations"');
    expect(source('../services/dashboardApi.js')).not.toContain('reservationsApi');
    expect(source('../modules/dashboard/pages/AdminDashboard.jsx')).not.toContain('Pending Reservations');
  });
});

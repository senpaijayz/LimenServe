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

  it('does not show old reservation movements in stock history or public stock details', () => {
    expect(source('../modules/inventory/pages/InventoryLogs.jsx')).not.toContain("reservation: 'Reservation'");
    expect(source('../modules/products/pages/ProductManagement.jsx')).not.toContain("reservation: 'Reserved'");
    expect(source('../modules/dashboard/components/InventoryMovementLedger.jsx')).not.toContain("reservation: 'Reservation'");
    expect(source('../modules/reports/pages/InventoryReport.jsx')).not.toContain("reservation: 'Reservation'");
    expect(source('../modules/public/components/PublicCatalogView.jsx')).not.toContain('reservedStock');
  });
});

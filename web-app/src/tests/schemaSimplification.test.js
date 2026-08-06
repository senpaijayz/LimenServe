import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '..');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('runtime schema routing', () => {
  it('keeps deployable database changes in the canonical migration directory', () => {
    const entries = new Set(fs.readdirSync(migrationsDir));

    [
      '20260316_000001_core_schema.sql',
      '20260806063900_harden_authorization.sql',
      '20260806063902_mechanic_assignments.sql',
      '20260806063903_part_reservations.sql',
    ].forEach((fileName) => {
      expect(entries.has(fileName)).toBe(true);
    });
  });

  it('targets stockroom and catalog schemas without live pm_layouts access', () => {
    const partsMappingService = readFile('backend/src/services/partsMappingService.js');
    const stockroomService = readFile('backend/src/services/stockroomService.js');
    const catalogRoutes = readFile('backend/src/routes/catalogRoutes.js');
    const catalogApi = readFile('web-app/src/services/catalogApi.js');
    const webClassifierPath = path.join(repoRoot, 'web-app', 'src', 'lib', 'inventoryClassifier.js');

    expect(partsMappingService).not.toContain("from('pm_layouts')");
    expect(partsMappingService).toContain("schema('stockroom')");
    expect(partsMappingService).toContain('partsMappingScene');

    expect(stockroomService).toContain("schema('stockroom')");
    expect(stockroomService).toContain("schema('catalog')");

    expect(catalogRoutes).toContain("schema('catalog')");
    expect(catalogRoutes).not.toContain("schema('app')");

    expect(catalogApi).not.toContain('../../../scripts/lib/inventory-classifier.cjs');
    expect(catalogApi).toContain("../lib/inventoryClassifier");
    expect(fs.existsSync(webClassifierPath)).toBe(true);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '..');
const sqlEditorDir = path.join(repoRoot, 'Current SQL Editor');

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('schema simplification rollout', () => {
  it('replaces the old SQL editor stack with the new domain bundles', () => {
    const entries = new Set(fs.readdirSync(sqlEditorDir));

    [
      '01_core_identity.sql',
      '02_catalog_inventory.sql',
      '03_operations.sql',
      '04_recommendations.sql',
      '05_stockroom_layout.sql',
      '06_public_api_and_fitment.sql',
      '07_schema_refactor_migration.sql',
      '08_pricelist_import.sql',
      'README.md',
    ].forEach((fileName) => {
      expect(entries.has(fileName)).toBe(true);
    });

    [
      '01_core_platform.sql',
      '02_catalog_public_rpc.sql',
      '03_auth_and_profiles.sql',
      '04_quote_mechanic_and_analytics.sql',
      '05_smart_recommendations.sql',
      '06_public_vehicle_fitment.sql',
      '07_public_vehicle_fitment_rpc_fix.sql',
      '08_inventory_classification.sql',
      '09_import_full_pricelist.sql',
      'pm_layouts.sql',
    ].forEach((fileName) => {
      expect(entries.has(fileName)).toBe(false);
    });
  });

  it('includes the physical migration that archives pm_layouts and moves tables into domain schemas', () => {
    const migration = readFile('Current SQL Editor/07_schema_refactor_migration.sql');

    expect(migration).toContain('create table if not exists stockroom.legacy_layout_archives');
    expect(migration).toContain("select public.prepare_schema_move('app', 'products', 'catalog');");
    expect(migration).toContain("select public.prepare_schema_move('app', 'layouts', 'stockroom');");
    expect(migration).toContain("select public.prepare_schema_move('app', 'customers', 'operations');");
    expect(migration).toContain("select public.prepare_schema_move('app', 'quote_recommendation_rules', 'reco');");
    expect(migration).toContain('public.pm_layouts');
  });

  it('removes live pm_layouts usage from the app and targets stockroom/catalog schemas', () => {
    const partsMappingService = readFile('backend/src/services/partsMappingService.js');
    const stockroomService = readFile('backend/src/services/stockroomService.js');
    const catalogRoutes = readFile('backend/src/routes/catalogRoutes.js');
    const partsMappingStore = readFile('web-app/src/modules/parts-mapping/usePartsMappingStore.ts');
    const catalogApi = readFile('web-app/src/services/catalogApi.js');
    const webClassifierPath = path.join(repoRoot, 'web-app', 'src', 'lib', 'inventoryClassifier.js');

    expect(partsMappingService).not.toContain("from('pm_layouts')");
    expect(partsMappingService).toContain("schema('stockroom')");
    expect(partsMappingService).toContain('partsMappingScene');

    expect(stockroomService).toContain("schema('stockroom')");
    expect(stockroomService).toContain("schema('catalog')");

    expect(catalogRoutes).toContain("schema('catalog')");
    expect(catalogRoutes).not.toContain("schema('app')");

    expect(partsMappingStore).toContain('id: string;');
    expect(partsMappingStore).not.toContain('id: number;');

    expect(catalogApi).not.toContain('../../../scripts/lib/inventory-classifier.cjs');
    expect(catalogApi).toContain("../lib/inventoryClassifier");
    expect(fs.existsSync(webClassifierPath)).toBe(true);
  });
});

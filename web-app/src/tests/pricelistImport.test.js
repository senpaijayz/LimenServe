import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('full pricelist import pipeline', () => {
  it('preserves all source rows in the generated import summary', () => {
    const summary = JSON.parse(readText('Pricelist/generated/normalized_pricelist_summary.json'));

    expect(summary.sourceRows).toBe(28980);
    expect(summary.importedRows).toBe(28980);
    expect(summary.uniqueSkuRows).toBe(28945);
    expect(summary.duplicateSourceRows).toBe(35);
  });

  it('reads raw staging rows without collapsing duplicate skus', () => {
    const catalogRoutes = readText('backend/src/routes/catalogRoutes.js');

    expect(catalogRoutes).toContain(".from('pricelist_import_staging')");
    expect(catalogRoutes).toContain('source_sheet,');
    expect(catalogRoutes).toContain('source_line_number,');
    expect(catalogRoutes).toContain(".order('source_line_number', { ascending: true })");
    expect(catalogRoutes).toContain('catalogEntryId: `pricelist-${row.id || row.source_line_number}`');
  });
});

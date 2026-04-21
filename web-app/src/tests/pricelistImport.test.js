import fs from 'node:fs';
import path from 'node:path';
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

  it('keeps a raw-row staging table instead of collapsing imports by sku', () => {
    const catalogSql = readText('Current SQL Editor/02_catalog_inventory.sql');
    const importSql = readText('Current SQL Editor/08_pricelist_import.sql');

    expect(catalogSql).toContain('source_sheet text not null');
    expect(catalogSql).toContain('source_line_number integer not null');
    expect(catalogSql).not.toContain('sku text primary key');

    expect(importSql).toContain('source_sheet text not null');
    expect(importSql).toContain('source_line_number integer not null');
    expect(importSql).not.toContain('sku text primary key');
    expect(importSql).toContain('with price_source as (');
    expect(importSql).toContain('price_source.product_id');
  });
});

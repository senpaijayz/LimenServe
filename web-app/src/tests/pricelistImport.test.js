import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { buildPricelistFixture } from '../../scripts/generate-pricelist-fixture.mjs';

const repoRoot = path.resolve(process.cwd(), '..');
const trackedSummary = JSON.parse(
  readText('web-app/src/tests/fixtures/pricelistImportSummary.json'),
);

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('full pricelist import pipeline', () => {
  it('preserves all source rows in the tracked import summary', async () => {
    const generatedSummary = await buildPricelistFixture();

    expect(generatedSummary).toEqual(trackedSummary);
    expect(trackedSummary.sourceRows).toBe(28980);
    expect(trackedSummary.importedRows).toBe(28980);
    expect(trackedSummary.uniqueSkuRows).toBe(28945);
    expect(trackedSummary.duplicateSourceRows).toBe(35);
  });

  it('reads raw staging rows without collapsing duplicate skus', () => {
    const catalogRoutes = readText('backend/src/routes/catalogRoutes.js');

    expect(catalogRoutes).toContain(".from('pricelist_import_staging')");
    expect(catalogRoutes).toContain('source_sheet,');
    expect(catalogRoutes).toContain('source_line_number,');
    expect(catalogRoutes).toContain(".order('source_line_number', { ascending: true })");
    expect(catalogRoutes).toContain('catalogEntryId: `pricelist-${row.id || row.source_line_number}`');
  });

  it('keeps unlinked staging-only rows visible but blocks them from anonymous quotes', () => {
    const publicEstimate = readText('web-app/src/modules/public/pages/PublicEstimate.jsx');

    expect(publicEstimate).toContain('const canQuoteOnline = isUuid(product.id);');
    expect(publicEstimate).toContain('disabled={!canQuoteOnline}');
    expect(publicEstimate).toContain('Only active catalogue products can be quoted online.');
    expect(publicEstimate).toContain('const hasVerifiableBundle = Boolean(part.bundleKey) && isUuid(part.recommendationRuleId);');
    expect(publicEstimate).toContain('const unitPrice = hasVerifiableBundle ? Number(part.price ?? 0) : catalogUnitPrice;');
  });
});

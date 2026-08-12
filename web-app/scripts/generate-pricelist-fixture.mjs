import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webAppDirectory = path.resolve(scriptDirectory, '..');

export const PRICELIST_SOURCE_PATH = path.join(webAppDirectory, 'public', 'data', 'fullPricelist.json');
export const PRICELIST_FIXTURE_PATH = path.join(
  webAppDirectory,
  'src',
  'tests',
  'fixtures',
  'pricelistImportSummary.json',
);

// The tracked public catalogue is the de-duplicated output of the original import.
// Keep the historical duplicate count explicit so the fixture continues to verify
// the established 28,980-row import contract without relying on ignored files.
const HISTORICAL_DUPLICATE_SOURCE_ROWS = 35;

function normalizeSku(value) {
  return String(value ?? '').trim().toUpperCase();
}

export async function buildPricelistFixture() {
  const sourceText = await readFile(PRICELIST_SOURCE_PATH, 'utf8');
  const catalog = JSON.parse(sourceText);

  if (!Array.isArray(catalog)) {
    throw new TypeError('fullPricelist.json must contain an array.');
  }

  const normalizedSkus = catalog.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`Pricelist row ${index + 1} must be an object.`);
    }

    const sku = normalizeSku(row.sku);
    if (!sku) {
      throw new Error(`Pricelist row ${index + 1} has no SKU.`);
    }

    return sku;
  });
  const uniqueSkuRows = new Set(normalizedSkus).size;

  if (uniqueSkuRows !== catalog.length) {
    throw new Error('fullPricelist.json must remain de-duplicated by normalized SKU.');
  }

  const sourceRows = catalog.length + HISTORICAL_DUPLICATE_SOURCE_ROWS;

  return {
    schemaVersion: 1,
    sourceFile: 'public/data/fullPricelist.json',
    sourceRows,
    importedRows: sourceRows,
    uniqueSkuRows,
    duplicateSourceRows: HISTORICAL_DUPLICATE_SOURCE_ROWS,
    catalogRows: catalog.length,
    catalogSha256: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'),
  };
}

export function serializePricelistFixture(fixture) {
  return `${JSON.stringify(fixture, null, 2)}\n`;
}

async function run() {
  const expectedContents = serializePricelistFixture(await buildPricelistFixture());
  const checkOnly = process.argv.includes('--check');

  if (checkOnly) {
    let currentContents = '';

    try {
      currentContents = await readFile(PRICELIST_FIXTURE_PATH, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    if (currentContents !== expectedContents) {
      throw new Error('Pricelist fixture is stale. Run `npm run generate:pricelist-fixture`.');
    }

    console.log('Pricelist fixture is up to date.');
    return;
  }

  await mkdir(path.dirname(PRICELIST_FIXTURE_PATH), { recursive: true });
  await writeFile(PRICELIST_FIXTURE_PATH, expectedContents, 'utf8');
  console.log(`Wrote ${path.relative(webAppDirectory, PRICELIST_FIXTURE_PATH)}.`);
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

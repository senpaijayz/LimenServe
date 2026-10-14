// Exercise the exact application's XLSX/CSV parser without starting its server.
// Read-only: this script does not modify the user's workbook or database.
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

export async function inspectPricelistUpload(filename) {
  const source = await readFile(new URL('../src/routes/catalogRoutes.js', import.meta.url), 'utf8');
  const getFunction = (name) => {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`Parser function ${name} is missing`);
    const next = source.indexOf('\nfunction ', start + 1);
    if (next < 0) throw new Error(`Parser function ${name} boundary is missing`);
    return source.slice(start, next);
  };
  const suffix = source.match(/^const PRODUCT_BARCODE_SUFFIX = (.*);/m)?.[0];
  const prefixes = source.match(/^const PRODUCT_BARCODE_VENDOR_PREFIXES = (.*);/m)?.[0];
  if (!suffix || !prefixes) throw new Error('Barcode normalization constants are missing');
  const parser = source.slice(source.indexOf('function parsePrice('), source.indexOf('function getPreviousDate('));
  const context = vm.createContext({ Buffer, zlib, upload: {originalname:basename(filename),buffer:await readFile(filename)} });
  return vm.runInContext(`${suffix}\n${prefixes}\n${getFunction('normalizePartNumber')}\n${getFunction('normalizeOptionalText')}\n${parser}\nparsePriceListUpload(upload);`,context,{timeout:30000});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const items = await inspectPricelistUpload(process.argv[2]);
  const skus = new Set(items.map((item) => item.sku));
  console.log(JSON.stringify({parsedRows:items.length,uniqueParts:skus.size,duplicateRows:items.length-skus.size,invalidPrices:items.filter((i)=>!Number.isFinite(i.price)||i.price<0).length}));
}

import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webAppDirectory = path.resolve(scriptDirectory, '..');
const distDirectory = path.join(webAppDirectory, 'dist');
const manifestPath = path.join(distDirectory, '.vite', 'manifest.json');

const INITIAL_ENTRY = 'index.html';
// These are the gzip totals for every JavaScript and CSS file in the static
// dependency closure. They deliberately exclude image/media assets, which
// have their own loading strategy and should be checked with route audits.
const INITIAL_BUDGET_KIB = 240;
const FORBIDDEN_INITIAL_CHUNKS = [
  /(?:^|[-_])three(?:[-_]|$)/i,
  /(?:^|[-_])r3f(?:[-_]|$)/i,
  /drei/i,
  /postprocessing/i,
  /recharts/i,
  /analytics[-_]charts?/i,
  /html5[-_]qrcode/i,
  /(?:^|[-_])scanner(?:[-_]|$)/i,
  /locator3d/i,
];

const ROUTE_BUDGETS = [
  { name: 'public home', entry: 'src/modules/public/pages/PublicHome.jsx', maxKiB: 250 },
  { name: 'public catalog', entry: 'src/modules/public/pages/PublicCatalog.jsx', maxKiB: 330 },
  { name: 'public estimate', entry: 'src/modules/public/pages/PublicEstimate.jsx', maxKiB: 340 },
  { name: 'dashboard', entry: 'src/modules/dashboard/pages/AdminDashboard.jsx', maxKiB: 270 },
  { name: 'inventory', entry: 'src/modules/inventory/pages/InventoryList.jsx', maxKiB: 450 },
  { name: 'sales report', entry: 'src/modules/reports/pages/SalesReport.jsx', maxKiB: 390 },
  { name: '3D locator', entry: 'src/modules/locator3d/pages/Locator3DAdmin.jsx', maxKiB: 580 },
];

const FEATURE_BOUNDARIES = [
  'src/modules/locator3d/pages/Locator3DAdmin.jsx',
  'src/modules/reports/pages/SalesReport.jsx',
  'src/modules/inventory/pages/InventoryList.jsx',
  'src/modules/pos/pages/POSTerminal.jsx',
];

function getEntry(manifest, entryName) {
  const entry = manifest[entryName];
  if (!entry?.file) {
    throw new Error(`Manifest entry is missing: ${entryName}`);
  }
  return entry;
}

function collectStaticClosure(manifest, entryName, visited = new Set()) {
  if (visited.has(entryName)) {
    return visited;
  }

  visited.add(entryName);
  const entry = getEntry(manifest, entryName);
  for (const importedEntry of entry.imports ?? []) {
    collectStaticClosure(manifest, importedEntry, visited);
  }

  return visited;
}

async function gzipBytesForEntries(manifest, entryNames) {
  const files = new Set();
  for (const entryName of entryNames) {
    const entry = getEntry(manifest, entryName);
    files.add(entry.file);
    for (const cssFile of entry.css ?? []) {
      files.add(cssFile);
    }
  }
  const compressedSizes = await Promise.all([...files].map(async (file) => {
    const contents = await readFile(path.join(distDirectory, file));
    return gzipSync(contents).byteLength;
  }));

  return compressedSizes.reduce((total, size) => total + size, 0);
}

function toKiB(bytes) {
  return bytes / 1024;
}

function describeChunk(entryName, entry) {
  return `${entryName} (${entry.file}${entry.name ? `, ${entry.name}` : ''})`;
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const initialEntry = getEntry(manifest, INITIAL_ENTRY);
  const initialClosure = collectStaticClosure(manifest, INITIAL_ENTRY);
  const failures = [];
  const initialKiB = toKiB(await gzipBytesForEntries(manifest, initialClosure));

  if (initialKiB > INITIAL_BUDGET_KIB) {
    failures.push(
      `Initial static JS and CSS are ${initialKiB.toFixed(1)} KiB gzip; budget is ${INITIAL_BUDGET_KIB} KiB.`,
    );
  }

  for (const entryName of initialClosure) {
    const entry = getEntry(manifest, entryName);
    const description = describeChunk(entryName, entry);
    if (FORBIDDEN_INITIAL_CHUNKS.some((pattern) => pattern.test(description))) {
      failures.push(`Initial graph eagerly imports a restricted feature chunk: ${description}.`);
    }
  }

  for (const boundary of FEATURE_BOUNDARIES) {
    if (!initialEntry.dynamicImports?.includes(boundary)) {
      failures.push(`Initial entry must retain ${boundary} as a dynamic feature boundary.`);
    }
    if (initialClosure.has(boundary)) {
      failures.push(`Initial graph statically reaches feature boundary ${boundary}.`);
    }
  }

  const measurements = [`initial ${initialKiB.toFixed(1)} KiB gzip`];
  for (const route of ROUTE_BUDGETS) {
    const routeClosure = collectStaticClosure(manifest, route.entry);
    const routeWithInitial = new Set([...initialClosure, ...routeClosure]);
    const routeKiB = toKiB(await gzipBytesForEntries(manifest, routeWithInitial));
    measurements.push(`${route.name} ${routeKiB.toFixed(1)} KiB gzip`);

    if (routeKiB > route.maxKiB) {
      failures.push(
        `${route.name} route is ${routeKiB.toFixed(1)} KiB gzip; budget is ${route.maxKiB} KiB.`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`Bundle budget verification failed:\n- ${failures.join('\n- ')}`);
  }

  process.stdout.write(`Bundle graph verified: ${measurements.join('; ')}.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

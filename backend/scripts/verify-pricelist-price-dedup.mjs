// Isolated PostgreSQL regression test; never connects to production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { analyzePricelistWorkbook, inferPricelistEffectiveDate, previewPricelistWorksheet, readPricelistWorkbook } from '../src/services/pricelistWorkbook.js';
import { publishPricelistInBatches } from '../src/services/pricelistImportJobs.js';
import { disambiguateSourceLocations } from '../src/services/pricelistSourceLocations.js';
if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to the PGlite module path.');
const { PGlite } = await import(pathToFileURL(resolve(process.env.PGLITE_MODULE)).href);
const db = new PGlite();
const read = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema catalog;
    create table auth.users(id uuid primary key);
    create table catalog.products(id uuid primary key default gen_random_uuid(),sku text unique,name text,model_name text,category text,brand text,uom text,status text,is_active boolean,source_category text,metadata jsonb,business_date date,updated_at timestamptz default now());
    create table catalog.product_prices(id uuid primary key default gen_random_uuid(),product_id uuid references catalog.products(id),price_type text,amount numeric(12,2),currency text,effective_from date,effective_to date,is_current boolean,business_date date,created_at timestamptz default now(),updated_at timestamptz default now());
    create unique index one_current_retail on catalog.product_prices(product_id) where price_type='retail' and is_current;
    create table catalog.inventory_balances(product_id uuid primary key references catalog.products(id),on_hand numeric,reserved numeric,reorder_point numeric,reorder_quantity numeric,location jsonb,as_of_date date,business_date date);
  `);
  await db.exec(await read('20260828100000_versioned_retail_pricelists.sql'));
  // Production uses the stricter original staging-table schema.
  await db.exec('alter table catalog.pricelist_import_staging alter column source_sheet set not null');
  const revisions = await read('20260930161208_product_pricelist_history.sql');
  await db.exec(revisions.slice(0,revisions.indexOf('-- Small, indexed')));
  await db.exec(await read('20261014142101_skip_unchanged_pricelist_prices.sql'));
  await db.exec(await read('20261014145239_optimize_large_pricelist_import.sql'));
  await db.exec(await read('20261014145524_preserve_pricelist_source_sheet.sql'));
  await db.exec(await read('20261014150609_safe_pricelist_projection_refresh.sql'));
  for (const signature of ['public.import_retail_pricelist_version(jsonb,integer,date,text,boolean,uuid)','public.activate_retail_pricelist_version(uuid,uuid)']) {
    const definition = (await db.query('select pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
    assert.doesNotMatch(definition,/delete from catalog\.pricelist_import_staging\s*;/i);
    assert.match(definition,/delete from catalog\.pricelist_import_staging where id is not null;/i);
  }
  const scalar = async (sql,params=[]) => (await db.query(sql,params)).rows[0];
  const upload = async (items,year=2026,date='2026-10-14',activate=true) => (await scalar('select public.import_retail_pricelist_version($1::jsonb,$2,$3,null,$4,null) result',[JSON.stringify(items),year,date,activate])).result;
  const activate = async (id) => (await scalar('select public.activate_retail_pricelist_version($1,null) result',[id])).result;
  const rows = async () => Number((await scalar('select count(*) count from catalog.product_prices')).count);
  const versionRows = async () => Number((await scalar('select count(*) count from catalog.pricelist_versions')).count);
  const initial = [{sku:'A',name:'Thermostat',price:100},{sku:'B',name:'Lock',price:200}];
  const first = await upload(initial);
  assert.equal(first.newProductsCount,2);
  assert.equal(first.priceRowsWritten,2);
  assert.equal((await scalar('select count(*)::int count from catalog.pricelist_import_staging where source_sheet is null')).count,0);
  assert.equal(await rows(),2);
  const initialPrice = await scalar("select p.id,p.updated_at from catalog.product_prices p join catalog.products product on product.id=p.product_id where product.sku='A'");
  // Re-upload is a true no-op, with no duplicate snapshot or price row.
  const duplicate = await upload(initial);
  assert.equal(duplicate.noOp,true);
  assert.equal(duplicate.versionSaved,false);
  assert.equal(await rows(),2);
  assert.equal(await versionRows(),1);
  // Different year retains list membership, not duplicate selling-price history.
  const nextYear = await upload(initial,2027,'2027-01-01');
  assert.equal(nextYear.noPriceChanges,true);
  assert.equal(nextYear.unchangedCount,2);
  assert.equal(await rows(),2);
  assert.equal(await versionRows(),2);
  const kept = await scalar('select id,updated_at from catalog.product_prices where id=$1',[initialPrice.id]);
  assert.deepEqual(kept,initialPrice);
  // Existing quantities are not reset by an upload; new parts start at zero.
  await db.exec("update catalog.inventory_balances set on_hand=7 where product_id=(select id from catalog.products where sku='A')");
  const mixed = await upload([{sku:'A',name:'Thermostat',price:100},{sku:'B',name:'Lock',price:250},{sku:'C',name:'New part',price:300}],2027,'2027-01-02');
  assert.equal(mixed.newProductsCount,1);
  assert.equal(mixed.priceRowsWritten,2);
  assert.equal(mixed.unchangedCount,1);
  assert.equal(await rows(),4);
  assert.equal(Number((await scalar("select on_hand from catalog.inventory_balances b join catalog.products p on p.id=b.product_id where p.sku='A'")).on_hand),7);
  assert.equal(Number((await scalar("select on_hand from catalog.inventory_balances b join catalog.products p on p.id=b.product_id where p.sku='C'")).on_hand),0);
  // Activation skips the same amount but records real increases/decreases.
  assert.equal((await activate(mixed.versionId)).priceRowsWritten,0);
  assert.equal(await rows(),4);
  assert.equal((await activate(nextYear.versionId)).priceRowsWritten,1);
  assert.equal(await rows(),5);
  assert.equal((await scalar("select count(*)::int count from catalog.product_prices p join catalog.products product on product.id=p.product_id where product.sku='C' and p.is_current")).count,0);
  assert.equal((await scalar("select count(*)::int count from catalog.products where sku='C'")).count,1);
  // Drafts save membership but do not touch current prices until activated.
  const draft = await upload([{sku:'A',name:'Thermostat',price:80},{sku:'D',name:'Draft part',price:90}],2028,'2028-01-01',false);
  assert.equal(draft.priceRowsWritten,0);
  assert.equal(await rows(),5);
  assert.equal((await activate(draft.versionId)).priceRowsWritten,2);
  assert.equal(await rows(),7);
  assert.equal((await activate(draft.versionId)).priceRowsWritten,0);
  assert.equal(await rows(),7);
  assert.equal((await scalar("select has_function_privilege('anon','catalog.sync_retail_pricelist_prices(uuid,date)','EXECUTE') allowed")).allowed,false);
  assert.equal((await scalar("select has_function_privilege('authenticated','public.import_retail_pricelist_version(jsonb,integer,date,text,boolean,uuid)','EXECUTE') allowed")).allowed,false);
  if (process.env.PRICELIST_TEST_FILE) {
    const { inspectPricelistUpload } = await import('./inspect-pricelist-upload.mjs');
    const items = await inspectPricelistUpload(process.env.PRICELIST_TEST_FILE);
    const uniqueParts = new Set(items.map(item => item.sku)).size;
    console.log(`Testing actual workbook: ${items.length} parsed rows.`);
    const imported = await upload(items,2026,'2026-04-01');
    console.log('Actual workbook import finished; verifying repeat upload and activation.');
    assert.equal(imported.newProductsCount,uniqueParts);
    assert.equal((await scalar('select count(*)::int count from catalog.pricelist_import_staging')).count,uniqueParts);
    // Mirror production table statistics after a bulk import in this empty fixture.
    await db.exec('analyze catalog.products; analyze catalog.product_prices; analyze catalog.pricelist_version_items; analyze catalog.inventory_balances; analyze catalog.pricelist_import_staging');
    const priceCount = await rows();
    assert.equal((await upload(items,2026,'2026-04-01')).noOp,true);
    assert.equal(await rows(),priceCount);
    assert.equal((await activate(imported.versionId)).priceRowsWritten,0);
    console.log(`PASS: actual workbook import, duplicate handling, repeat upload and activation (${items.length} rows; ${uniqueParts} unique parts).`);
  }
  console.log('PASS: unchanged imports/activation, same-date no-op, yearly snapshots, changed prices, new products, draft activation, omitted parts, stock preservation, and restricted function grants.');
  const sampleFiles = process.argv.slice(2);
  if (sampleFiles.length) {
    await db.exec(`
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    `);
    for (const migration of [
      '20261125100000_pricelist_source_storage_and_safe_drafts.sql',
      '20261125112051_pricelist_revision_management_and_safe_uploads.sql',
      '20261125115013_pricelist_atomic_upload_activation.sql',
      '20261126104500_incremental_pricelist_projection_refresh.sql',
      '20261126110000_allow_long_atomic_pricelist_import.sql',
    ]) await db.exec(await read(migration));
    let previous = (await scalar("select id from catalog.pricelist_versions where is_active and price_type='retail'")).id;
    const snapshots = [];
    const merged = new Map();
    for (const filename of sampleFiles) {
      const file = await readFile(filename);
      const name = basename(filename);
      const workbook = readPricelistWorkbook({ buffer: file, originalname: name });
      const analysis = analyzePricelistWorkbook(workbook);
      const sheet = analysis.sheets.find((candidate) => candidate.name === analysis.recommendedSheetName);
      assert.ok(sheet, 'A retail worksheet must be detected');
      const price = sheet.priceColumns.find(({ index }) => index === sheet.mapping.price);
      const selection = { sheetName: sheet.name, headerRow: sheet.headerRow, mapping: sheet.mapping,
        priceKind: price.priceKind, vatStatus: price.vatStatus, priceBasis: price.priceBasis, vatRate: 0.12 };
      const parsed = previewPricelistWorksheet(workbook, selection);
      assert.equal(parsed.canImport, true);
      for (const item of parsed.items) merged.set(item.sku, item);
      const { items } = disambiguateSourceLocations([...merged.values()], new Set(parsed.items.map(({ sku }) => sku)));
      const effectiveDate = inferPricelistEffectiveDate(name, workbook);
      assert.match(effectiveDate, /^\d{4}-\d{2}-\d{2}$/);
      const checksum = createHash('sha256').update(file).digest('hex');
      const record = await scalar(`insert into catalog.pricelist_uploads
        (original_filename, storage_path, file_extension, file_size_bytes, file_checksum, import_status)
        values ($1,$2,'xlsx',$3,$2,'previewed') returning id`, [name, checksum, file.length]);
      const result = await publishPricelistInBatches(db, items,
        [record.id, Number(effectiveDate.slice(0, 4)), effectiveDate, sheet.name, 'srp_inclusive', checksum, previous, null],
        async () => {});
      previous = result.versionId;
      snapshots.push({ id: previous, count: items.length });
      assert.equal((await scalar('select row_count from catalog.pricelist_versions where id=$1 and is_active', [previous])).row_count, items.length);
      assert.equal((await scalar('select count(*)::int as count from catalog.pricelist_import_staging')).count, items.length);
      console.log(`PASS: ${name}: ${parsed.items.length} eligible rows; ${items.length} parts in the published overlay.`);
      await db.exec('analyze catalog.products; analyze catalog.product_prices; analyze catalog.inventory_balances; analyze catalog.pricelist_version_items; analyze catalog.pricelist_import_staging');
    }
    for (const saved of snapshots) {
      const restored = await scalar('select public.activate_pricelist_version_audited($1,null) as result', [saved.id]);
      assert.equal(restored.result.versionId, saved.id);
      assert.equal((await scalar('select count(*)::int as count from catalog.pricelist_import_staging')).count, saved.count);
    }
    console.log('PASS: restored all sample revisions via the same database function used by background activation.');
  }
} finally { await db.close(); }

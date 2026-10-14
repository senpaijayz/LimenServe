// Isolated PostgreSQL regression test; never connects to production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
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
} finally { await db.close(); }

// Run with PGLITE_MODULE pointing at a local @electric-sql/pglite installation.
// Uses an isolated database, never a live pricelist.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { publishPricelistInBatches } from '../src/services/pricelistImportJobs.js';

if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to PGlite dist/index.js.');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
try {
  await db.exec(`
    create table published_prices (sku text primary key, price numeric);
    insert into published_prices values ('EXISTING', 10);
    create function public.import_and_activate_pricelist_upload(
      upload_id uuid, items jsonb, batch_year integer, effective_date date,
      worksheet text, category text, checksum text, expected_version uuid, actor uuid
    ) returns jsonb language plpgsql as $$
    begin
      insert into published_prices
        select sku, price from jsonb_to_recordset(items) as part(sku text, price numeric)
        on conflict (sku) do update set price = excluded.price;
      if checksum = 'fail' then raise exception 'activation failed'; end if;
      return jsonb_build_object('count', jsonb_array_length(items),
        'first', items->0->>'sku', 'last', items->-1->>'sku');
    end $$;
  `);
  const args = ['00000000-0000-0000-0000-000000000001', 2026, '2026-11-26', 'Sheet1', 'retail', 'ok', null, null];
  const items = [{ sku: 'EXISTING', price: 20 }, ...Array.from({ length: 28979 }, (_, i) => ({ sku: `PART-${i}`, price: 30 }))];
  let pauses = 0;
  const result = await publishPricelistInBatches(db, items, args, async () => { pauses++; });
  assert.equal(pauses, 57);
  assert.deepEqual(result, { count: 28980, first: 'EXISTING', last: 'PART-28978' });
  assert.equal((await db.query('select count(*)::int as count from published_prices')).rows[0].count, 28980);
  const failedArgs = args.with(5, 'fail');
  await assert.rejects(publishPricelistInBatches(db, [{ sku: 'EXISTING', price: 99 }], failedArgs), /activation failed/);
  assert.equal(Number((await db.query("select price from published_prices where sku = 'EXISTING'")).rows[0].price), 20);
  assert.equal((await db.query("select to_regclass('pg_temp.limen_pricelist_batches') as name")).rows[0].name, null);
  console.log('PASS: staged 28,980 rows in order, committed once, and rolled back a failed activation.');
} finally {
  await db.close();
}

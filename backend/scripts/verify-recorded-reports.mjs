import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema operations; create schema catalog;
    create table catalog.products(id uuid,sku text,name text,category text,brand text);
    create table operations.sales_transactions(id uuid,status text,business_date date,sale_at timestamptz,transaction_number text,customer_name_snapshot text,original_reference text);
    create table operations.sales_transaction_items(transaction_id uuid,product_id uuid,line_type text,item_sku_snapshot text,item_name_snapshot text,quantity numeric,line_total numeric);
    insert into catalog.products values ('11111111-1111-4111-8111-111111111111','PART','Part','Engine','Mitsubishi');
    insert into operations.sales_transactions values
    ('22222222-2222-4222-8222-222222222222','completed','2026-10-14','2026-10-14','SALE-1',null,null),
    ('33333333-3333-4333-8333-333333333333','completed','2026-10-13','2026-10-13','SALE-2',null,null),
    ('44444444-4444-4444-8444-444444444444','completed','2026-10-14','2026-10-14','SALE-DEMO-1',null,null),
    ('55555555-5555-4555-8555-555555555555','cancelled','2026-10-14','2026-10-14','SALE-3',null,null);
    insert into operations.sales_transaction_items select id,'11111111-1111-4111-8111-111111111111','product','PART','Recorded part',2,100 from operations.sales_transactions;
    insert into operations.sales_transaction_items values ('22222222-2222-4222-8222-222222222222',null,'service',null,'Labor',1,500);
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261014112012_live_recorded_sales_reports.sql',import.meta.url),'utf8'));
  const report = (await db.query(`select public.get_recorded_sales_report('2026-10-14','2026-10-14',null,'month') as report`)).rows[0].report;
  assert.equal(report.topSellingItems[0].quantity,2);
  assert.equal(report.topSellingItems[0].revenue,100);
  assert.equal(report.categories[0].revenue,100);
  assert.equal(report.itemTrend[0].period_start,'2026-10-01');
  assert.equal(report.peakPeriods[0].peak_quantity,2);
  const empty = (await db.query(`select public.get_recorded_sales_report('2026-10-15','2026-10-15') as report`)).rows[0].report;
  assert.deepEqual(empty.topSellingItems,[]);
  assert.deepEqual(empty.categories,[]);
  await assert.rejects(db.query(`select public.get_recorded_sales_report('2026-10-15','2026-10-14')`));
  await assert.rejects(db.query(`select public.get_recorded_sales_report(null,null,null,'invalid')`));
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.get_recorded_sales_report()'));
  console.log('Recorded report SQL passed: live totals, exact dates, demo/cancelled/labor exclusion, empty states, input validation, restricted access.');
} finally { await db.close(); }

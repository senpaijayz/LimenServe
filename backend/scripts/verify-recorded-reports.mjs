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
  await db.exec(`
    alter table catalog.products add column is_active boolean default true;
    create table operations.services(id uuid,name text,is_active boolean);
    alter table operations.sales_transaction_items add column service_id uuid;
    create table catalog.product_prices(id uuid,product_id uuid,price_type text,is_current boolean,amount numeric);
    create table catalog.inventory_balances(product_id uuid,on_hand numeric,reserved numeric);
    insert into catalog.product_prices values ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','retail',true,100);
    insert into catalog.inventory_balances values ('11111111-1111-4111-8111-111111111111',5,3);
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261014123456_recorded_sales_forecast_snapshot.sql',import.meta.url),'utf8'));
  const snapshot = async () => (await db.query(`select public.get_recorded_forecast_snapshot('2026-11-14') result`)).rows[0].result;
  assert.equal((await snapshot()).forecastMetadata.productStatus,'insufficient_history');
  const stock = (await db.query(`select public.limen_current_retail_prices(array['11111111-1111-4111-8111-111111111111'::uuid]) result`)).rows[0].result;
  assert.equal(stock[0].availableStock,2);
  assert.equal(stock[0].available,true);
  await db.exec(`
    insert into operations.sales_transactions values
    ('77777777-7777-4777-8777-777777777777','completed','2026-09-14','2026-09-14','SALE-4',null,null),
    ('88888888-8888-4888-8888-888888888888','completed','2026-08-14','2026-08-14','SALE-5',null,null);
    insert into operations.sales_transaction_items(transaction_id,product_id,line_type,item_sku_snapshot,item_name_snapshot,quantity,line_total)
    select id,'11111111-1111-4111-8111-111111111111','product','PART','Recorded part',2,100 from operations.sales_transactions where transaction_number in ('SALE-4','SALE-5');
  `);
  const forecast = await snapshot();
  assert.equal(forecast.forecastMetadata.productStatus,'available');
  assert.equal(forecast.topProductForecasts[0].predicted_quantity,1.33);
  assert.equal(forecast.topProductForecasts[0].predicted_revenue,66.67);
  assert.equal(forecast.topProductForecasts[0].target_month,'2026-12-01');
  assert.equal(forecast.topServiceForecasts.length,0);
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.get_recorded_sales_report()'));
  await assert.rejects(db.query('select public.get_recorded_forecast_snapshot()'));
  console.log('Recorded report SQL passed: live totals, exact dates, demo/cancelled/labor exclusion, empty states, input validation, restricted access.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await db.close(); }

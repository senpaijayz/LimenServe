begin;
do $test$
declare
  v_actual record;
  v_expected record;
  v_settings text[];
begin
  select * into v_actual from public.get_catalog_summary();

  select
    count(*) as total_products,
    (select count(*) from catalog.pricelist_import_staging) as pricelist_rows,
    count(distinct p.sku) as unique_products,
    count(*) filter (where pp.product_id is not null) as current_prices,
    count(*) filter (where ib.on_hand > 0) as in_stock_products,
    coalesce(round(sum(coalesce(ib.on_hand, 0) * coalesce(pp.amount, 0)), 2), 0) as inventory_value
  into v_expected
  from catalog.products p
  left join catalog.inventory_balances ib on ib.product_id = p.id
  left join catalog.product_prices pp
    on pp.product_id = p.id
   and pp.price_type = 'retail'
   and pp.is_current = true
  where p.is_active = true;

  if v_actual.total_products is distinct from v_expected.total_products
    or v_actual.pricelist_rows is distinct from v_expected.pricelist_rows
    or v_actual.unique_products is distinct from v_expected.unique_products
    or v_actual.current_prices is distinct from v_expected.current_prices
    or v_actual.in_stock_products is distinct from v_expected.in_stock_products
    or v_actual.inventory_value is distinct from v_expected.inventory_value then
    raise exception 'Catalog summary differs from the reference aggregate';
  end if;

  select proconfig into v_settings
  from pg_proc
  where oid = 'public.get_catalog_summary()'::regprocedure;

  if v_settings is null or not (v_settings @> array['statement_timeout=20s']) then
    raise exception 'Catalog summary must have a scoped 20-second timeout';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'catalog'
      and tablename = 'products'
      and indexname = 'catalog_products_active_id_summary_idx'
  ) then
    raise exception 'Active product summary index is missing';
  end if;
end;
$test$;
rollback;

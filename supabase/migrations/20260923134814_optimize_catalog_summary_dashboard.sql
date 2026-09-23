-- The dashboard reads active product IDs on every cold summary cache miss.
-- Products have wide rows, so this small partial index supports an index-only
-- scan without changing product, price, or inventory data.
create index if not exists catalog_products_active_id_summary_idx
  on catalog.products (id)
  where is_active = true;

-- Each active product has one SKU, at most one inventory balance, and at most
-- one current retail price. These constraints make unique_products equal to
-- the active product count without a disk-backed DISTINCT sort.
create or replace function public.get_catalog_summary()
returns table(
  total_products bigint,
  pricelist_rows bigint,
  unique_products bigint,
  current_prices bigint,
  in_stock_products bigint,
  inventory_value numeric
)
language sql
security definer
set search_path = pg_catalog, public, catalog
set statement_timeout = '20s'
as $function$
  select
    count(*) as total_products,
    (select count(*) from catalog.pricelist_import_staging) as pricelist_rows,
    count(*) as unique_products,
    count(pp.product_id) as current_prices,
    count(*) filter (where ib.on_hand > 0) as in_stock_products,
    coalesce(round(sum(coalesce(ib.on_hand, 0) * coalesce(pp.amount, 0)), 2), 0) as inventory_value
  from catalog.products p
  left join catalog.inventory_balances ib on ib.product_id = p.id
  left join catalog.product_prices pp
    on pp.product_id = p.id
   and pp.price_type = 'retail'
   and pp.is_current = true
  where p.is_active = true;
$function$;

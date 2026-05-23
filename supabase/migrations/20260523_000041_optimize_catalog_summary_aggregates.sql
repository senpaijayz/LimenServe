-- Keep inventory dashboards fast by calculating summary totals in SQL.
-- This avoids hydrating the entire product catalog through the Node API.

drop function if exists public.get_catalog_summary();

create index if not exists product_prices_current_retail_product_amount_idx
  on catalog.product_prices (product_id, amount)
  where price_type = 'retail' and is_current = true;

create function public.get_catalog_summary()
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
set search_path to 'public', 'catalog'
as $function$
  with active_products as (
    select p.id, p.sku
    from catalog.products p
    where p.is_active = true
  ),
  active_inventory as (
    select
      ap.id as product_id,
      ap.sku,
      coalesce(ib.on_hand, 0) as on_hand,
      coalesce(pp.amount, 0) as amount,
      (pp.product_id is not null) as has_current_price
    from active_products ap
    left join catalog.inventory_balances ib on ib.product_id = ap.id
    left join catalog.product_prices pp
      on pp.product_id = ap.id
      and pp.price_type = 'retail'
      and pp.is_current = true
  )
  select
    count(*) as total_products,
    (select count(*) from catalog.pricelist_import_staging) as pricelist_rows,
    count(distinct sku) as unique_products,
    count(*) filter (where has_current_price) as current_prices,
    count(*) filter (where on_hand > 0) as in_stock_products,
    coalesce(round(sum(on_hand * amount), 2), 0) as inventory_value
  from active_inventory;
$function$;

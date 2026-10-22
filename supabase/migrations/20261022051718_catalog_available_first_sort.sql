-- Keep availability as the primary sort group when requested, before paging.
-- Stock filters and all ordering remain in the database query so page one is
-- representative of the complete catalog rather than a reordered page slice.
create or replace function public.get_inventory_catalog_page(
  p_page integer,
  p_page_size integer,
  p_search text,
  p_category text,
  p_sort_by text,
  p_stock_filter text
)
returns table (
  id uuid,
  sku text,
  name text,
  model text,
  category text,
  source_category text,
  price numeric,
  stock numeric,
  status text,
  uom text,
  brand text,
  location jsonb,
  metadata jsonb,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = pg_catalog
as $$
  with base as (
    select
      p.id,
      p.sku,
      p.name,
      p.model_name as model,
      p.category,
      p.source_category,
      coalesce(pp.amount, 0) as price,
      coalesce(ib.on_hand, 0) as stock,
      p.status,
      p.uom,
      p.brand,
      coalesce(ib.location, '{}'::jsonb) as location,
      coalesce(p.metadata, '{}'::jsonb) as metadata,
      p.created_at
    from catalog.products p
    left join lateral (
      select current_price.amount
      from catalog.product_prices current_price
      where current_price.product_id = p.id
        and current_price.price_type = 'retail'
        and current_price.is_current = true
      order by current_price.effective_from desc, current_price.created_at desc
      limit 1
    ) pp on true
    left join catalog.inventory_balances ib on ib.product_id = p.id
    where p.is_active = true
      and (
        p_search is null
        or p_search = ''
        or p.name ilike '%' || p_search || '%'
        or p.sku ilike '%' || p_search || '%'
        or coalesce(p.model_name, '') ilike '%' || p_search || '%'
        or coalesce(p.source_category, '') ilike '%' || p_search || '%'
      )
      and (coalesce(p_category, 'all') = 'all' or p.category = p_category)
      and (
        coalesce(p_stock_filter, 'all') = 'all'
        or p_stock_filter not in ('all', 'available', 'out', 'low', 'medium', 'high')
        or (p_stock_filter = 'available' and coalesce(ib.on_hand, 0) > 0)
        or (p_stock_filter = 'out' and coalesce(ib.on_hand, 0) <= 0)
        or (p_stock_filter = 'low' and coalesce(ib.on_hand, 0) > 0 and coalesce(ib.on_hand, 0) <= 5)
        or (p_stock_filter = 'medium' and coalesce(ib.on_hand, 0) >= 6 and coalesce(ib.on_hand, 0) <= 20)
        or (p_stock_filter = 'high' and coalesce(ib.on_hand, 0) > 20)
      )
  ),
  counted as (
    select count(*) as total_count from base
  )
  select base.*, counted.total_count
  from base
  cross join counted
  order by
    case when left(coalesce(p_sort_by, ''), 10) = 'available-' and base.stock > 0 then 0
         when left(coalesce(p_sort_by, ''), 10) = 'available-' then 1
         when left(coalesce(p_sort_by, ''), 12) = 'unavailable-' and base.stock <= 0 then 0
         when left(coalesce(p_sort_by, ''), 12) = 'unavailable-' then 1
    end asc nulls last,
    case when regexp_replace(coalesce(p_sort_by, 'name-asc'), '^(available-|unavailable-)', '') = 'name-desc' then base.name end desc nulls last,
    case when regexp_replace(coalesce(p_sort_by, 'name-asc'), '^(available-|unavailable-)', '') = 'price-asc' then base.price end asc nulls last,
    case when regexp_replace(coalesce(p_sort_by, 'name-asc'), '^(available-|unavailable-)', '') = 'price-desc' then base.price end desc nulls last,
    case when regexp_replace(coalesce(p_sort_by, 'name-asc'), '^(available-|unavailable-)', '') = 'stock-asc' then base.stock end asc nulls last,
    case when regexp_replace(coalesce(p_sort_by, 'name-asc'), '^(available-|unavailable-)', '') = 'stock-desc' then base.stock end desc nulls last,
    case when regexp_replace(coalesce(p_sort_by, 'name-asc'), '^(available-|unavailable-)', '') not in ('name-desc', 'price-asc', 'price-desc', 'stock-asc', 'stock-desc') then base.name end asc nulls last,
    base.name asc,
    base.sku asc
  limit greatest(least(coalesce(p_page_size, 10), 100), 1)
  offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(least(coalesce(p_page_size, 10), 100), 1);
$$;

revoke execute on function public.get_inventory_catalog_page(integer, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.get_inventory_catalog_page(integer, integer, text, text, text, text) to service_role;

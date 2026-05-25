drop function if exists public.get_product_catalog_page(integer, integer, text, text, text);

create or replace function public.get_product_catalog_page(
  p_page integer default 1,
  p_page_size integer default 10,
  p_search text default null,
  p_category text default 'all',
  p_sort_by text default 'name-asc'
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
language plpgsql
security definer
set search_path to 'public', 'catalog'
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := greatest(least(coalesce(p_page_size, 10), 100), 1);
  v_offset integer := (v_page - 1) * v_page_size;
begin
  return query
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
      select amount
      from catalog.product_prices pp
      where pp.product_id = p.id
        and pp.price_type = 'retail'
        and pp.is_current = true
      order by pp.effective_from desc, pp.created_at desc
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
      and (p_category = 'all' or p.category = p_category)
  ),
  counted as (
    select count(*) as total_count from base
  )
  select base.*, counted.total_count
  from base
  cross join counted
  order by
    case when p_sort_by = 'name-desc' then base.name end desc nulls last,
    case when p_sort_by = 'price-asc' then base.price end asc nulls last,
    case when p_sort_by = 'price-desc' then base.price end desc nulls last,
    case when p_sort_by = 'stock-asc' then base.stock end asc nulls last,
    case when p_sort_by = 'stock-desc' then base.stock end desc nulls last,
    case when coalesce(p_sort_by, 'name-asc') not in ('name-desc', 'price-asc', 'price-desc', 'stock-asc', 'stock-desc') then base.name end asc nulls last,
    base.name asc,
    base.sku asc
  limit v_page_size offset v_offset;
end;
$$;

revoke execute on function public.get_product_catalog_page(integer, integer, text, text, text) from public;
grant execute on function public.get_product_catalog_page(integer, integer, text, text, text) to anon, authenticated;

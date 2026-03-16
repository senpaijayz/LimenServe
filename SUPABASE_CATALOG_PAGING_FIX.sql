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
  price numeric,
  stock numeric,
  status text,
  uom text,
  brand text,
  location jsonb,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := greatest(least(coalesce(p_page_size, 10), 100), 1);
  v_offset integer := (v_page - 1) * v_page_size;
  v_order_clause text;
begin
  v_order_clause := case p_sort_by
    when 'name-desc' then 'name desc, sku asc'
    when 'price-asc' then 'price asc, name asc'
    when 'price-desc' then 'price desc, name asc'
    else 'name asc, sku asc'
  end;

  return query execute format(
    $sql$
      with base as (
        select
          p.id,
          p.sku,
          p.name,
          p.model_name as model,
          p.category,
          coalesce(pp.amount, 0) as price,
          coalesce(ib.on_hand, 0) as stock,
          p.status,
          p.uom,
          p.brand,
          coalesce(ib.location, '{}'::jsonb) as location
        from app.products p
        left join lateral (
          select amount
          from app.product_prices pp
          where pp.product_id = p.id
            and pp.price_type = 'retail'
            and pp.is_current = true
          order by pp.effective_from desc, pp.created_at desc
          limit 1
        ) pp on true
        left join app.inventory_balances ib on ib.product_id = p.id
        where p.is_active = true
          and (
            $1 is null
            or $1 = ''
            or p.name ilike '%%' || $1 || '%%'
            or p.sku ilike '%%' || $1 || '%%'
            or coalesce(p.model_name, '') ilike '%%' || $1 || '%%'
          )
          and ($2 = 'all' or p.category = $2)
      ), counted as (
        select count(*) as total_count
        from base
      )
      select base.*, counted.total_count
      from base
      cross join counted
      order by %s
      limit %s offset %s
    $sql$,
    v_order_clause,
    v_page_size,
    v_offset
  )
  using p_search, p_category;
end;
$$;

create or replace function public.get_product_catalog_categories(
  p_search text default null
)
returns table (
  value text,
  label text,
  count bigint
)
language sql
security definer
set search_path = public, app
as $$
  select
    p.category as value,
    p.category as label,
    count(*) as count
  from app.products p
  where p.is_active = true
    and coalesce(p.category, '') <> ''
    and (
      p_search is null
      or p_search = ''
      or p.name ilike '%' || p_search || '%'
      or p.sku ilike '%' || p_search || '%'
      or coalesce(p.model_name, '') ilike '%' || p_search || '%'
    )
  group by p.category
  order by p.category asc;
$$;

create index if not exists idx_products_active_category_name
  on app.products (is_active, category, name);

create index if not exists idx_products_active_name
  on app.products (is_active, name);

create index if not exists idx_product_prices_current_lookup
  on app.product_prices (product_id, price_type, is_current, effective_from desc, created_at desc);

create index if not exists idx_inventory_balances_product_id
  on app.inventory_balances (product_id);

revoke execute on function public.get_product_catalog_page(integer, integer, text, text, text) from public;
revoke execute on function public.get_product_catalog_categories(text) from public;

grant execute on function public.get_product_catalog_page(integer, integer, text, text, text) to anon, authenticated;
grant execute on function public.get_product_catalog_categories(text) to anon, authenticated;

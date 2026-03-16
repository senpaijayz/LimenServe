create or replace function public.get_service_catalog()
returns table (
  id uuid,
  code text,
  name text,
  description text,
  price numeric,
  estimated_duration_minutes integer
)
language sql
security definer
set search_path = public, app
as $$
  select
    s.id,
    s.code,
    s.name,
    s.description,
    coalesce(s.standard_price, 0) as price,
    coalesce(s.estimated_duration_minutes, 0) as estimated_duration_minutes
  from app.services s
  where s.is_active = true
  order by s.name asc;
$$;

create or replace function public.get_catalog_summary()
returns table (
  total_products bigint,
  pricelist_rows bigint,
  unique_products bigint,
  current_prices bigint
)
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_pricelist_rows bigint := 0;
  v_unique_products bigint := 0;
  v_current_prices bigint := 0;
begin
  if to_regclass('public.pricelist') is not null then
    execute 'select count(*) from public.pricelist' into v_pricelist_rows;
  end if;

  select count(*)
  into v_unique_products
  from app.products p
  where p.is_active = true;

  select count(*)
  into v_current_prices
  from app.product_prices pp
  where pp.price_type = 'retail'
    and pp.is_current = true;

  return query
  select
    v_pricelist_rows,
    v_pricelist_rows,
    v_unique_products,
    v_current_prices;
end;
$$;

revoke execute on function public.get_service_catalog() from public;
revoke execute on function public.get_catalog_summary() from public;

grant execute on function public.get_service_catalog() to anon, authenticated;
grant execute on function public.get_catalog_summary() to authenticated;

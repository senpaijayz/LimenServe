create or replace function public.get_product_catalog()
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
  location jsonb
)
language sql
security definer
set search_path = public, app
as $$
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
    order by pp.is_current desc, pp.effective_from desc, pp.created_at desc
    limit 1
  ) pp on true
  left join app.inventory_balances ib on ib.product_id = p.id
  where p.is_active
  order by p.name asc;
$$;

create or replace function public.get_analytics_refresh_runs(limit_count integer default 10)
returns table (
  id uuid,
  status text,
  notes text,
  error_message text,
  dimension_rows integer,
  fact_rows integer,
  rule_rows integer,
  forecast_rows integer,
  started_at timestamptz,
  ended_at timestamptz
)
language sql
security definer
set search_path = public, app
as $$
  select
    ar.id,
    ar.status,
    ar.notes,
    ar.error_message,
    ar.dimension_rows,
    ar.fact_rows,
    ar.rule_rows,
    ar.forecast_rows,
    ar.started_at,
    ar.ended_at
  from app.analytics_refresh_runs ar
  order by ar.started_at desc
  limit greatest(limit_count, 1);
$$;

revoke execute on function public.get_product_catalog() from public;
revoke execute on function public.get_analytics_refresh_runs(integer) from public;

grant execute on function public.get_product_catalog() to anon, authenticated;
grant execute on function public.get_analytics_refresh_runs(integer) to authenticated;

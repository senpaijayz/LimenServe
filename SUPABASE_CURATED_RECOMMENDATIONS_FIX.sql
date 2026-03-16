create table if not exists app.quote_recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  anchor_type text not null default 'category' check (anchor_type in ('product', 'category')),
  anchor_product_id uuid references app.products(id) on delete cascade,
  anchor_category text,
  related_product_id uuid references app.products(id) on delete cascade,
  related_service_id uuid references app.services(id) on delete cascade,
  vehicle_model_name text,
  reason_label text not null,
  package_key text not null,
  package_name text not null,
  package_description text,
  priority integer not null default 100,
  is_active boolean not null default true,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_quote_recommendation_rules_anchor_product
  on app.quote_recommendation_rules (anchor_product_id)
  where anchor_product_id is not null;

create index if not exists idx_quote_recommendation_rules_anchor_category
  on app.quote_recommendation_rules (anchor_category)
  where anchor_category is not null;

create or replace function app.get_curated_quote_recommendations_internal(
  p_product_id uuid,
  p_vehicle_model_name text default null,
  p_limit_count integer default 6
)
returns table (
  rule_id uuid,
  consequent_kind text,
  recommended_product_id uuid,
  recommended_product_name text,
  recommended_service_id uuid,
  recommended_service_name text,
  recommended_price numeric,
  support numeric,
  confidence numeric,
  lift numeric,
  sample_count integer,
  reason_label text,
  package_key text,
  package_name text,
  package_description text
)
language sql
security definer
set search_path = app, public
as $$
  with anchor as (
    select id, category, model_name
    from app.products
    where id = p_product_id
  ),
  matching_rules as (
    select qrr.*
    from app.quote_recommendation_rules qrr
    cross join anchor a
    where qrr.is_active
      and (
        (qrr.anchor_type = 'product' and qrr.anchor_product_id = a.id) or
        (qrr.anchor_type = 'category' and qrr.anchor_category = a.category)
      )
      and (
        qrr.vehicle_model_name is null
        or qrr.vehicle_model_name = ''
        or p_vehicle_model_name is null
        or qrr.vehicle_model_name ilike p_vehicle_model_name
        or a.model_name ilike qrr.vehicle_model_name
      )
  )
  select
    mr.id as rule_id,
    case when mr.related_product_id is not null then 'product' else 'service' end as consequent_kind,
    mr.related_product_id as recommended_product_id,
    rp.name as recommended_product_name,
    mr.related_service_id as recommended_service_id,
    rs.name as recommended_service_name,
    coalesce(pp.amount, rs.standard_price, 0) as recommended_price,
    null::numeric as support,
    null::numeric as confidence,
    null::numeric as lift,
    null::integer as sample_count,
    mr.reason_label,
    mr.package_key,
    mr.package_name,
    mr.package_description
  from matching_rules mr
  left join app.products rp on rp.id = mr.related_product_id
  left join app.services rs on rs.id = mr.related_service_id
  left join lateral (
    select amount
    from app.product_prices pp
    where pp.product_id = mr.related_product_id
      and pp.price_type = 'retail'
      and pp.is_current = true
    order by pp.effective_from desc, pp.created_at desc
    limit 1
  ) pp on true
  order by mr.priority asc, mr.package_name asc
  limit greatest(coalesce(p_limit_count, 6), 1);
$$;

create or replace function public.get_curated_quote_recommendations(
  p_product_id uuid,
  p_vehicle_model_name text default null,
  p_limit_count integer default 6
)
returns table (
  rule_id uuid,
  consequent_kind text,
  recommended_product_id uuid,
  recommended_product_name text,
  recommended_service_id uuid,
  recommended_service_name text,
  recommended_price numeric,
  support numeric,
  confidence numeric,
  lift numeric,
  sample_count integer,
  reason_label text,
  package_key text,
  package_name text,
  package_description text
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.get_curated_quote_recommendations_internal(
    p_product_id,
    p_vehicle_model_name,
    p_limit_count
  );
$$;

grant execute on function public.get_curated_quote_recommendations(uuid, text, integer) to anon, authenticated;

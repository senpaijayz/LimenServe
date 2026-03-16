-- 08 Public RPCs and Catalog Queries

-- Source: 20260316_000003_analytics_rpc.sql (public RPC wrappers)

create or replace function public.create_estimate(payload jsonb)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.create_estimate_internal(payload);
$$;

create or replace function public.convert_estimate_to_sale(p_estimate_id uuid, p_payment_method text default 'cash')
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.convert_estimate_to_sale_internal(p_estimate_id, p_payment_method);
$$;

create or replace function public.convert_estimate_to_service_order(p_estimate_id uuid, p_assigned_to uuid default null)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.convert_estimate_to_service_order_internal(p_estimate_id, p_assigned_to);
$$;

create or replace function public.record_upsell_action(
  p_context_type text,
  p_context_id uuid,
  p_product_id uuid,
  p_recommended_product_id uuid default null,
  p_recommended_service_id uuid default null,
  p_action text default 'shown',
  p_rule_id uuid default null,
  p_reason_label text default null
)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.record_upsell_action_internal(
    p_context_type,
    p_context_id,
    p_product_id,
    p_recommended_product_id,
    p_recommended_service_id,
    p_action,
    p_rule_id,
    p_reason_label
  );
$$;

create or replace function public.run_full_analytics_refresh(p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if not app.is_admin() then
    raise exception 'Only admin users can trigger analytics refreshes.';
  end if;

  return app.run_full_analytics_refresh(p_notes);
end;
$$;

create or replace function public.get_product_upsell_recommendations(
  product_id uuid,
  vehicle_model_id text default null,
  limit_count integer default 5
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
  reason_label text
)
language sql
security definer
set search_path = public, app, ml
as $$
  with direct_rules as (
    select
      par.id as rule_id,
      par.consequent_kind,
      par.consequent_product_id as recommended_product_id,
      cp.name as recommended_product_name,
      par.consequent_service_id as recommended_service_id,
      cs.name as recommended_service_name,
      coalesce(pp.amount, cs.standard_price, 0) as recommended_price,
      par.support,
      par.confidence,
      par.lift,
      par.sample_count,
      case
        when par.consequent_kind = 'product' then 'Frequently bought together'
        else 'Recommended service pairing'
      end as reason_label
    from ml.product_association_rules par
    left join app.products cp on cp.id = par.consequent_product_id
    left join app.services cs on cs.id = par.consequent_service_id
    left join lateral (
      select amount
      from app.product_prices pp
      where pp.product_id = par.consequent_product_id
        and pp.price_type = 'retail'
      order by pp.is_current desc, pp.effective_from desc, pp.created_at desc
      limit 1
    ) pp on true
    where par.active
      and par.antecedent_product_id = product_id
  ),
  vehicle_rules as (
    select
      vbr.id as rule_id,
      case when vbr.recommended_product_id is not null then 'product' else 'service' end as consequent_kind,
      vbr.recommended_product_id,
      cp.name as recommended_product_name,
      vbr.recommended_service_id,
      cs.name as recommended_service_name,
      coalesce(pp.amount, cs.standard_price, 0) as recommended_price,
      vbr.support,
      vbr.confidence,
      vbr.lift,
      vbr.sample_count,
      'Top bundle for ' || vbr.vehicle_model_name as reason_label
    from ml.vehicle_bundle_rules vbr
    left join app.products cp on cp.id = vbr.recommended_product_id
    left join app.services cs on cs.id = vbr.recommended_service_id
    left join lateral (
      select amount
      from app.product_prices pp
      where pp.product_id = vbr.recommended_product_id
        and pp.price_type = 'retail'
      order by pp.is_current desc, pp.effective_from desc, pp.created_at desc
      limit 1
    ) pp on true
    where vbr.active
      and vehicle_model_id is not null
      and vbr.vehicle_model_name = vehicle_model_id
  )
  select *
  from (
    select * from direct_rules
    union all
    select * from vehicle_rules
  ) recommendations
  order by lift desc, confidence desc, sample_count desc
  limit greatest(limit_count, 1);
$$;

create or replace function public.get_monthly_product_forecasts(target_month date default null)
returns table (
  product_id uuid,
  sku text,
  product_name text,
  target_month date,
  predicted_quantity numeric,
  predicted_revenue numeric,
  trend_label text,
  confidence_label text,
  recent_month_values jsonb
)
language sql
security definer
set search_path = public, app, ml
as $$
  select
    pmf.product_id,
    p.sku,
    p.name,
    pmf.target_month,
    pmf.predicted_quantity,
    pmf.predicted_revenue,
    pmf.trend_label,
    pmf.confidence_label,
    pmf.recent_month_values
  from ml.product_monthly_forecasts pmf
  join app.products p on p.id = pmf.product_id
  where pmf.target_month = coalesce(target_month, (select max(target_month) from ml.product_monthly_forecasts))
  order by pmf.predicted_quantity desc, pmf.predicted_revenue desc;
$$;

create or replace function public.get_monthly_service_forecasts(target_month date default null)
returns table (
  service_id uuid,
  service_code text,
  service_name text,
  target_month date,
  predicted_quantity numeric,
  predicted_revenue numeric,
  trend_label text,
  confidence_label text,
  recent_month_values jsonb
)
language sql
security definer
set search_path = public, app, ml
as $$
  select
    smf.service_id,
    s.code,
    s.name,
    smf.target_month,
    smf.predicted_quantity,
    smf.predicted_revenue,
    smf.trend_label,
    smf.confidence_label,
    smf.recent_month_values
  from ml.service_monthly_forecasts smf
  join app.services s on s.id = smf.service_id
  where smf.target_month = coalesce(target_month, (select max(target_month) from ml.service_monthly_forecasts))
  order by smf.predicted_quantity desc, smf.predicted_revenue desc;
$$;

create or replace function public.get_analytics_dashboard_snapshot()
returns jsonb
language sql
security definer
set search_path = public, app, dw, ml
as $$
  select jsonb_build_object(
    'latestRefresh', (
      select jsonb_build_object(
        'id', ar.id,
        'status', ar.status,
        'startedAt', ar.started_at,
        'endedAt', ar.ended_at,
        'dimensionRows', ar.dimension_rows,
        'factRows', ar.fact_rows,
        'ruleRows', ar.rule_rows,
        'forecastRows', ar.forecast_rows
      )
      from app.analytics_refresh_runs ar
      order by ar.started_at desc
      limit 1
    ),
    'topUpsellOpportunities', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.lift desc), '[]'::jsonb)
      from (
        select *
        from ml.v_top_upsell_opportunities
        order by lift desc, confidence desc
        limit 5
      ) t
    ),
    'predictedLowStockRisk', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.predicted_quantity desc), '[]'::jsonb)
      from (
        select *
        from ml.v_predicted_low_stock_risk
        where risk_level in ('critical', 'high', 'medium')
        limit 5
      ) r
    ),
    'topProductForecasts', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.predicted_quantity desc), '[]'::jsonb)
      from (
        select *
        from public.get_monthly_product_forecasts(null)
        limit 5
      ) f
    ),
    'topServiceForecasts', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.predicted_quantity desc), '[]'::jsonb)
      from (
        select *
        from public.get_monthly_service_forecasts(null)
        limit 5
      ) f
    )
  );
$$;

-- Source: 20260316_000005_catalog_rpc.sql

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

